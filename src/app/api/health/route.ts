import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logApiError } from "@/lib/observability";

const CRON_STALE_MINUTES = Number(process.env.HEALTH_CRON_STALE_MINUTES ?? "360");

type CheckStatus = "pass" | "warn" | "fail";

export async function GET() {
  // Unauthenticated callers get only a basic liveness response
  const session = await getSession().catch(() => null);
  if (!session) {
    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  }

  const checks: {
    database: {
      status: CheckStatus;
      latencyMs: number | null;
      error?: string;
    };
    cron: {
      status: CheckStatus;
      freshnessMinutes: number | null;
      staleThresholdMinutes: number;
      error?: string;
    };
  } = {
    database: {
      status: "pass",
      latencyMs: null,
    },
    cron: {
      status: "pass",
      freshnessMinutes: null,
      staleThresholdMinutes: CRON_STALE_MINUTES,
    },
  };

  let appCount = 0;
  let lastScan: { at: Date; status: string } | null = null;

  try {
    const dbStartedAt = Date.now();
    await db.$queryRaw`SELECT 1`;
    checks.database.latencyMs = Date.now() - dbStartedAt;

    appCount = await db.monitoredApp.count();

    const lastRun = await db.monitorRun.findFirst({
      orderBy: { startedAt: "desc" },
      select: { startedAt: true, status: true },
    });

    lastScan = lastRun ? { at: lastRun.startedAt, status: lastRun.status } : null;

    if (lastRun?.startedAt) {
      const freshnessMinutes = Math.floor((Date.now() - new Date(lastRun.startedAt).getTime()) / 60000);
      checks.cron.freshnessMinutes = freshnessMinutes;
      if (freshnessMinutes > CRON_STALE_MINUTES) {
        checks.cron.status = "warn";
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    checks.database.status = "fail";
    checks.database.error = message;
    checks.cron.status = "warn";
    checks.cron.error = "Skipped because database check failed";

    logApiError(error, {
      route: "/api/health",
      method: "GET",
      statusCode: 200,
    });
  }

  const overallStatus: "healthy" | "degraded" =
    checks.database.status === "pass" && checks.cron.status === "pass" ? "healthy" : "degraded";

  return NextResponse.json({
    status: overallStatus,
    version: process.env.npm_package_version ?? "0.1.0",
    monitoredApps: appCount,
    lastScan,
    checks,
    timestamp: new Date().toISOString(),
  });
}
