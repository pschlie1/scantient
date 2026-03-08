export const dynamic = "force-dynamic";

import Link from "next/link";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { relativeTime } from "@/lib/time";
import { NewAppForm } from "@/components/new-app-form";
import { ScanButton } from "@/components/scan-button";
import { StatusBadge } from "@/components/status-badge";
import { SummaryCards } from "@/components/summary-cards";
import { getOrgLimits } from "@/lib/tenant";
import { OnboardingWrapper } from "@/components/onboarding-wrapper";
import { MetricsDashboard } from "@/components/metrics-dashboard";
import { SpaBanner } from "@/components/spa-disclaimer-banner";


export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const apps = await db.monitoredApp.findMany({
    where: { orgId: session.orgId },
    orderBy: { createdAt: "desc" },
    include: {
      monitorRuns: {
        orderBy: { startedAt: "desc" },
        include: { findings: true },
        take: 1,
      },
    },
  });

  const limits = await getOrgLimits(session.orgId);

  const healthy = apps.filter((a) => a.status === "HEALTHY").length;
  const warning = apps.filter((a) => a.status === "WARNING").length;
  const critical = apps.filter((a) => a.status === "CRITICAL").length;
  const totalFindings = apps.reduce(
    (sum, a) => sum + (a.monitorRuns[0]?.findings.filter((f) => f.status === "OPEN").length ?? 0),
    0,
  );

  return (
    <>
      <OnboardingWrapper hasApps={apps.length > 0} />
    <div className="py-8">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-heading">Portfolio</h1>
          <p className="text-sm text-body">
            {apps.length} of {limits.maxApps} apps monitored · {limits.tier} plan
          </p>
        </div>
      </div>

      <OnboardingChecklist />

      <MetricsDashboard />

      <SummaryCards
        total={apps.length}
        healthy={healthy}
        warning={warning}
        critical={critical}
        totalFindings={totalFindings}
      />

      <SpaBanner />

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 rounded-lg border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Monitored apps</h2>
            <Link
              href="/apps/bulk-add"
              className="rounded-md border border-border px-3 py-1 text-xs font-medium text-heading transition hover:bg-surface-raised hover:text-heading"
            >
              + Bulk Add
            </Link>
          </div>

          {apps.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-muted">Ready to secure your apps? Add your first app to start monitoring. You'll get your first security scan in under 60 seconds — no setup required.</p>
              <div className="mt-4 flex items-center justify-center gap-3">
                <Link
                  href="/apps/bulk-add"
                  className="rounded-md bg-prussian-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-prussian-blue-700"
                >
                  Bulk Add Apps
                </Link>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b bg-surface-raised text-xs font-medium uppercase tracking-wider text-muted">
                    <th className="px-4 py-2">App</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Criticality</th>
                    <th className="px-4 py-2">Last scan</th>
                    <th className="px-4 py-2">Findings</th>
                    <th className="px-4 py-2">Response</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {apps.map((app) => {
                    const run = app.monitorRuns[0];
                    const findingsCount = run?.findings.length ?? 0;
                    const critCount =
                      run?.findings.filter((f) =>
                        ["CRITICAL", "HIGH"].includes(f.severity),
                      ).length ?? 0;

                    return (
                      <tr key={app.id} className="hover:bg-surface-raised">
                        <td className="px-4 py-3">
                          <Link
                            href={`/apps/${app.id}`}
                            className="font-medium text-heading hover:underline"
                          >
                            {app.name}
                          </Link>
                          <p className="max-w-[200px] truncate text-xs text-muted">{app.url}</p>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={app.status} />
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs capitalize text-body">
                            {app.criticality}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted">
                          {relativeTime(app.lastCheckedAt)}
                        </td>
                        <td className="px-4 py-3">
                          {findingsCount > 0 ? (
                            <span className="text-xs">
                              <span className="font-semibold text-error">{critCount}</span>
                              <span className="text-muted"> / {findingsCount}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-muted">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted">
                          {run?.responseTimeMs ? `${run.responseTimeMs}ms` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <ScanButton appId={app.id} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="min-w-0">
          <NewAppForm />
        </div>
      </div>
    </div>
    </>
  );
}
