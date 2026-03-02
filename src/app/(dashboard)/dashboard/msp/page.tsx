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
    A: "bg-green-100 text-green-800 border-green-300",
    B: "bg-blue-100 text-blue-800 border-blue-300",
    C: "bg-yellow-100 text-yellow-800 border-yellow-300",
    D: "bg-orange-100 text-orange-800 border-orange-300",
    F: "bg-red-100 text-red-800 border-red-300",
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
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">
            ← Dashboard
          </Link>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">MSP Overview</h1>
        <p className="text-sm text-gray-500">
          Compliance posture across all {clients.length} client organisation
          {clients.length !== 1 ? "s" : ""} managed by{" "}
          <span className="font-medium text-gray-700">{session.orgName}</span>
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
      <div className="rounded-lg border bg-white overflow-hidden">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Client Organisations</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Sorted by critical findings. Click a client to open their dashboard.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs font-medium uppercase tracking-wider text-gray-500">
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
                <tr key={client.orgId} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{client.orgName}</div>
                    <div className="text-xs text-gray-400">{client.orgSlug}</div>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">{client.totalApps}</td>
                  <td className="px-4 py-3 text-right">
                    {client.criticalFindings > 0 ? (
                      <span className="font-semibold text-red-600">{client.criticalFindings}</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {client.highFindings > 0 ? (
                      <span className="font-semibold text-orange-600">{client.highFindings}</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {client.totalOpenFindings > 0 ? client.totalOpenFindings : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {client.lastScanAt ? relativeTime(new Date(client.lastScanAt)) : "Never"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <GradeBadge grade={client.complianceGrade} />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/api/msp/switch?orgId=${client.orgId}`}
                      className="rounded-md border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-50 hover:text-gray-900"
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
      <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
        <p className="text-sm text-blue-800">
          <span className="font-semibold">MSP Mode</span> — To add a client organisation, create
          the org and set its{" "}
          <code className="rounded bg-blue-100 px-1 font-mono text-xs">parentOrgId</code> to{" "}
          <code className="rounded bg-blue-100 px-1 font-mono text-xs">{session.orgId}</code> via
          the API. Client orgs appear in this view automatically.
        </p>
      </div>
    </main>
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
    <div className="rounded-lg border bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-0.5 text-2xl font-bold ${urgent ? "text-red-600" : "text-gray-900"}`}>
        {value}
      </p>
    </div>
  );
}
