import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getOrgLimits } from "@/lib/tenant";
import { atLeast } from "@/lib/tier-capabilities";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limits = await getOrgLimits(session.orgId);
  if (!atLeast(limits.tier, "PRO")) {
    return NextResponse.json({ error: "Scan history trends require a Pro plan or higher." }, { status: 403 });
  }

  const { id } = await params;

  const app = await db.monitoredApp.findFirst({
    where: { id, orgId: session.orgId },
    select: { id: true },
  });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const runs = await db.monitorRun.findMany({
    where: { appId: id },
    orderBy: { startedAt: "asc" },
    take: 50,
    select: {
      id: true,
      status: true,
      startedAt: true,
      findings: {
        select: { severity: true },
      },
    },
  });

  const data = runs.map((run) => {
    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const f of run.findings) {
      counts[f.severity]++;
    }
    const total = run.findings.length;
    // Score: 100 minus weighted penalties
    const score = Math.max(
      0,
      100 - counts.CRITICAL * 25 - counts.HIGH * 10 - counts.MEDIUM * 3 - counts.LOW * 1
    );
    return {
      date: run.startedAt.toISOString(),
      score,
      critical: counts.CRITICAL,
      high: counts.HIGH,
      medium: counts.MEDIUM,
      low: counts.LOW,
      total,
    };
  });

  return NextResponse.json(data);
}
