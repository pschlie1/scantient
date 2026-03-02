import { subDays } from "date-fns";
import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getOrgLimits } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * audit-23: Timing-safe string comparison for CRON_SECRET.
 * The previous `auth === \`Bearer ${cronSecret}\`` used a JS equality check whose
 * execution time leaks the length/prefix of the secret via timing side-channel.
 * Uses the same approach as cron/run/route.ts (audit-14).
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a.padEnd(512));
  const bufB = Buffer.from(b.padEnd(512));
  return timingSafeEqual(bufA, bufB) && a.length === b.length;
}

function buildReport(apps: Array<{ name: string; ownerEmail: string | null; status: string; lastCheckedAt: Date | null; monitorRuns: Array<{ findings: Array<{ severity: string }> }> }>) {
  return apps.map((app) => {
    const findings = app.monitorRuns.flatMap((r) => r.findings);
    const critical = findings.filter((f) => ["CRITICAL", "HIGH"].includes(f.severity)).length;
    return {
      app: app.name,
      owner: app.ownerEmail,
      status: app.status,
      runs: app.monitorRuns.length,
      criticalFindings: critical,
      lastCheckedAt: app.lastCheckedAt,
    };
  });
}

export async function GET(req: Request) {
  const since = subDays(new Date(), 7);

  // Cron path: iterate per-org
  const auth = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  // audit-23: Use timing-safe comparison to prevent timing-oracle attacks on the secret.
  // A plain `===` leaks how many prefix bytes matched, which allows brute-force recovery.
  const isCron = cronSecret && timingSafeStringEqual(auth, `Bearer ${cronSecret}`);

  if (isCron) {
    // Intentionally unbounded: this is a cron batch job that must process all orgs.
    // Per-org queries below are capped with take: 100 to prevent per-org OOM.
    const orgs = await db.organization.findMany({ select: { id: true, name: true } });
    const reports = [];

    for (const org of orgs) {
      const apps = await db.monitoredApp.findMany({
        where: { orgId: org.id },
        take: 100,
        include: {
          monitorRuns: {
            where: { startedAt: { gte: since } },
            take: 10,
            orderBy: { startedAt: "desc" },
            include: {
              findings: {
                select: { severity: true },
                take: 200,
              },
            },
          },
        },
      });
      reports.push({ orgId: org.id, orgName: org.name, report: buildReport(apps) });
    }

    return NextResponse.json({ generatedAt: new Date(), reports });
  }

  // Authenticated user path: scope by session orgId
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limits = await getOrgLimits(session.orgId);
  if (!["STARTER", "PRO", "ENTERPRISE", "ENTERPRISE_PLUS"].includes(limits.tier)) {
    return NextResponse.json({ error: "Weekly reports require a Starter plan or higher." }, { status: 403 });
  }

  // Rate limit: max 5 report generations per minute per org (report generation is expensive)
  const rl = await checkRateLimit(`report:weekly:${session.orgId}`, {
    maxAttempts: 5,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please wait before generating another report." },
      {
        status: 429,
        headers: rl.retryAfterSeconds
          ? { "Retry-After": String(rl.retryAfterSeconds) }
          : {},
      },
    );
  }

  const apps = await db.monitoredApp.findMany({
    where: { orgId: session.orgId },
    take: 100,
    include: {
      monitorRuns: {
        where: { startedAt: { gte: since } },
        take: 10,
        orderBy: { startedAt: "desc" },
        include: {
          findings: {
            select: { severity: true },
            take: 200,
          },
        },
      },
    },
  });

  return NextResponse.json({ generatedAt: new Date(), report: buildReport(apps) });
}
