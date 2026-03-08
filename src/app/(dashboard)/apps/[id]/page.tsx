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
import { ShareScoreButton } from "@/components/share-score-button";
import type { ProbeResult } from "@/lib/probe-client";
// import type { ConnectorResult } from "@/lib/connectors/types"; // TODO: disabled incomplete feature

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

  // ─── Scan diff: compare latest 2 runs to surface progress ────────────────
  let resolvedSinceLastScan = 0;
  let newSinceLastScan = 0;
  if (app.monitorRuns.length >= 2) {
    const [latestRun, prevRun] = app.monitorRuns;
    const latestCodes = new Set(latestRun.findings.map((f) => f.code));
    const prevCodes = new Set(prevRun.findings.map((f) => f.code));
    // Resolved: appeared in prev but NOT in latest
    for (const code of prevCodes) {
      if (!latestCodes.has(code)) resolvedSinceLastScan++;
    }
    // New: appeared in latest but NOT in prev
    for (const code of latestCodes) {
      if (!prevCodes.has(code)) newSinceLastScan++;
    }
  }

  // Extract the most recent probe result (if any) from the latest run
  const latestProbeResult = app.monitorRuns
    .find((r) => r.probeResult != null)
    ?.probeResult as ProbeResult | null | undefined;

  // TODO: connectorResults field not yet added to MonitorRun schema (incomplete merge)
  // const latestConnectorResults = app.monitorRuns
  //   .find((r) => r.connectorResults != null)
  //   ?.connectorResults as Record<string, ConnectorResult> | null | undefined;
  const latestConnectorResults: Record<string, ConnectorResult> | null = null;

  return (
    <div className="py-8">
      <Link className="mb-6 inline-flex items-center gap-1 text-sm text-muted hover:text-heading" href="/dashboard">
        ← Portfolio
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{app.name}</h1>
            <StatusBadge status={app.status} />
          </div>
          <a href={safeHref(app.url)} target="_blank" rel="noopener noreferrer" className="text-sm text-info hover:underline">
            {app.url} ↗
          </a>
        </div>
        <div className="flex items-center gap-2">
          <ShareScoreButton domain={new URL(app.url.startsWith("http") ? app.url : `https://${app.url}`).hostname.replace(/^www\./, "")} />
          <Link
            href={`/apps/${app.id}/edit`}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-heading hover:bg-surface-raised"
          >
            Settings
          </Link>
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

      {/* Subsystem Health — only shown if probeUrl is configured */}
      {app.probeUrl && (
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-semibold">Subsystem Health</h2>
          <SubsystemHealthCard probeResult={latestProbeResult ?? null} probeUrl={app.probeUrl} />
        </div>
      )}

      {/* Infrastructure Health — only shown if connector results are present */}
      {latestConnectorResults && Object.keys(latestConnectorResults).length > 0 && (
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-semibold">Infrastructure Health</h2>
          <InfrastructureHealthCard connectorResults={latestConnectorResults} />
        </div>
      )}

      {/* Scan diff banner — shown when we have at least 2 runs */}
      {app.monitorRuns.length >= 2 && (resolvedSinceLastScan > 0 || newSinceLastScan > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-raised px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Since last scan:</span>
          {resolvedSinceLastScan > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-3 py-1 text-sm font-medium text-success">
              ✅ {resolvedSinceLastScan} issue{resolvedSinceLastScan !== 1 ? "s" : ""} resolved
            </span>
          )}
          {newSinceLastScan > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-error/10 px-3 py-1 text-sm font-medium text-error">
              🔴 {newSinceLastScan} new issue{newSinceLastScan !== 1 ? "s" : ""} found
            </span>
          )}
        </div>
      )}

      <h2 className="mb-4 text-lg font-semibold">Scan history</h2>
      <div className="space-y-4">
        {app.monitorRuns.length === 0 ? (
          <p className="text-sm text-muted">No scans yet.</p>
        ) : (
          app.monitorRuns.map((run) => (
            <div key={run.id} className="rounded-lg border bg-surface">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <div className="flex items-center gap-3">
                  <StatusBadge status={run.status} />
                  <span className="text-sm text-muted">{relativeTime(run.startedAt)}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted">
                  {run.responseTimeMs && <span>{run.responseTimeMs}ms</span>}
                  <span>{run.findings.length} finding(s)</span>
                </div>
              </div>

              <div className="px-4 py-2 text-sm text-body">{run.summary}</div>

              {run.findings.length > 0 && (
                <div className="divide-y border-t">
                  {run.findings.map((f) => {
                    const isResolved = f.status === "RESOLVED" || f.status === "IGNORED";
                    return (
                      <div
                        key={f.id}
                        className={`px-4 py-3 transition-opacity ${isResolved ? "opacity-50" : ""}`}
                      >
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <SeverityBadge severity={f.severity} />
                          <span className={`flex-1 text-sm font-medium ${isResolved ? "line-through text-muted" : ""}`}>
                            {f.title}
                          </span>
                          {isResolved && (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${f.status === "RESOLVED" ? "bg-success/10 text-success" : "bg-surface-raised text-muted"}`}>
                              {f.status === "RESOLVED" ? "✓ Resolved" : "Ignored"}
                            </span>
                          )}
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
                        {!isResolved && (
                          <p className="mb-2 text-sm text-body">
                            {isAiFinding(f.code)
                              ? (() => {
                                  const aiMeta = parseAiPolicyMeta(f.description);
                                  return aiMeta ? aiMeta.recommendation : f.description;
                                })()
                              : f.description}
                          </p>
                        )}
                        {!isResolved && (
                          <details className="group">
                            <summary className="cursor-pointer text-xs font-medium text-info hover:underline">
                              Show AI fix prompt
                            </summary>
                            <pre className="mt-2 overflow-x-auto rounded-md bg-page p-3 text-xs leading-relaxed text-success">
                              {f.fixPrompt}
                            </pre>
                          </details>
                        )}
                        <FindingTimeline findingId={f.id} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Subsystem Health Card ────────────────────────────────────────────────────

const SUBSYSTEMS = ["database", "auth", "payments", "email", "queue", "cache"] as const;
type SubsystemName = (typeof SUBSYSTEMS)[number];

function SubsystemHealthCard({
  probeResult,
  probeUrl,
}: {
  probeResult: ProbeResult | null;
  probeUrl: string;
}) {
  if (!probeResult) {
    return (
      <div className="rounded-lg border bg-surface px-4 py-6 text-center">
        <p className="text-sm text-muted">
          No probe data yet — trigger a scan to populate subsystem health.
        </p>
        <p className="mt-1 text-xs text-muted">Probing: {probeUrl}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-surface">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${probeResult.ok ? "bg-success/100" : "bg-error/100"}`}
          />
          <span className="text-sm font-medium">
            {probeResult.ok ? "All systems operational" : "One or more subsystems degraded"}
          </span>
        </div>
        <span className="text-xs text-muted">
          {new Date(probeResult.respondedAt).toLocaleString()} · {probeResult.latencyMs}ms total
        </span>
      </div>

      <div className="divide-y">
        {SUBSYSTEMS.map((name) => {
          const sub = probeResult.subsystems[name as SubsystemName];
          return (
            <SubsystemRow
              key={name}
              name={name}
              data={sub ?? null}
            />
          );
        })}
      </div>

      {(probeResult.version ?? probeResult.environment) && (
        <div className="border-t px-4 py-2 text-xs text-muted">
          {probeResult.version && <span>v{probeResult.version}</span>}
          {probeResult.version && probeResult.environment && <span> · </span>}
          {probeResult.environment && <span className="capitalize">{probeResult.environment}</span>}
        </div>
      )}
    </div>
  );
}

function SubsystemRow({
  name,
  data,
}: {
  name: string;
  data: ProbeResult["subsystems"][SubsystemName] | null;
}) {
  const label = name.charAt(0).toUpperCase() + name.slice(1);

  if (data == null) {
    return (
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm capitalize text-muted">{label}</span>
        <span className="text-xs text-muted">— not configured</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-2">
        {data.ok ? (
          <span className="text-success" aria-label="healthy">✓</span>
        ) : (
          <span className="text-error" aria-label="unhealthy">✗</span>
        )}
        <span className="text-sm capitalize text-heading">{label}</span>
        {data.provider && (
          <span className="rounded bg-surface-raised px-1.5 py-0.5 text-xs text-muted">
            {data.provider}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted">
        {data.latencyMs != null && <span>{data.latencyMs}ms</span>}
        {"depth" in data && data.depth != null && <span>depth: {data.depth}</span>}
        {!data.ok && data.error && (
          <span className="max-w-xs truncate text-error" title={data.error}>
            {data.error}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Infrastructure Health Card ───────────────────────────────────────────────

interface ConnectorResult {
  ok: boolean;
  findings: Array<{ id: string }>;
  checkedAt: string;
}

const CONNECTOR_LABELS: Record<string, string> = {
  vercel: "Vercel",
  github: "GitHub",
  stripe: "Stripe",
};

function InfrastructureHealthCard({
  connectorResults,
}: {
  connectorResults: Record<string, ConnectorResult>;
}) {
  const entries = Object.entries(connectorResults);

  return (
    <div className="rounded-lg border bg-surface">
      <div className="divide-y">
        {entries.map(([connector, result]) => (
          <div key={connector} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              {result.ok ? (
                <span className="text-success" aria-label="healthy">✓</span>
              ) : (
                <span className="text-error" aria-label="issues detected">✗</span>
              )}
              <span className="text-sm font-medium">
                {CONNECTOR_LABELS[connector] ?? connector}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted">
              {result.findings.length > 0 && (
                <span className="text-warning">
                  {result.findings.length} finding{result.findings.length === 1 ? "" : "s"}
                </span>
              )}
              {result.ok && result.findings.length === 0 && (
                <span className="text-success">All checks passed</span>
              )}
              <span>{new Date(result.checkedAt).toLocaleTimeString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-surface px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-medium capitalize text-heading">{value}</p>
    </div>
  );
}
