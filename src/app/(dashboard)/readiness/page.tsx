export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getChangeAuditReport, getGtmBaseline, getIncidentEvidenceExport, parseRange } from "@/lib/wave3-reporting";

export default async function ReadinessPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const range = parseRange({ from: null, to: null, defaultDays: 30 });
  const [incidents, changes, gtm] = await Promise.all([
    getIncidentEvidenceExport(session.orgId, range),
    getChangeAuditReport(session.orgId, range),
    getGtmBaseline(session.orgId, range),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight">Wave 3 readiness pack</h1>
      <p className="mt-1 text-sm text-gray-500">Internal baseline for compliance evidence, audit/change visibility, and GTM funnel health (last 30 days).</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Incident events" value={String(incidents.summary.timelineEvents)} />
        <Metric label="Alert failures" value={String(incidents.summary.alertFailures)} />
        <Metric label="Deploy-relevant changes" value={String(changes.totals.deployRelevant)} />
        <Metric label="Scan success rate" value={`${gtm.funnel.triggerToScanSuccessRatePct}%`} />
      </div>

      <section className="mt-8 rounded-lg border bg-white p-4">
        <h2 className="text-lg font-semibold">Activation funnel</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Signup" value={String(gtm.funnel.signup_completed)} />
          <Metric label="App created" value={String(gtm.funnel.app_created)} />
          <Metric label="Scan triggered" value={String(gtm.funnel.scan_triggered)} />
          <Metric label="Scan completed" value={String(gtm.funnel.scan_completed)} />
          <Metric label="Finding resolved" value={String(gtm.funnel.finding_resolved)} />
        </div>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-3">
        <ListCard
          title="Deploy-relevant changes"
          items={changes.deployRelevant.slice(0, 8).map((e) => `${e.at} · ${e.action} (${e.resource})`)}
        />
        <ListCard
          title="Security-related changes"
          items={changes.securityRelated.slice(0, 8).map((e) => `${e.at} · ${e.action} (${e.resource})`)}
        />
        <ListCard
          title="Critical config changes"
          items={changes.criticalConfigChanges.slice(0, 8).map((e) => `${e.at} · ${e.action} (${e.resource})`)}
        />
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function ListCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <h3 className="font-semibold">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">No events in window.</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm text-gray-700">
          {items.map((item) => (
            <li key={item} className="border-b pb-2 last:border-0">{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
