import { db } from "@/lib/db";
import type { FindingSeverity } from "@/generated/prisma/client";

// ─── Types ──────────────────────────────────────────

export interface OrgMetrics {
  mtta: number | null; // Mean Time to Acknowledge (hours)
  mttr: number | null; // Mean Time to Remediate (hours)
  fixRates: Record<string, { total: number; resolved: number; rate: number }>;
  velocityTrend: WeeklyVelocity[];
  slaCompliance: {
    critical24h: { total: number; compliant: number; rate: number };
    high72h: { total: number; compliant: number; rate: number };
  };
  resolvedThisWeek: number;
}

export interface WeeklyVelocity {
  weekStart: string; // ISO date
  mttr: number | null; // hours
  resolved: number;
}

// ─── Helpers ────────────────────────────────────────

function hoursBetween(a: Date, b: Date): number {
  return Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60);
}

function weekStart(weeksAgo: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay() - weeksAgo * 7);
  return d;
}

// ─── Main Query ─────────────────────────────────────

export async function getOrgMetrics(orgId: string): Promise<OrgMetrics> {
  // Get all findings for this org
  const findings = await db.finding.findMany({
    where: { run: { app: { orgId } } },
    select: {
      id: true,
      severity: true,
      status: true,
      createdAt: true,
      resolvedAt: true,
      acknowledgedAt: true,
      notes: true,
    },
  });

  // ── MTTA ──
  const acknowledged = findings.filter((f) => f.acknowledgedAt);
  const mtta =
    acknowledged.length > 0
      ? acknowledged.reduce((sum, f) => sum + hoursBetween(f.createdAt, f.acknowledgedAt!), 0) /
        acknowledged.length
      : null;

  // ── MTTR ──
  const resolved = findings.filter((f) => f.resolvedAt);
  const mttr =
    resolved.length > 0
      ? resolved.reduce((sum, f) => sum + hoursBetween(f.createdAt, f.resolvedAt!), 0) /
        resolved.length
      : null;

  // ── Fix rates by severity ──
  const severities: FindingSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
  const fixRates: OrgMetrics["fixRates"] = {};
  for (const sev of severities) {
    const total = findings.filter((f) => f.severity === sev).length;
    const res = findings.filter((f) => f.severity === sev && f.status === "RESOLVED").length;
    fixRates[sev] = { total, resolved: res, rate: total > 0 ? Math.round((res / total) * 100) : 0 };
  }

  // ── Velocity trend (last 4 weeks) ──
  const velocityTrend: WeeklyVelocity[] = [];
  for (let w = 3; w >= 0; w--) {
    const start = weekStart(w);
    const end = weekStart(w - 1);
    const weekResolved = resolved.filter(
      (f) => f.resolvedAt! >= start && f.resolvedAt! < end,
    );
    const weekMttr =
      weekResolved.length > 0
        ? weekResolved.reduce((s, f) => s + hoursBetween(f.createdAt, f.resolvedAt!), 0) /
          weekResolved.length
        : null;
    velocityTrend.push({
      weekStart: start.toISOString().slice(0, 10),
      mttr: weekMttr !== null ? Math.round(weekMttr * 10) / 10 : null,
      resolved: weekResolved.length,
    });
  }

  // ── SLA compliance ──
  const criticalFindings = findings.filter((f) => f.severity === "CRITICAL" && f.resolvedAt);
  const critical24h = {
    total: criticalFindings.length,
    compliant: criticalFindings.filter((f) => hoursBetween(f.createdAt, f.resolvedAt!) <= 24).length,
    rate: 0,
  };
  critical24h.rate = critical24h.total > 0 ? Math.round((critical24h.compliant / critical24h.total) * 100) : 0;

  const highFindings = findings.filter((f) => f.severity === "HIGH" && f.resolvedAt);
  const high72h = {
    total: highFindings.length,
    compliant: highFindings.filter((f) => hoursBetween(f.createdAt, f.resolvedAt!) <= 72).length,
    rate: 0,
  };
  high72h.rate = high72h.total > 0 ? Math.round((high72h.compliant / high72h.total) * 100) : 0;

  // ── Resolved this week ──
  const thisWeekStart = weekStart(0);
  const resolvedThisWeek = resolved.filter((f) => f.resolvedAt! >= thisWeekStart).length;

  return {
    mtta: mtta !== null ? Math.round(mtta * 10) / 10 : null,
    mttr: mttr !== null ? Math.round(mttr * 10) / 10 : null,
    fixRates,
    velocityTrend,
    slaCompliance: { critical24h, high72h },
    resolvedThisWeek,
  };
}
