import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logApiError } from "@/lib/observability";

const CRON_STALE_MINUTES = Number(process.env.HEALTH_CRON_STALE_MINUTES ?? "360");

export async function GET() {
  try {
    const dbStartedAt = Date.now();
    await db.$queryRaw`SELECT 1`;
    const dbLatencyMs = Date.now() - dbStartedAt;

    const appCount = await db.monitoredApp.count();
    const lastRun = await db.monitorRun.findFirst({
      orderBy: { startedAt: "desc" },
      select: { startedAt: true, status: true },
    });

    const now = Date.now();
    const lastScanAt = lastRun?.startedAt ? new Date(lastRun.startedAt).getTime() : null;
    const cronFreshnessMinutes = lastScanAt ? Math.floor((now - lastScanAt) / 60000) : null;

    const checks = {
      database: {
        status: "pass",
        latencyMs: dbLatencyMs,
      },
      cron: {
        status:
          cronFreshnessMinutes === null || cronFreshnessMinutes <= CRON_STALE_MINUTES
            ? "pass"
            : "warn",
        freshnessMinutes: cronFreshnessMinutes,
        staleThresholdMinutes: CRON_STALE_MINUTES,
      },
    };

    const overallStatus = checks.cron.status === "warn" ? "degraded" : "healthy";

    return NextResponse.json({
      status: overallStatus,
      version: process.env.npm_package_version ?? "0.1.0",
      monitoredApps: appCount,
      lastScan: lastRun ? { at: lastRun.startedAt, status: lastRun.status } : null,
      checks,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logApiError(error, {
      route: "/api/health",
      method: "GET",
      statusCode: 500,
    });

    return NextResponse.json(
      {
        status: "unhealthy",
        error: "Health check failed",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
