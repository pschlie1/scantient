import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-auth";
import { runHttpScanForApp } from "@/lib/scanner-http";
import { checkRateLimit } from "@/lib/rate-limit";
import { getOrgLimits } from "@/lib/tenant";
import { applyCors, corsPreflightResponse, CORS_HEADERS_API } from "@/lib/cors";

export function OPTIONS() {
  return corsPreflightResponse(CORS_HEADERS_API);
}

const SCAN_RATE_LIMITS: Record<string, number> = {
  FREE: 3,
  STARTER: 10,
  PRO: 50,
  ENTERPRISE: 200,
  ENTERPRISE_PLUS: 200,
};

async function handler(
  req: Request,
  params: Promise<{ id: string }>,
): Promise<NextResponse> {
  const orgId = await authenticateApiKey(req);
  if (!orgId) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });

  // Tier-based rate limit (shared with manual-scan bucket)
  const limits = await getOrgLimits(orgId);
  const maxScans = SCAN_RATE_LIMITS[limits.tier] ?? SCAN_RATE_LIMITS.FREE;
  const rateResult = await checkRateLimit(`manual-scan:${orgId}`, {
    maxAttempts: maxScans,
    windowMs: 24 * 60 * 60 * 1000,
  });
  if (!rateResult.allowed) {
    return NextResponse.json(
      { error: `Scan limit reached. Your ${limits.tier} plan allows ${maxScans} scans per day.` },
      { status: 429, headers: { "Retry-After": String(rateResult.retryAfterSeconds ?? 3600) } },
    );
  }

  const { id } = await params;

  // Verify app belongs to org
  const app = await db.monitoredApp.findFirst({ where: { id, orgId } });
  if (!app) return NextResponse.json({ error: "App not found" }, { status: 404 });

  try {
    const result = await runHttpScanForApp(id, { source: "api" });
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scan failed" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return applyCors(await handler(req, params), CORS_HEADERS_API);
}
