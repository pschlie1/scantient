import { subDays } from "date-fns";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sevenDaysAgo = subDays(new Date(), 7);

  const [apps, criticalFindings, recentRuns, healthyApps] = await Promise.all([
    db.monitoredApp.count({ where: { orgId: session.orgId } }),
    db.finding.count({
      where: {
        severity: { in: ["CRITICAL", "HIGH"] },
        status: "OPEN",
        run: { app: { orgId: session.orgId } },
        createdAt: { gte: sevenDaysAgo },
      },
    }),
    db.monitorRun.findMany({
      where: {
        startedAt: { gte: sevenDaysAgo },
        app: { orgId: session.orgId },
      },
      include: { app: true, findings: true },
      orderBy: { startedAt: "desc" },
      take: 30,
    }),
    db.monitoredApp.count({
      where: { orgId: session.orgId, status: "HEALTHY" },
    }),
  ]);

  return NextResponse.json({
    summary: {
      totalApps: apps,
      healthyApps,
      riskApps: apps - healthyApps,
      criticalFindings,
    },
    recentRuns,
  });
}
