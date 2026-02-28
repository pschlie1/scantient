import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getIncidentEvidenceExport, parseRange } from "@/lib/wave3-reporting";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const range = parseRange({
    from: req.nextUrl.searchParams.get("from"),
    to: req.nextUrl.searchParams.get("to"),
    defaultDays: 30,
  });

  const payload = await getIncidentEvidenceExport(session.orgId, range);
  return NextResponse.json(payload);
}
