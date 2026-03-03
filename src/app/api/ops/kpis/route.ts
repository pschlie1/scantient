import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getOrgLimits } from "@/lib/tenant";
import { getOrgOpsKpis } from "@/lib/ops-metrics";
import { atLeast } from "@/lib/tier-capabilities";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limits = await getOrgLimits(session.orgId);
  if (!atLeast(limits.tier, "STARTER")) {
    return NextResponse.json({ error: "Ops KPIs require a Starter plan or higher." }, { status: 403 });
  }

  const kpis = await getOrgOpsKpis(session.orgId);
  return NextResponse.json({ kpis });
}
