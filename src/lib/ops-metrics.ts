import { db } from "@/lib/db";

export interface OpsKpis {
  scanSuccessRatePct: number;
  scanLatencyP95Ms: number | null;
  scanRunsLast24h: number;
  staleAppsCount: number;
  missedScanWindowsCount: number;
  alertDeliverySuccessRatePct: number | null;
  alertsSentLast7d: number;
  generatedAt: string;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export async function getOrgOpsKpis(orgId: string): Promise<OpsKpis> {
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const staleThreshold = new Date(now.getTime() - 26 * 60 * 60 * 1000);

  const [runs24h, apps, notifications] = await Promise.all([
    db.monitorRun.findMany({
      where: {
        startedAt: { gte: since24h },
        app: { orgId },
      },
      select: { status: true, responseTimeMs: true },
    }),
    db.monitoredApp.findMany({
      where: { orgId },
      select: { lastCheckedAt: true, nextCheckAt: true },
    }),
    db.notification.findMany({
      where: {
        sentAt: { gte: since7d },
        alertConfig: { orgId },
      },
      select: { delivered: true },
    }),
  ]);

  const successfulRuns = runs24h.filter((r) => r.status !== "CRITICAL").length;
  const responseTimes = runs24h
    .map((r) => r.responseTimeMs)
    .filter((v): v is number => typeof v === "number" && v > 0);

  const staleAppsCount = apps.filter((a) => !a.lastCheckedAt || a.lastCheckedAt < staleThreshold).length;
  const missedScanWindowsCount = apps.filter((a) => a.nextCheckAt && a.nextCheckAt < now).length;

  const delivered = notifications.filter((n) => n.delivered).length;

  return {
    scanSuccessRatePct: runs24h.length ? Math.round((successfulRuns / runs24h.length) * 100) : 100,
    scanLatencyP95Ms: percentile(responseTimes, 95),
    scanRunsLast24h: runs24h.length,
    staleAppsCount,
    missedScanWindowsCount,
    alertDeliverySuccessRatePct: notifications.length
      ? Math.round((delivered / notifications.length) * 100)
      : null,
    alertsSentLast7d: notifications.length,
    generatedAt: now.toISOString(),
  };
}
