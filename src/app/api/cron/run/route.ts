import { NextResponse } from "next/server";
import { runDueHttpScans } from "@/lib/scanner-http";
import { logApiError } from "@/lib/observability";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.warn("[cron] WARNING: CRON_SECRET is not set. Cron endpoint is unprotected (dev mode).");
  } else {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const results = await runDueHttpScans(50);

    const byOrg = new Map<string, { processed: number; critical: number; warning: number }>();
    for (const r of results) {
      if (!byOrg.has(r.orgId)) byOrg.set(r.orgId, { processed: 0, critical: 0, warning: 0 });
      const bucket = byOrg.get(r.orgId)!;
      bucket.processed += 1;
      if (r.status === "CRITICAL") bucket.critical += 1;
      if (r.status === "WARNING") bucket.warning += 1;
    }

    if (byOrg.size > 0) {
      await db.auditLog.createMany({
        data: Array.from(byOrg.entries()).map(([orgId, agg]) => ({
          orgId,
          action: "CRON_HEARTBEAT",
          resource: "scan_scheduler",
          details: JSON.stringify({
            processed: agg.processed,
            critical: agg.critical,
            warning: agg.warning,
            timestamp: new Date().toISOString(),
          }),
        })),
      });
    }

    return NextResponse.json({ ok: true, processed: results.length, results });
  } catch (error) {
    logApiError(error, {
      route: "/api/cron/run",
      method: "GET",
      statusCode: 500,
      details: { requestedLimit: 50 },
    });

    return NextResponse.json({ error: "Failed to execute scheduled scans" }, { status: 500 });
  }
}
