import { db } from "@/lib/db";

type DateRange = { from: Date; to: Date };

function toDate(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

export function parseRange(input: { from: string | null; to: string | null; defaultDays?: number }): DateRange {
  const now = new Date();
  const defaultDays = input.defaultDays ?? 30;
  const fallbackFrom = new Date(now.getTime() - defaultDays * 24 * 60 * 60 * 1000);

  const from = toDate(input.from, fallbackFrom);
  const to = toDate(input.to, now);

  return from <= to ? { from, to } : { from: to, to: from };
}

function parseDetails(details: string | null): Record<string, unknown> {
  if (!details) return {};
  try {
    const parsed = JSON.parse(details);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {
    // ignore parsing issues
  }
  return {};
}

function redact(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (/email|token|secret|password|key|hash|url|destination|name/i.test(k)) continue;
    out[k] = v;
  }
  return out;
}

export async function getIncidentEvidenceExport(orgId: string, range: DateRange) {
  const [runs, notifications, auditEvents] = await Promise.all([
    db.monitorRun.findMany({
      where: {
        app: { orgId },
        startedAt: { gte: range.from, lte: range.to },
        OR: [{ status: "CRITICAL" }, { status: "WARNING" }],
      },
      include: {
        app: { select: { id: true, name: true } },
        findings: { select: { id: true, severity: true, code: true, title: true, status: true } },
      },
      orderBy: { startedAt: "asc" },
    }),
    db.notification.findMany({
      where: {
        sentAt: { gte: range.from, lte: range.to },
        alertConfig: { orgId },
      },
      select: {
        id: true,
        sentAt: true,
        delivered: true,
        error: true,
        subject: true,
        alertConfig: { select: { channel: true, minSeverity: true } },
      },
      orderBy: { sentAt: "asc" },
    }),
    db.auditLog.findMany({
      where: {
        orgId,
        createdAt: { gte: range.from, lte: range.to },
        OR: [
          { action: { contains: "FINDING" } },
          { action: { contains: "SCAN" } },
          { action: { contains: "ALERT" } },
          { action: "CRON_HEARTBEAT" },
        ],
      },
      select: { id: true, action: true, resource: true, details: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const timeline = [
    ...runs.map((run) => ({
      at: run.startedAt.toISOString(),
      type: "monitor_run",
      appId: run.appId,
      appName: run.app.name,
      status: run.status,
      summary: run.summary,
      findings: run.findings.length,
      criticalFindings: run.findings.filter((f) => f.severity === "CRITICAL").length,
    })),
    ...notifications.map((n) => ({
      at: n.sentAt.toISOString(),
      type: "notification",
      notificationId: n.id,
      channel: n.alertConfig.channel,
      delivered: n.delivered,
      error: n.error ?? undefined,
      minSeverity: n.alertConfig.minSeverity,
      subject: n.subject.slice(0, 120),
    })),
    ...auditEvents.map((e) => ({
      at: e.createdAt.toISOString(),
      type: "audit_event",
      action: e.action,
      resource: e.resource,
      details: redact(parseDetails(e.details)),
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return {
    exportedAt: new Date().toISOString(),
    orgId,
    window: { from: range.from.toISOString(), to: range.to.toISOString() },
    summary: {
      incidents: runs.length,
      criticalRuns: runs.filter((r) => r.status === "CRITICAL").length,
      warningRuns: runs.filter((r) => r.status === "WARNING").length,
      alertFailures: notifications.filter((n) => !n.delivered).length,
      timelineEvents: timeline.length,
    },
    timeline,
  };
}

const DEPLOY_ACTION_MATCHERS = ["APP_CREATED", "SCAN_TRIGGERED", "change", "deploy", "CRON_HEARTBEAT"];
const SECURITY_ACTION_MATCHERS = ["FINDING", "AUTH", "API_KEY", "SCAN", "SECURITY", "ALERT"];
const CONFIG_ACTION_MATCHERS = ["ALERT_CONFIG", "SETTINGS", "TEAM_", "INVITE", "API_KEY"];

function actionMatches(action: string, matchers: string[]) {
  const up = action.toUpperCase();
  return matchers.some((m) => up.includes(m.toUpperCase()));
}

export async function getChangeAuditReport(orgId: string, range: DateRange) {
  const events = await db.auditLog.findMany({
    where: {
      orgId,
      createdAt: { gte: range.from, lte: range.to },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      action: true,
      resource: true,
      details: true,
      createdAt: true,
      user: { select: { id: true, role: true } },
    },
  });

  const shaped = events.map((e) => ({
    id: e.id,
    at: e.createdAt.toISOString(),
    action: e.action,
    resource: e.resource,
    actor: e.user ? { id: e.user.id, role: e.user.role } : null,
    details: redact(parseDetails(e.details)),
  }));

  return {
    generatedAt: new Date().toISOString(),
    orgId,
    window: { from: range.from.toISOString(), to: range.to.toISOString() },
    totals: {
      all: shaped.length,
      deployRelevant: shaped.filter((e) => actionMatches(e.action, DEPLOY_ACTION_MATCHERS)).length,
      securityRelated: shaped.filter((e) => actionMatches(e.action, SECURITY_ACTION_MATCHERS)).length,
      criticalConfigChanges: shaped.filter((e) => actionMatches(e.action, CONFIG_ACTION_MATCHERS)).length,
    },
    deployRelevant: shaped.filter((e) => actionMatches(e.action, DEPLOY_ACTION_MATCHERS)).slice(0, 100),
    securityRelated: shaped.filter((e) => actionMatches(e.action, SECURITY_ACTION_MATCHERS)).slice(0, 100),
    criticalConfigChanges: shaped.filter((e) => actionMatches(e.action, CONFIG_ACTION_MATCHERS)).slice(0, 100),
  };
}

type FunnelCounts = {
  signup_completed: number;
  app_created: number;
  scan_triggered: number;
  scan_completed: number;
  finding_resolved: number;
};

function getAnalyticsEvent(details: string | null): string | null {
  const parsed = parseDetails(details);
  const event = parsed.event;
  return typeof event === "string" ? event : null;
}

export async function getGtmBaseline(orgId: string, range: DateRange) {
  const logs = await db.auditLog.findMany({
    where: {
      orgId,
      action: "ANALYTICS_EVENT",
      createdAt: { gte: range.from, lte: range.to },
    },
    select: { createdAt: true, details: true },
    orderBy: { createdAt: "asc" },
  });

  const counts: FunnelCounts = {
    signup_completed: 0,
    app_created: 0,
    scan_triggered: 0,
    scan_completed: 0,
    finding_resolved: 0,
  };
  const weekly = new Map<string, FunnelCounts>();

  for (const log of logs) {
    const event = getAnalyticsEvent(log.details);
    if (!event || !(event in counts)) continue;
    counts[event as keyof FunnelCounts] += 1;

    const week = `${log.createdAt.getUTCFullYear()}-W${Math.ceil((log.createdAt.getUTCDate() + 6 - log.createdAt.getUTCDay()) / 7)}`;
    if (!weekly.has(week)) {
      weekly.set(week, {
        signup_completed: 0,
        app_created: 0,
        scan_triggered: 0,
        scan_completed: 0,
        finding_resolved: 0,
      });
    }
    const bucket = weekly.get(week)!;
    bucket[event as keyof FunnelCounts] += 1;
  }

  const signup = counts.signup_completed || 0;
  const appCreated = counts.app_created || 0;
  const scanTriggered = counts.scan_triggered || 0;
  const scanCompleted = counts.scan_completed || 0;

  return {
    generatedAt: new Date().toISOString(),
    orgId,
    window: { from: range.from.toISOString(), to: range.to.toISOString() },
    funnel: {
      ...counts,
      signupToAppRatePct: signup > 0 ? Math.round((appCreated / signup) * 100) : 0,
      appToScanTriggerRatePct: appCreated > 0 ? Math.round((scanTriggered / appCreated) * 100) : 0,
      triggerToScanSuccessRatePct: scanTriggered > 0 ? Math.round((scanCompleted / scanTriggered) * 100) : 0,
    },
    cohorts: Array.from(weekly.entries())
      .map(([week, data]) => ({ week, ...data }))
      .sort((a, b) => a.week.localeCompare(b.week)),
  };
}
