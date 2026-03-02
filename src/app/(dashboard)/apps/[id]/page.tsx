export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { relativeTime } from "@/lib/time";
import { ScanButton } from "@/components/scan-button";
import { DeleteAppButton } from "@/components/delete-app-button";
import { StatusBadge, SeverityBadge } from "@/components/status-badge";
import { FindingActions } from "@/components/finding-actions";
import { FindingAssignment } from "@/components/finding-assignment";
import { FindingTimeline } from "@/components/finding-timeline";
import { TrendCharts } from "@/components/trend-chart-dynamic";
import { JiraTicketButton } from "@/components/jira-ticket-button";
import { safeHref } from "@/lib/url";
import { isAiFinding, parseAiPolicyMeta } from "@/lib/ai-policy-scanner";
import { AiPolicyBadge } from "@/components/ai-policy-badge";

export default async function AppDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const app = await db.monitoredApp.findFirst({
    where: { id, orgId: session.orgId },
    include: {
      monitorRuns: {
        orderBy: { startedAt: "desc" },
        include: {
          findings: {
            orderBy: { severity: "asc" },
            include: {
              assignments: {
                include: { user: { select: { id: true, name: true, email: true } } },
                take: 1,
              },
            },
          },
        },
        take: 20,
      },
    },
  });

  if (!app) notFound();

  const teamMembers = await db.user.findMany({
    where: { orgId: session.orgId },
    select: { id: true, name: true, email: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900" href="/dashboard">
        ← Portfolio
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{app.name}</h1>
            <StatusBadge status={app.status} />
          </div>
          <a href={safeHref(app.url)} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
            {app.url} ↗
          </a>
        </div>
        <div className="flex items-center gap-2">
          <ScanButton appId={app.id} />
          <DeleteAppButton appId={app.id} appName={app.name} />
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <InfoCard label="Owner" value={app.ownerName ?? app.ownerEmail} />
        <InfoCard label="Criticality" value={app.criticality} />
        <InfoCard label="Last scan" value={relativeTime(app.lastCheckedAt)} />
        <InfoCard label="Next scan" value={relativeTime(app.nextCheckAt)} />
      </div>

      <div className="mb-8">
        <h2 className="mb-4 text-lg font-semibold">Trends</h2>
        <TrendCharts appId={app.id} />
      </div>

      <h2 className="mb-4 text-lg font-semibold">Scan history</h2>
      <div className="space-y-4">
        {app.monitorRuns.length === 0 ? (
          <p className="text-sm text-gray-500">No scans yet.</p>
        ) : (
          app.monitorRuns.map((run) => (
            <div key={run.id} className="rounded-lg border bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <div className="flex items-center gap-3">
                  <StatusBadge status={run.status} />
                  <span className="text-sm text-gray-500">{relativeTime(run.startedAt)}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  {run.responseTimeMs && <span>{run.responseTimeMs}ms</span>}
                  <span>{run.findings.length} finding(s)</span>
                </div>
              </div>

              <div className="px-4 py-2 text-sm text-gray-600">{run.summary}</div>

              {run.findings.length > 0 && (
                <div className="divide-y border-t">
                  {run.findings.map((f) => (
                    <div key={f.id} className="px-4 py-3">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <SeverityBadge severity={f.severity} />
                        <span className="flex-1 text-sm font-medium">{f.title}</span>
                        {isAiFinding(f.code) && (() => {
                          const aiMeta = parseAiPolicyMeta(f.description);
                          return aiMeta ? (
                            <AiPolicyBadge findingId={f.id} meta={aiMeta} />
                          ) : null;
                        })()}
                        <JiraTicketButton findingId={f.id} />
                        <FindingAssignment
                          findingId={f.id}
                          currentAssigneeId={f.assignments[0]?.userId ?? null}
                          teamMembers={teamMembers}
                        />
                        <FindingActions findingId={f.id} currentStatus={f.status} />
                      </div>
                      <p className="mb-2 text-sm text-gray-600">
                        {isAiFinding(f.code)
                          ? (() => {
                              const aiMeta = parseAiPolicyMeta(f.description);
                              return aiMeta ? aiMeta.recommendation : f.description;
                            })()
                          : f.description}
                      </p>
                      <details className="group">
                        <summary className="cursor-pointer text-xs font-medium text-blue-600 hover:underline">
                          Show AI fix prompt
                        </summary>
                        <pre className="mt-2 overflow-x-auto rounded-md bg-gray-900 p-3 text-xs leading-relaxed text-green-400">
                          {f.fixPrompt}
                        </pre>
                      </details>
                      <FindingTimeline findingId={f.id} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </main>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-0.5 text-sm font-medium capitalize text-gray-900">{value}</p>
    </div>
  );
}
