import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getOrgOpsKpis } from "@/lib/ops-metrics";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const kpis = await getOrgOpsKpis(session.orgId);
  return NextResponse.json({ kpis });
}
