import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getOrgLimits } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limits = await getOrgLimits(session.orgId);
  return NextResponse.json(limits);
}
