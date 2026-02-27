import Link from "next/link";

export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import { relativeTime } from "@/lib/time";
import { NewAppForm } from "@/components/new-app-form";
import { ScanButton } from "@/components/scan-button";
import { StatusBadge } from "@/components/status-badge";
import { SummaryCards } from "@/components/summary-cards";

export default async function Home() {
  const apps = await db.monitoredApp.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      monitorRuns: {
        orderBy: { startedAt: "desc" },
        include: { findings: true },
        take: 1,
      },
    },
  });

  const healthy = apps.filter((a) => a.status === "HEALTHY").length;
  const warning = apps.filter((a) => a.status === "WARNING").length;
  const critical = apps.filter((a) => a.status === "CRITICAL").length;
  const totalFindings = apps.reduce(
    (sum, a) => sum + (a.monitorRuns[0]?.findings.length ?? 0),
    0,
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-black">
            <span className="text-lg font-bold text-white">V</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">VibeSafe</h1>
            <p className="text-sm text-gray-500">
              Production health &amp; security monitoring for AI-built apps
            </p>
          </div>
        </div>
      </div>

      {/* Summary */}
      <SummaryCards
        total={apps.length}
        healthy={healthy}
        warning={warning}
        critical={critical}
        totalFindings={totalFindings}
      />

      {/* Main content */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* App table */}
        <section className="rounded-lg border bg-white">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Portfolio</h2>
          </div>

          {apps.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">
              No apps registered yet. Add one to start monitoring →
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs font-medium uppercase tracking-wider text-gray-500">
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
                    const critCount = run?.findings.filter((f) =>
                      ["CRITICAL", "HIGH"].includes(f.severity),
                    ).length ?? 0;

                    return (
                      <tr key={app.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <Link href={`/apps/${app.id}`} className="font-medium text-gray-900 hover:underline">
                            {app.name}
                          </Link>
                          <p className="text-xs text-gray-400 truncate max-w-[200px]">{app.url}</p>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={app.status} />
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs capitalize text-gray-600">{app.criticality}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {relativeTime(app.lastCheckedAt)}
                        </td>
                        <td className="px-4 py-3">
                          {findingsCount > 0 ? (
                            <span className="text-xs">
                              <span className="font-semibold text-red-600">{critCount}</span>
                              <span className="text-gray-400"> / {findingsCount}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
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

        {/* Registration form */}
        <div>
          <NewAppForm />
        </div>
      </div>
    </main>
  );
}
