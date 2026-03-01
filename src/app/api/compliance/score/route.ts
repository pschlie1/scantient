import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getOrgLimits } from "@/lib/tenant";
import { db } from "@/lib/db";
import { calculateComplianceScore } from "@/lib/compliance-score";

const ALLOWED_TIERS = ["PRO", "ENTERPRISE", "ENTERPRISE_PLUS"];

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limits = await getOrgLimits(session.orgId);
  if (!ALLOWED_TIERS.includes(limits.tier)) {
    return NextResponse.json(
      { error: "Compliance score reporting is available on Pro and Enterprise plans." },
      { status: 403 },
    );
  }

  // Load all open findings for this org (across all apps and runs)
  const openFindings = await db.finding.findMany({
    where: {
      status: "OPEN",
      run: { app: { orgId: session.orgId } },
    },
    select: {
      code: true,
      title: true,
      severity: true,
    },
  });

  const result = calculateComplianceScore(
    openFindings.map((f) => ({
      code: f.code,
      title: f.title,
      severity: f.severity,
    })),
  );

  return NextResponse.json(result);
}
