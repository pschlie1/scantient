import { NextResponse } from "next/server";
import { runDueHttpScans } from "@/lib/scanner-http";
import { logApiError } from "@/lib/observability";
import { validateCronAuth, logCronHeartbeat, NON_PREMIUM_TIERS } from "@/lib/cron-auth";

export async function GET(req: Request) {
  const authResult = validateCronAuth(req);
  if (!authResult.authorized) {
    return authResult.errorResponse!;
  }

  try {
    const results = await runDueHttpScans(50, { tiers: NON_PREMIUM_TIERS, includeNoSubscription: true });

    await logCronHeartbeat(results);

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
