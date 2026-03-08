export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { relativeTime } from "@/lib/time";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClientSummary {
  orgId: string;
  orgName: string;
  orgSlug: string;
  totalApps: number;
  criticalFindings: number;
  highFindings: number;
  totalOpenFindings: number;
  lastScanAt: string | null;
  complianceScore: number;
  complianceGrade: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreToGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function computeComplianceScore(findings: { severity: string }[]): number {
  const penalty = findings.reduce((sum, f) => {
    switch (f.severity) {
      case "CRITICAL": return sum + 25;
      case "HIGH": return sum + 10;
      case "MEDIUM": return sum + 3;
      default: return sum + 1;
    }
  }, 0);
  return Math.max(0, 100 - penalty);
}

function GradeBadge({ grade }: { grade: string }) {
  const colors: Record<string, string> = {
    A: "bg-success/10 text-success border-success/30",
    B: "bg-info/10 text-info border-info/30",
    C: "bg-warning/10 text-warning border-warning/30",
    D: "bg-warning/10 text-warning border-warning/30",
    F: "bg-error/10 text-error border-error/30",
  };
  return (
    <span
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm font-bold ${
        colors[grade] ?? colors.F
      }`}
    >
      {grade}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function MspOverviewPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Only OWNER and ADMIN can view MSP overview
  if (session.role !== "OWNER" && session.role !== "ADMIN") {
    redirect("/dashboard");
  }

  // Fetch all client orgs
  const clientOrgs = await db.organization.findMany({
    where: { parentOrgId: session.orgId },
    orderBy: { name: "asc" },
    include: {
      apps: {
        select: {
          id: true,
          lastCheckedAt: true,
          monitorRuns: {
            orderBy: { startedAt: "desc" },
            take: 1,
            select: {
              startedAt: true,
              findings: {
                where: { status: { notIn: ["RESOLVED", "IGNORED"] } },
                select: { severity: true },
              },
            },
          },
        },
      },
    },
  });

  // If no client orgs, redirect to normal dashboard
  if (clientOrgs.length === 0) {
    redirect("/dashboard");
  }

  // Build client summaries
  const clients: ClientSummary[] = clientOrgs.map((org) => {
    const allOpenFindings: { severity: string }[] = [];
    let lastScanAt: Date | null = null;

    for (const app of org.apps) {
      const latestRun = app.monitorRuns[0];
      if (latestRun) {
        allOpenFindings.push(...latestRun.findings);
        if (!lastScanAt || latestRun.startedAt > lastScanAt) {
          lastScanAt = latestRun.startedAt;
        }
      }
    }

    const criticalFindings = allOpenFindings.filter((f) => f.severity === "CRITICAL").length;
    const highFindings = allOpenFindings.filter((f) => f.severity === "HIGH").length;
    const complianceScore = computeComplianceScore(allOpenFindings);

    return {
      orgId: org.id,
      orgName: org.name,
      orgSlug: org.slug,
      totalApps: org.apps.length,
      criticalFindings,
      highFindings,
      totalOpenFindings: allOpenFindings.length,
      lastScanAt: lastScanAt ? (lastScanAt as Date).toISOString() : null,
      complianceScore,
      complianceGrade: scoreToGrade(complianceScore),
    };
  });

  // Sort: most critical findings first
  clients.sort((a, b) => {
    if (b.criticalFindings !== a.criticalFindings) return b.criticalFindings - a.criticalFindings;
    return b.highFindings - a.highFindings;
  });

  const totalApps = clients.reduce((s, c) => s + c.totalApps, 0);
  const totalCritical = clients.reduce((s, c) => s + c.criticalFindings, 0);
  const avgScore = Math.round(clients.reduce((s, c) => s + c.complianceScore, 0) / clients.length);

  return (
    <div className="py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Link href="/dashboard" className="text-sm text-muted hover:text-heading">
            ← Dashboard
          </Link>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">MSP Overview</h1>
        <p className="text-sm text-muted">
          Compliance posture across all {clients.length} client organisation
          {clients.length !== 1 ? "s" : ""} managed by{" "}
          <span className="font-medium text-heading">{session.orgName}</span>
        </p>
      </div>

      {/* Summary cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard label="Client Orgs" value={String(clients.length)} />
        <SummaryCard label="Total Apps" value={String(totalApps)} />
        <SummaryCard
          label="Critical Findings"
          value={String(totalCritical)}
          urgent={totalCritical > 0}
        />
        <SummaryCard label="Avg. Compliance" value={`${avgScore}/100`} />
      </div>

      {/* Client org table */}
      <div className="rounded-lg border bg-surface overflow-hidden">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Client Organisations</h2>
          <p className="text-xs text-muted mt-0.5">
            Sorted by critical findings. Click a client to open their dashboard.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-surface-raised text-xs font-medium uppercase tracking-wider text-muted">
                <th className="px-4 py-2">Organisation</th>
                <th className="px-4 py-2 text-center">Apps</th>
                <th className="px-4 py-2 text-right">Critical</th>
                <th className="px-4 py-2 text-right">High</th>
                <th className="px-4 py-2 text-right">All Open</th>
                <th className="px-4 py-2">Last Scan</th>
                <th className="px-4 py-2 text-center">Grade</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {clients.map((client) => (
                <tr key={client.orgId} className="hover:bg-surface-raised transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-heading">{client.orgName}</div>
                    <div className="text-xs text-muted">{client.orgSlug}</div>
                  </td>
                  <td className="px-4 py-3 text-center text-body">{client.totalApps}</td>
                  <td className="px-4 py-3 text-right">
                    {client.criticalFindings > 0 ? (
                      <span className="font-semibold text-error">{client.criticalFindings}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {client.highFindings > 0 ? (
                      <span className="font-semibold text-warning">{client.highFindings}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-body">
                    {client.totalOpenFindings > 0 ? client.totalOpenFindings : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {client.lastScanAt ? relativeTime(new Date(client.lastScanAt)) : "Never"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <GradeBadge grade={client.complianceGrade} />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/api/msp/switch?orgId=${client.orgId}`}
                      className="rounded-md border border-border px-3 py-1 text-xs font-medium text-body transition hover:bg-surface-raised hover:text-heading"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info callout */}
      <div className="mt-6 rounded-lg border border-info/20 bg-info/10 px-4 py-3">
        <p className="text-sm text-info">
          <span className="font-semibold">MSP Mode</span> — To add a client organisation, create
          the org and set its{" "}
          <code className="rounded bg-info/10 px-1 font-mono text-xs">parentOrgId</code> to{" "}
          <code className="rounded bg-info/10 px-1 font-mono text-xs">{session.orgId}</code> via
          the API. Client orgs appear in this view automatically.
        </p>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  urgent,
}: {
  label: string;
  value: string;
  urgent?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-surface px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-0.5 text-2xl font-bold ${urgent ? "text-error" : "text-heading"}`}>
        {value}
      </p>
    </div>
  );
}
