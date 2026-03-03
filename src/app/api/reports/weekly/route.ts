import { subDays } from "date-fns";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getOrgLimits } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { atLeast } from "@/lib/tier-capabilities";

// audit-24: The previous version of this route contained a "cron path" that
// returned data from ALL organizations when an Authorization header matching
// CRON_SECRET was supplied.  Because the middleware requires a valid JWT
// session cookie before reaching this handler, any logged-in user who also
// knew the CRON_SECRET could bypass per-org scoping and read every org's
// weekly report (cross-tenant data leakage).  Additionally the comparison
// used the non-constant-time `===` operator rather than a timing-safe
// comparison.  The cron path was dead code for unauthenticated callers
// (middleware blocks them) so it has been removed entirely.  The route now
// only returns data for the authenticated user's own organization.

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

// _req is accepted for Next.js route-handler compatibility and test
// call-sites but is intentionally unused — the cron path that previously
// read the Authorization header from it has been removed entirely.
export async function GET(_req?: Request) {
  const since = subDays(new Date(), 7);

  // Authenticated user path: always scope by session orgId
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limits = await getOrgLimits(session.orgId);
  if (!atLeast(limits.tier, "STARTER")) {
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
