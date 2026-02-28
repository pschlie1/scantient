import { NextResponse } from "next/server";
import { runDueHttpScans } from "@/lib/scanner-http";
import { logApiError } from "@/lib/observability";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await runDueHttpScans(50);
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
