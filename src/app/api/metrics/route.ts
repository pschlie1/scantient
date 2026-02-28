import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getOrgMetrics } from "@/lib/metrics";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const metrics = await getOrgMetrics(session.orgId);
  return NextResponse.json(metrics);
}
