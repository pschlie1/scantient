export const dynamic = "force-dynamic";

import Link from "next/link";
import { subDays, format } from "date-fns";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { StatusBadge, SeverityBadge } from "@/components/status-badge";
import { EvidencePackSection } from "./evidence-pack";

export default async function ReportsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const since = subDays(new Date(), 7);

  const apps = await db.monitoredApp.findMany({
    where: { orgId: session.orgId },
    include: {
      monitorRuns: {
        where: { startedAt: { gte: since } },
        include: { findings: { where: { status: "OPEN" } } },
        orderBy: { startedAt: "desc" },
      },
    },
  });

  const totalRuns = apps.reduce((s, a) => s + a.monitorRuns.length, 0);
  const allFindings = apps.flatMap((a) => a.monitorRuns.flatMap((r) => r.findings));
  const criticalCount = allFindings.filter((f) => f.severity === "CRITICAL").length;
  const highCount = allFindings.filter((f) => f.severity === "HIGH").length;

  return (
    <div className="py-8">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Weekly Governance Report</h1>
          <p className="text-sm text-muted">
            {format(since, "MMM d")} – {format(new Date(), "MMM d, yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/reports/executive"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-heading shadow-sm hover:bg-surface-raised transition-colors"
          >
            <svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Executive Report
          </Link>
          <a
            href="/api/reports/pdf"
            className="inline-flex items-center gap-2 rounded-lg bg-info px-4 py-2 text-sm font-medium text-white shadow hover:bg-info transition-colors"
          >
            <svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" />
            </svg>
            Download PDF Report
          </a>
        </div>
      </div>

      {/* Executive summary */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Apps monitored" value={apps.length} />
        <StatCard label="Scans run" value={totalRuns} />
        <StatCard label="Open findings" value={allFindings.length} accent={allFindings.length > 0 ? "text-error" : undefined} />
        <StatCard label="Critical" value={criticalCount} accent={criticalCount > 0 ? "text-error" : undefined} />
        <StatCard label="High" value={highCount} accent={highCount > 0 ? "text-warning" : undefined} />
      </div>

      {/* Per-app breakdown */}
      <div className="space-y-4">
        {apps.map((app) => {
          const appFindings = app.monitorRuns.flatMap((r) => r.findings);
          return (
            <div key={app.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold">{app.name}</h3>
                  <StatusBadge status={app.status} />
                </div>
                <div className="text-xs text-muted">
                  {app.monitorRuns.length} scans · {appFindings.length} open findings
                </div>
              </div>

              {appFindings.length > 0 && (
                <div className="mt-3 space-y-2">
                  {appFindings.slice(0, 5).map((f) => (
                    <div key={f.id} className="flex items-center gap-2 text-sm">
                      <SeverityBadge severity={f.severity} />
                      <span>{f.title}</span>
                    </div>
                  ))}
                  {appFindings.length > 5 && (
                    <p className="text-xs text-muted">+{appFindings.length - 5} more</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Evidence Pack */}
      <EvidencePackSection />
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ?? "text-heading"}`}>{value}</p>
    </div>
  );
}
