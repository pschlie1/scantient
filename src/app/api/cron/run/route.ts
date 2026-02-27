import { NextResponse } from "next/server";
import { runDueHttpScans } from "@/lib/scanner-http";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await runDueHttpScans(50);
  return NextResponse.json({ ok: true, processed: results.length, results });
}
