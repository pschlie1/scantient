import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { runHttpScanForApp } from "@/lib/scanner-http";
import { trackEvent } from "@/lib/analytics";
import { checkRateLimit } from "@/lib/rate-limit";
import { getOrgLimits } from "@/lib/tenant";

const SCAN_RATE_LIMITS: Record<string, number> = {
  FREE: 3,
  STARTER: 10,
  PRO: 50,
  ENTERPRISE: 200,
  ENTERPRISE_PLUS: 200,
};

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (session.role === "VIEWER") {
    return NextResponse.json({ error: "Viewers have read-only access" }, { status: 403 });
  }

  const { id } = await params;

  // Verify app belongs to org
  const app = await db.monitoredApp.findFirst({ where: { id, orgId: session.orgId } });
  if (!app) return NextResponse.json({ error: "App not found" }, { status: 404 });

  // Per-tier rate limit on manual scans
  const limits = await getOrgLimits(session.orgId);
  const maxScans = SCAN_RATE_LIMITS[limits.tier] ?? SCAN_RATE_LIMITS.FREE;
  const rateResult = await checkRateLimit(`manual-scan:${session.orgId}`, {
    maxAttempts: maxScans,
    windowMs: 24 * 60 * 60 * 1000,
  });
  if (!rateResult.allowed) {
    const retryAfter = rateResult.retryAfterSeconds ?? 3600;
    return NextResponse.json(
      { error: `Manual scan limit reached. Your ${limits.tier} plan allows ${maxScans} manual scans per day.` },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  try {
    await trackEvent({
      event: "scan_triggered",
      orgId: session.orgId,
      userId: session.id,
      properties: { appId: id, source: "manual" },
    });

    const result = await runHttpScanForApp(id, { source: "manual", userId: session.id });
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scan failed" },
      { status: 500 },
    );
  }
}
