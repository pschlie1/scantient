export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getOrgLimits } from "@/lib/tenant";
import { db } from "@/lib/db";
import { PrintButton } from "@/components/print-button";

const SEVERITY_DEDUCTION: Record<string, number> = {
  CRITICAL: 25,
  HIGH: 15,
  MEDIUM: 5,
  LOW: 2,
};

function computeAppScore(findings: Array<{ severity: string; status: string }>): number {
  const openFindings = findings.filter((f) => f.status === "OPEN");
  const deduction = openFindings.reduce(
    (sum, f) => sum + (SEVERITY_DEDUCTION[f.severity] ?? 0),
    0,
  );
  return Math.max(0, 100 - deduction);
}

export default async function PortfolioPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const limits = await getOrgLimits(session.orgId);

  // Gate behind PRO or ENTERPRISE
  if (!["PRO", "ENTERPRISE"].includes(limits.tier)) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6 text-center">
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-12">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 text-3xl">
            📊
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Portfolio Risk Overview</h1>
          <p className="mt-3 text-gray-500">
            The Portfolio dashboard is available on PRO and ENTERPRISE plans. Upgrade to get
            board-ready risk visibility across all your apps.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/#pricing"
              className="rounded-lg bg-black px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Upgrade to PRO →
            </Link>
            <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">
              Back to dashboard
            </Link>
          </div>
          <p className="mt-4 text-xs text-gray-400">
            Current plan: <strong>{limits.tier}</strong>
          </p>
        </div>
      </main>
    );
  }

  // Fetch all app data for the org
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const apps = await db.monitoredApp.findMany({
    where: { orgId: session.orgId },
    orderBy: { createdAt: "desc" },
    include: {
      monitorRuns: {
        orderBy: { startedAt: "desc" },
        take: 1,
        include: {
          findings: {
            select: { severity: true, status: true },
          },
        },
      },
    },
  });

  // Get org info
  const org = await db.organization.findUnique({
    where: { id: session.orgId },
    select: { name: true },
  });

  // Trend: findings resolved this month vs created this month
  const [resolvedThisMonth, newThisMonth, resolvedLastMonth, newLastMonth] = await Promise.all([
    db.finding.count({
      where: {
        status: "RESOLVED",
        resolvedAt: { gte: startOfMonth },
        run: { app: { orgId: session.orgId } },
      },
    }),
    db.finding.count({
      where: {
        createdAt: { gte: startOfMonth },
        run: { app: { orgId: session.orgId } },
      },
    }),
    db.finding.count({
      where: {
        status: "RESOLVED",
        resolvedAt: { gte: prevMonthStart, lt: startOfMonth },
        run: { app: { orgId: session.orgId } },
      },
    }),
    db.finding.count({
      where: {
        createdAt: { gte: prevMonthStart, lt: startOfMonth },
        run: { app: { orgId: session.orgId } },
      },
    }),
  ]);

  // Compute per-app metrics
  const appMetrics = apps.map((app) => {
    const run = app.monitorRuns[0];
    const findings = run?.findings ?? [];
    const openFindings = findings.filter((f) => f.status === "OPEN");
    const criticalCount = openFindings.filter((f) => f.severity === "CRITICAL").length;
    const score = computeAppScore(findings);

    return {
      id: app.id,
      name: app.name,
      url: app.url,
      status: app.status,
      criticality: app.criticality,
      score,
      openFindings: openFindings.length,
      criticalCount,
      uptimePercent: app.uptimePercent,
      lastScan: app.lastCheckedAt,
      owner: app.ownerEmail,
    };
  });

  // Summary metrics
  const totalApps = apps.length;
  const appsAtRisk = appMetrics.filter((a) => a.score < 70).length;
  const openCritical = appMetrics.reduce((sum, a) => sum + a.criticalCount, 0);
  const avgScore =
    appMetrics.length > 0
      ? Math.round(appMetrics.reduce((sum, a) => sum + a.score, 0) / appMetrics.length)
      : 0;

  // Risk matrix: high criticality = ["high","critical"], high score = >=70
  const highCritApps = appMetrics.filter((a) =>
    ["high", "critical"].includes(a.criticality.toLowerCase()),
  );
  const lowCritApps = appMetrics.filter(
    (a) => !["high", "critical"].includes(a.criticality.toLowerCase()),
  );

  const quadrants = {
    // High criticality + high score = well-protected important apps
    topRight: highCritApps.filter((a) => a.score >= 70),
    // High criticality + low score = urgent risk
    topLeft: highCritApps.filter((a) => a.score < 70),
    // Low criticality + high score = healthy low-risk apps
    bottomRight: lowCritApps.filter((a) => a.score >= 70),
    // Low criticality + low score = low-priority risk
    bottomLeft: lowCritApps.filter((a) => a.score < 70),
  };

  // Sort app risk table by score ascending (worst first)
  const sortedApps = [...appMetrics].sort((a, b) => a.score - b.score);

  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      <style>{`
        @media print {
          nav { display: none !important; }
          .no-print { display: none !important; }
          main { padding: 0 !important; }
          .print-break { page-break-before: always; }
          table { width: 100%; }
        }
      `}</style>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              Portfolio Risk Overview
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {org?.name} · {dateStr}
            </p>
          </div>
          <div className="no-print flex items-center gap-3">
            <PrintButton />
          </div>
        </div>

        {/* Top metrics row */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MetricCard
            label="Total Apps"
            value={String(totalApps)}
            color="text-gray-900"
          />
          <MetricCard
            label="Apps at Risk"
            value={String(appsAtRisk)}
            color={appsAtRisk > 0 ? "text-orange-600" : "text-green-600"}
            sub={appsAtRisk > 0 ? "score < 70" : "All healthy"}
          />
          <MetricCard
            label="Open Critical Findings"
            value={String(openCritical)}
            color={openCritical > 0 ? "text-red-600" : "text-green-600"}
          />
          <MetricCard
            label="Avg Security Score"
            value={`${avgScore}/100`}
            color={avgScore >= 80 ? "text-green-600" : avgScore >= 50 ? "text-yellow-600" : "text-red-600"}
          />
        </div>

        {/* Risk Matrix */}
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Risk Matrix</h2>
          <div className="grid grid-cols-2 gap-0 overflow-hidden rounded-xl border border-gray-200">
            {/* Header row labels */}
            <div className="col-span-2 grid grid-cols-2 border-b">
              <div className="px-4 py-2 text-center text-xs font-medium text-gray-500 border-r">
                ← Low Security Score (&lt;70)
              </div>
              <div className="px-4 py-2 text-center text-xs font-medium text-gray-500">
                High Security Score (≥70) →
              </div>
            </div>

            {/* Top-left: High crit, low score — URGENT */}
            <RiskQuadrant
              title="⚠️ High Risk"
              sub="High criticality · Low score"
              apps={quadrants.topLeft}
              className="border-r border-b bg-red-50"
            />

            {/* Top-right: High crit, high score — PROTECTED */}
            <RiskQuadrant
              title="✅ Well Protected"
              sub="High criticality · High score"
              apps={quadrants.topRight}
              className="border-b bg-green-50"
            />

            {/* Bottom-left: Low crit, low score — MONITOR */}
            <RiskQuadrant
              title="🔍 Monitor"
              sub="Low criticality · Low score"
              apps={quadrants.bottomLeft}
              className="border-r bg-yellow-50"
            />

            {/* Bottom-right: Low crit, high score — HEALTHY */}
            <RiskQuadrant
              title="💚 Healthy"
              sub="Low criticality · High score"
              apps={quadrants.bottomRight}
              className="bg-gray-50"
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-gray-400">
            <span>↑ High Criticality</span>
            <span>↓ Low Criticality</span>
          </div>
        </section>

        {/* App Risk Table */}
        <section className="mb-8 print-break">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">App Risk Table</h2>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">App Name</th>
                  <th className="px-4 py-3">URL</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Open Findings</th>
                  <th className="px-4 py-3">Uptime %</th>
                  <th className="px-4 py-3">Last Scan</th>
                  <th className="px-4 py-3">Owner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedApps.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                      No apps registered yet.{" "}
                      <Link href="/dashboard" className="text-black underline">
                        Add your first app
                      </Link>
                    </td>
                  </tr>
                ) : (
                  sortedApps.map((app) => (
                    <tr key={app.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/apps/${app.id}`}
                          className="font-medium text-gray-900 hover:underline"
                        >
                          {app.name}
                        </Link>
                      </td>
                      <td className="max-w-[150px] truncate px-4 py-3 text-xs text-gray-400">
                        {app.url}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={app.status} />
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`font-semibold ${
                            app.score >= 80
                              ? "text-green-600"
                              : app.score >= 50
                              ? "text-yellow-600"
                              : "text-red-600"
                          }`}
                        >
                          {app.score}
                        </span>
                        <span className="text-xs text-gray-400">/100</span>
                      </td>
                      <td className="px-4 py-3">
                        {app.openFindings > 0 ? (
                          <span className="text-xs">
                            <span className="font-semibold text-red-600">{app.criticalCount}</span>
                            <span className="text-gray-400"> crit / </span>
                            <span className="font-medium">{app.openFindings}</span>
                            <span className="text-gray-400"> total</span>
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {app.uptimePercent !== null && app.uptimePercent !== undefined
                          ? `${app.uptimePercent.toFixed(1)}%`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {app.lastScan
                          ? new Date(app.lastScan).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "Never"}
                      </td>
                      <td className="max-w-[150px] truncate px-4 py-3 text-xs text-gray-500">
                        {app.owner}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Trend Section */}
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Trends This Month</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Findings Resolved
              </p>
              <p className="mt-2 text-4xl font-bold text-green-600">{resolvedThisMonth}</p>
              <p className="mt-1 text-xs text-gray-400">
                vs {resolvedLastMonth} last month
                {resolvedLastMonth > 0 && (
                  <span className={resolvedThisMonth >= resolvedLastMonth ? " text-green-500" : " text-red-500"}>
                    {" "}
                    ({resolvedThisMonth >= resolvedLastMonth ? "+" : ""}
                    {resolvedThisMonth - resolvedLastMonth})
                  </span>
                )}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                New Findings
              </p>
              <p className={`mt-2 text-4xl font-bold ${newThisMonth > 0 ? "text-orange-600" : "text-green-600"}`}>
                {newThisMonth}
              </p>
              <p className="mt-1 text-xs text-gray-400">
                vs {newLastMonth} last month
                {newLastMonth > 0 && (
                  <span className={newThisMonth <= newLastMonth ? " text-green-500" : " text-red-500"}>
                    {" "}
                    ({newThisMonth <= newLastMonth ? "" : "+"}
                    {newThisMonth - newLastMonth})
                  </span>
                )}
              </p>
            </div>
          </div>
        </section>

        <p className="text-xs text-gray-400">
          Generated {now.toLocaleString()} · {limits.tier} plan · {totalApps} apps monitored
        </p>
      </main>
    </>
  );
}

function MetricCard({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function RiskQuadrant({
  title,
  sub,
  apps,
  className,
}: {
  title: string;
  sub: string;
  apps: Array<{ id: string; name: string; score: number }>;
  className?: string;
}) {
  return (
    <div className={`min-h-[140px] p-4 ${className ?? ""}`}>
      <p className="text-xs font-bold text-gray-700">{title}</p>
      <p className="mb-3 text-xs text-gray-500">{sub}</p>
      {apps.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No apps</p>
      ) : (
        <ul className="space-y-1">
          {apps.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2">
              <Link
                href={`/apps/${a.id}`}
                className="truncate text-xs font-medium text-gray-800 hover:underline"
              >
                {a.name}
              </Link>
              <span className="shrink-0 text-xs text-gray-500">{a.score}/100</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    HEALTHY: "bg-green-100 text-green-700",
    WARNING: "bg-yellow-100 text-yellow-700",
    CRITICAL: "bg-red-100 text-red-700",
    UNKNOWN: "bg-gray-100 text-gray-500",
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${colors[status] ?? colors.UNKNOWN}`}
    >
      {status.toLowerCase()}
    </span>
  );
}
