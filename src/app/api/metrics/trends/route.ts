import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOrgLimits } from "@/lib/tenant";
import { subDays, startOfDay, format } from "date-fns";
import { atLeast } from "@/lib/tier-capabilities";

export const dynamic = "force-dynamic";

function calcScore(findings: { severity: string }[]): number {
  let score = 100;
  for (const f of findings) {
    if (f.severity === "CRITICAL") score -= 25;
    else if (f.severity === "HIGH") score -= 10;
    else if (f.severity === "MEDIUM") score -= 3;
    else score -= 1;
  }
  return Math.max(0, score);
}

function msToHours(ms: number): number {
  return Math.round((ms / (1000 * 60 * 60)) * 10) / 10;
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limits = await getOrgLimits(session.orgId);
  if (!atLeast(limits.tier, "PRO")) {
    return NextResponse.json(
      { error: "Trend analytics require a Pro plan or higher." },
      { status: 403 }
    );
  }

  const thirtyDaysAgo = subDays(new Date(), 30);

  // 1. Open findings over time (count per day for last 30 days)
  // We approximate by using finding.createdAt and status
  // Cap at 5 000 — enough for accurate 30-day trend analysis without OOM risk.
  const allOrgFindings = await db.finding.findMany({
    where: {
      run: { app: { orgId: session.orgId } },
      createdAt: { gte: thirtyDaysAgo },
    },
    select: {
      code: true,
      severity: true,
      status: true,
      createdAt: true,
      resolvedAt: true,
      acknowledgedAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  // Build daily open finding counts
  const dailyCounts: Record<string, number> = {};
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const day = format(startOfDay(subDays(new Date(), i)), "yyyy-MM-dd");
    days.push(day);
    dailyCounts[day] = 0;
  }

  for (const finding of allOrgFindings) {
    const day = format(startOfDay(finding.createdAt), "yyyy-MM-dd");
    if (day in dailyCounts) {
      dailyCounts[day]++;
    }
  }

  const openFindingsOverTime = days.map((day) => ({
    date: day,
    count: dailyCounts[day] ?? 0,
  }));

  // 2. Findings by severity (pie data)
  const bySeverity: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const finding of allOrgFindings) {
    bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + 1;
  }

  // 3. MTTA (mean time to acknowledge) per severity
  const mttaByServerity: Record<string, { total: number; count: number }> = {};
  for (const finding of allOrgFindings) {
    if (finding.acknowledgedAt) {
      const ms = finding.acknowledgedAt.getTime() - finding.createdAt.getTime();
      if (!mttaByServerity[finding.severity]) {
        mttaByServerity[finding.severity] = { total: 0, count: 0 };
      }
      mttaByServerity[finding.severity].total += ms;
      mttaByServerity[finding.severity].count++;
    }
  }

  const mttaHours: Record<string, number | null> = { CRITICAL: null, HIGH: null, MEDIUM: null, LOW: null };
  for (const [severity, { total, count }] of Object.entries(mttaByServerity)) {
    mttaHours[severity] = count > 0 ? msToHours(total / count) : null;
  }

  // 4. MTTR (mean time to resolve) per severity
  const mttrBySeverity: Record<string, { total: number; count: number }> = {};
  for (const finding of allOrgFindings) {
    if (finding.resolvedAt) {
      const ms = finding.resolvedAt.getTime() - finding.createdAt.getTime();
      if (!mttrBySeverity[finding.severity]) {
        mttrBySeverity[finding.severity] = { total: 0, count: 0 };
      }
      mttrBySeverity[finding.severity].total += ms;
      mttrBySeverity[finding.severity].count++;
    }
  }

  const mttrHours: Record<string, number | null> = { CRITICAL: null, HIGH: null, MEDIUM: null, LOW: null };
  for (const [severity, { total, count }] of Object.entries(mttrBySeverity)) {
    mttrHours[severity] = count > 0 ? msToHours(total / count) : null;
  }

  // 5. Top 5 most-found finding codes
  const codeCounts: Record<string, number> = {};
  for (const finding of allOrgFindings) {
    codeCounts[finding.code] = (codeCounts[finding.code] ?? 0) + 1;
  }
  const topFindingCodes = Object.entries(codeCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([code, count]) => ({ code, count }));

  // 6. Security score trend (daily average across all apps from recent scans)
  // Cap at 500 runs — well above what any org would accumulate in 30 days.
  const recentRuns = await db.monitorRun.findMany({
    where: {
      startedAt: { gte: thirtyDaysAgo },
      app: { orgId: session.orgId },
    },
    select: {
      startedAt: true,
      findings: { select: { severity: true } },
    },
    orderBy: { startedAt: "asc" },
    take: 500,
  });

  // Group by day and compute average score
  const dailyScores: Record<string, number[]> = {};
  for (const run of recentRuns) {
    const day = format(startOfDay(run.startedAt), "yyyy-MM-dd");
    if (!(day in dailyScores)) dailyScores[day] = [];
    dailyScores[day].push(calcScore(run.findings));
  }

  const scoreTrend = days.map((day) => {
    const scores = dailyScores[day];
    const avg = scores && scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;
    return { date: day, score: avg };
  });

  return NextResponse.json({
    openFindingsOverTime,
    findingsBySeverity: bySeverity,
    mttaHours,
    mttrHours,
    topFindingCodes,
    scoreTrend,
    periodDays: 30,
  });
}
