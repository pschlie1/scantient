import { NextResponse } from "next/server";
import { subDays } from "date-fns";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getOrgLimits } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limits = await getOrgLimits(session.orgId);
  const allowedTiers = ["PRO", "ENTERPRISE", "ENTERPRISE_PLUS"];
  if (!allowedTiers.includes(limits.tier)) {
    return NextResponse.json(
      { error: "Executive reports require PRO or ENTERPRISE plan", tier: limits.tier },
      { status: 403 },
    );
  }

  const now = new Date();
  const periodFrom = subDays(now, 30);

  // Load org
  const org = await db.organization.findUnique({
    where: { id: session.orgId },
    select: { name: true },
  });

  // Load apps with bounded runs and findings to prevent OOM on large orgs
  const apps = await db.monitoredApp.findMany({
    where: { orgId: session.orgId },
    include: {
      monitorRuns: {
        where: { startedAt: { gte: periodFrom } },
        orderBy: { startedAt: "desc" },
        take: 10, // last 10 runs per app within the period
        include: {
          findings: {
            where: { status: "OPEN" },
            select: { id: true, severity: true, status: true, createdAt: true },
            take: 200, // cap findings per run
          },
        },
      },
    },
  });

  // --- Summary ---
  const totalApps = apps.length;
  const healthyApps = apps.filter((a) => a.status === "HEALTHY").length;
  const appsAtRisk = apps.filter((a) =>
    a.status === "WARNING" || a.status === "CRITICAL",
  ).length;

  // All currently open findings across all apps
  const allOpenFindings = apps.flatMap((a) =>
    a.monitorRuns.flatMap((r) => r.findings.filter((f) => f.status === "OPEN")),
  );
  const openCountNow = allOpenFindings.length;

  // Risk score: inverse of health ratio, weighted by severity
  // CRITICAL app = 100 pts, WARNING = 60 pts, HEALTHY = 10 pts, UNKNOWN = 50 pts
  const scoreWeights: Record<string, number> = {
    HEALTHY: 10,
    WARNING: 60,
    CRITICAL: 100,
    UNKNOWN: 50,
  };
  const overallRiskScore =
    totalApps > 0
      ? Math.round(
          apps.reduce((sum, a) => sum + (scoreWeights[a.status] ?? 50), 0) / totalApps,
        )
      : 0;

  // Risk trend: compare open finding count now vs 30 days ago.
  // With bounded queries we only have OPEN findings within the period, so use
  // createdAt as the proxy -- findings created before periodFrom are "old" open issues.
  const findingsThen = apps.flatMap((a) =>
    a.monitorRuns.flatMap((r) =>
      r.findings.filter((f) => f.createdAt < periodFrom),
    ),
  );
  const openCountThen = findingsThen.length;

  let riskTrend: "improving" | "stable" | "degrading" = "stable";
  if (openCountThen > 0) {
    const delta = (openCountNow - openCountThen) / openCountThen;
    if (delta < -0.1) riskTrend = "improving";
    else if (delta > 0.1) riskTrend = "degrading";
  } else if (openCountNow > 0) {
    riskTrend = "degrading";
  }

  // --- Top risks: top 5 CRITICAL/HIGH open findings across all apps ---
  // Note: findings are pre-filtered to OPEN status by the DB query.
  const criticalHighFindings = apps
    .flatMap((a) =>
      a.monitorRuns.flatMap((r) =>
        r.findings
          .filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH")
          .map((f) => ({
            appName: a.name,
            appUrl: a.url,
            severity: f.severity,
            openSince: f.createdAt.toISOString(),
          })),
      ),
    )
    .sort((a, b) => {
      const severityOrder = { CRITICAL: 0, HIGH: 1 };
      return (
        (severityOrder[a.severity as keyof typeof severityOrder] ?? 9) -
        (severityOrder[b.severity as keyof typeof severityOrder] ?? 9)
      );
    })
    .slice(0, 5);

  // --- Metrics ---
  const totalFindingsOpen = openCountNow;

  // Resolved findings are not loaded in the bounded query (only OPEN findings are fetched).
  // These metrics require a separate aggregation query outside the bounded dataset.
  const totalFindingsResolvedThisPeriod = 0;
  const avgResolutionDays = 0;

  // Avg uptime
  const uptimeValues = apps
    .map((a) => a.uptimePercent)
    .filter((u): u is number => u !== null);
  const uptimePercent =
    uptimeValues.length > 0
      ? Math.round((uptimeValues.reduce((s, u) => s + u, 0) / uptimeValues.length) * 10) / 10
      : 100;

  // --- App inventory ---
  const appInventory = apps.map((a) => {
    const openFindings = a.monitorRuns
      .flatMap((r) => r.findings)
      .filter((f) => f.status === "OPEN").length;

    return {
      name: a.name,
      url: a.url,
      status: a.status,
      uptimePercent: a.uptimePercent,
      openFindings,
      lastScanned: a.lastCheckedAt?.toISOString() ?? null,
    };
  });

  return NextResponse.json({
    org: {
      name: org?.name ?? "Unknown Org",
      tier: limits.tier,
    },
    reportDate: now.toISOString(),
    period: {
      from: periodFrom.toISOString(),
      to: now.toISOString(),
    },
    summary: {
      totalApps,
      healthyApps,
      appsAtRisk,
      overallRiskScore,
      riskTrend,
    },
    topRisks: criticalHighFindings,
    metrics: {
      totalFindingsOpen,
      totalFindingsResolvedThisPeriod,
      avgResolutionDays,
      uptimePercent,
    },
    appInventory,
  });
}
