export const dynamic = "force-dynamic";

import Link from "next/link";
import { subDays, format } from "date-fns";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getOrgLimits } from "@/lib/tenant";
import { StatusBadge, SeverityBadge } from "@/components/status-badge";
import { hasFeature } from "@/lib/tier-capabilities";
import { PrintButton } from "./print-button";

export default async function ExecutiveReportPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const limits = await getOrgLimits(session.orgId);

  if (!hasFeature(limits.tier, "executiveReports")) {
    return (
      <div className="mx-auto max-w-3xl py-16 text-center">
        <div className="rounded-lg border bg-surface p-12 shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-warning/10 text-2xl">
            🔒
          </div>
          <h1 className="text-2xl font-bold text-heading">Executive Reports</h1>
          <p className="mt-3 text-muted">
            Executive board reports are available on the{" "}
            <strong>Pro or Enterprise</strong> plan.
          </p>
          <p className="mt-1 text-sm text-muted">
            You&apos;re currently on the{" "}
            <span className="font-medium capitalize">{limits.tier.toLowerCase()}</span> plan.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link
              href="/settings/billing"
              className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover transition-colors"
            >
              Upgrade your plan
            </Link>
            <Link
              href="/reports"
              className="text-sm text-muted hover:text-heading"
            >
              ← Back to reports
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const now = new Date();
  const periodFrom = subDays(now, 30);

  const org = await db.organization.findUnique({
    where: { id: session.orgId },
    select: { name: true },
  });

  const apps = await db.monitoredApp.findMany({
    where: { orgId: session.orgId },
    include: {
      monitorRuns: {
        include: { findings: true },
        orderBy: { startedAt: "desc" },
      },
    },
  });

  // --- Compute summary ---
  const totalApps = apps.length;
  const healthyApps = apps.filter((a) => a.status === "HEALTHY").length;
  const appsAtRisk = apps.filter(
    (a) => a.status === "WARNING" || a.status === "CRITICAL",
  ).length;

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

  const allOpenFindings = apps.flatMap((a) =>
    a.monitorRuns.flatMap((r) => r.findings.filter((f) => f.status === "OPEN")),
  );
  const openCountNow = allOpenFindings.length;

  const findingsThen = apps.flatMap((a) =>
    a.monitorRuns.flatMap((r) =>
      r.findings.filter(
        (f) =>
          f.createdAt < periodFrom &&
          (f.status !== "RESOLVED" ||
            (f.resolvedAt !== null && f.resolvedAt > periodFrom)),
      ),
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

  // Top risks
  const topRisks = apps
    .flatMap((a) =>
      a.monitorRuns.flatMap((r) =>
        r.findings
          .filter(
            (f) =>
              f.status === "OPEN" &&
              (f.severity === "CRITICAL" || f.severity === "HIGH"),
          )
          .map((f) => ({
            appName: a.name,
            appUrl: a.url,
            severity: f.severity,
            title: f.title,
            openSince: f.createdAt,
          })),
      ),
    )
    .sort((a, b) => {
      const order = { CRITICAL: 0, HIGH: 1 };
      return (order[a.severity as keyof typeof order] ?? 9) - (order[b.severity as keyof typeof order] ?? 9);
    })
    .slice(0, 5);

  // Metrics
  const resolvedThisPeriod = apps.flatMap((a) =>
    a.monitorRuns.flatMap((r) =>
      r.findings.filter(
        (f) => f.status === "RESOLVED" && f.resolvedAt !== null && f.resolvedAt >= periodFrom,
      ),
    ),
  );
  const avgResolutionDays =
    resolvedThisPeriod.length > 0
      ? Math.round(
          resolvedThisPeriod
            .filter((f) => f.resolvedAt)
            .reduce((s, f) => s + (f.resolvedAt!.getTime() - f.createdAt.getTime()), 0) /
            resolvedThisPeriod.length /
            (1000 * 60 * 60 * 24),
        )
      : 0;

  const uptimeValues = apps.map((a) => a.uptimePercent).filter((u): u is number => u !== null);
  const avgUptime =
    uptimeValues.length > 0
      ? Math.round((uptimeValues.reduce((s, u) => s + u, 0) / uptimeValues.length) * 10) / 10
      : 100;

  // App inventory
  const appInventory = apps.map((a) => ({
    name: a.name,
    url: a.url,
    status: a.status,
    uptimePercent: a.uptimePercent,
    openFindings: a.monitorRuns.flatMap((r) => r.findings).filter((f) => f.status === "OPEN").length,
    lastScanned: a.lastCheckedAt,
  }));

  // Risk score color
  const riskColor =
    overallRiskScore < 30
      ? "text-success"
      : overallRiskScore <= 60
        ? "text-warning"
        : "text-error";

  const trendConfig = {
    improving: { label: "↓ Improving", className: "bg-success/10 text-success" },
    stable: { label: "→ Stable", className: "bg-warning/10 text-warning" },
    degrading: { label: "↑ Degrading", className: "bg-error/10 text-error" },
  }[riskTrend];

  return (
    <div className="py-8 print:px-0">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between print:mb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-black tracking-tight text-heading">VibeSafe</span>
            <span className="rounded bg-surface-raised px-2 py-0.5 text-xs font-medium text-muted">
              Executive Report
            </span>
          </div>
          <h1 className="mt-1 text-xl font-semibold text-heading">{org?.name}</h1>
          <p className="mt-0.5 text-sm text-muted">
            {format(periodFrom, "MMM d")} – {format(now, "MMM d, yyyy")} · Generated {format(now, "PPP")}
          </p>
          <p className="mt-1 text-xs font-medium uppercase tracking-wider text-muted">
            Confidential - Internal Use Only
          </p>
        </div>
        <div className="flex items-center gap-3 print:hidden">
          <PrintButton />
          <Link
            href="/reports"
            className="text-sm text-muted hover:text-heading"
          >
            ← Back
          </Link>
        </div>
      </div>

      {/* Risk Score + Trend */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="col-span-1 rounded-lg border bg-surface p-6 text-center shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Overall Risk Score</p>
          <p className={`mt-2 text-5xl font-extrabold ${riskColor}`}>{overallRiskScore}</p>
          <p className="mt-1 text-xs text-muted">out of 100</p>
          <span className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-semibold ${trendConfig.className}`}>
            {trendConfig.label}
          </span>
        </div>
        <MetricCard label="Apps Monitored" value={totalApps} />
        <MetricCard label="Apps at Risk" value={appsAtRisk} accent={appsAtRisk > 0 ? "text-error" : undefined} />
        <MetricCard label="Open Findings" value={openCountNow} accent={openCountNow > 0 ? "text-warning" : undefined} />
      </div>

      {/* Additional metrics */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Healthy Apps" value={healthyApps} accent="text-success" />
        <MetricCard label="Resolved (30d)" value={resolvedThisPeriod.length} accent="text-info" />
        <MetricCard label="Avg Resolution" value={`${avgResolutionDays}d`} />
        <MetricCard label="Avg Uptime" value={`${avgUptime}%`} accent={avgUptime >= 99 ? "text-success" : avgUptime >= 95 ? "text-warning" : "text-error"} />
      </div>

      {/* Top risks table */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-heading">Top Security Risks</h2>
        {topRisks.length === 0 ? (
          <div className="rounded-lg border bg-surface p-6 text-center text-sm text-muted">
            ✅ No critical or high severity open findings.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-surface-raised text-xs font-medium uppercase tracking-wider text-muted">
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Finding</th>
                  <th className="px-4 py-3">App</th>
                  <th className="px-4 py-3">Open Since</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {topRisks.map((r, i) => (
                  <tr key={i} className="hover:bg-surface-raised">
                    <td className="px-4 py-3">
                      <SeverityBadge severity={r.severity} />
                    </td>
                    <td className="px-4 py-3 font-medium text-heading">{r.title}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium">{r.appName}</span>
                      <p className="max-w-[180px] truncate text-xs text-muted">{r.appUrl}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {format(r.openSince, "MMM d, yyyy")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* App inventory table */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-heading">App Inventory</h2>
        {appInventory.length === 0 ? (
          <div className="rounded-lg border bg-surface p-6 text-center text-sm text-muted">
            No apps registered yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-surface-raised text-xs font-medium uppercase tracking-wider text-muted">
                  <th className="px-4 py-3">App</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Uptime</th>
                  <th className="px-4 py-3">Open Findings</th>
                  <th className="px-4 py-3">Last Scanned</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {appInventory.map((app, i) => (
                  <tr key={i} className="hover:bg-surface-raised">
                    <td className="px-4 py-3">
                      <span className="font-medium text-heading">{app.name}</span>
                      <p className="max-w-[200px] truncate text-xs text-muted">{app.url}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={app.status} />
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {app.uptimePercent !== null ? `${app.uptimePercent}%` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {app.openFindings > 0 ? (
                        <span className="text-sm font-semibold text-error">{app.openFindings}</span>
                      ) : (
                        <span className="text-sm text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {app.lastScanned ? format(app.lastScanned, "MMM d, yyyy") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Footer */}
      <div className="border-t pt-6 text-center text-xs text-muted">
        <p>Generated by VibeSafe · {format(now, "PPPp")} UTC</p>
        <p className="mt-1">Confidential - For internal and board use only</p>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border bg-surface p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${accent ?? "text-heading"}`}>{value}</p>
    </div>
  );
}
