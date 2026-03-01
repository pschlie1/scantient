import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-auth";
import { runHttpScanForApp } from "@/lib/scanner-http";
import { checkRateLimit } from "@/lib/rate-limit";
import { getOrgLimits } from "@/lib/tenant";

const SCAN_RATE_LIMITS: Record<string, number> = {
  FREE: 3,
  STARTER: 10,
  PRO: 50,
  ENTERPRISE: 200,
  ENTERPRISE_PLUS: 200,
};

const scanSchema = z.union([
  z.object({ appId: z.string().min(1), url: z.undefined().optional() }),
  z.object({ url: z.string().url(), appId: z.undefined().optional() }),
]);

export async function POST(req: Request) {
  const orgId = await authenticateApiKey(req);
  if (!orgId) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  // Tier-based rate limit — shared bucket with UI manual scans to prevent bypass
  const limits = await getOrgLimits(orgId);
  const maxScans = SCAN_RATE_LIMITS[limits.tier] ?? SCAN_RATE_LIMITS.FREE;
  const rateLimit = await checkRateLimit(`manual-scan:${orgId}`, {
    maxAttempts: maxScans,
    windowMs: 24 * 60 * 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: `Scan limit reached. Your ${limits.tier} plan allows ${maxScans} scans per day.` },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds ?? 3600) },
      },
    );
  }

  const body = await req.json();
  const parsed = scanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Provide either appId or url" },
      { status: 400 },
    );
  }

  let appId: string;

  if (parsed.data.appId) {
    // Verify app belongs to the authenticated org
    const app = await db.monitoredApp.findFirst({
      where: { id: parsed.data.appId, orgId },
    });
    if (!app) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }
    appId = app.id;
  } else {
    // Look up app by url + orgId
    const app = await db.monitoredApp.findFirst({
      where: { url: parsed.data.url, orgId },
    });
    if (!app) {
      return NextResponse.json({ error: "App not found for the given URL" }, { status: 404 });
    }
    appId = app.id;
  }

  try {
    const result = await runHttpScanForApp(appId, { source: "api" });
    return NextResponse.json({
      scanId: result.runId,
      appId: result.appId,
      status: result.status,
      findingsCount: result.findingsCount,
      responseTimeMs: result.responseTimeMs,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scan failed" },
      { status: 500 },
    );
  }
}
