export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getOrgOpsKpis } from "@/lib/ops-metrics";

export default async function OpsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const kpis = await getOrgOpsKpis(session.orgId);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight">Ops health</h1>
      <p className="mt-1 text-sm text-gray-500">Org-scoped reliability KPIs for the last 24h / 7d.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard label="Scan success rate" value={`${kpis.scanSuccessRatePct}%`} />
        <MetricCard
          label="Scan latency (p95)"
          value={kpis.scanLatencyP95Ms ? `${kpis.scanLatencyP95Ms}ms` : "No data"}
        />
        <MetricCard label="Scan runs (24h)" value={String(kpis.scanRunsLast24h)} />
        <MetricCard label="Stale apps (>26h)" value={String(kpis.staleAppsCount)} />
        <MetricCard label="Missed scan windows" value={String(kpis.missedScanWindowsCount)} />
        <MetricCard
          label="Alert delivery success (7d)"
          value={
            kpis.alertDeliverySuccessRatePct === null
              ? "No alerts"
              : `${kpis.alertDeliverySuccessRatePct}%`
          }
        />
      </div>

      <p className="mt-6 text-xs text-gray-400">
        Generated at {new Date(kpis.generatedAt).toLocaleString()} · Alerts sent (7d): {kpis.alertsSentLast7d}
      </p>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}
