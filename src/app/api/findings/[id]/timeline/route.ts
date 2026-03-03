import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { parseRemediationMeta } from "@/lib/remediation-lifecycle";
import { getOrgLimits } from "@/lib/tenant";
import { atLeast } from "@/lib/tier-capabilities";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limits = await getOrgLimits(session.orgId);
  if (!atLeast(limits.tier, "PRO")) {
    return NextResponse.json({ error: "Remediation timeline requires a Pro plan or higher." }, { status: 403 });
  }

  const { id } = await params;
  const finding = await db.finding.findFirst({
    where: { id, run: { app: { orgId: session.orgId } } },
    include: {
      assignments: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { assignedAt: "asc" },
      },
    },
  });
  if (!finding) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { meta } = parseRemediationMeta(finding.notes);

  // Merge assignment events into timeline if not already there
  const assignmentTimestamps = new Set(
    meta.timeline.filter((e) => e.action === "assigned").map((e) => e.details),
  );

  for (const a of finding.assignments) {
    const key = `Assigned to ${a.user.name ?? a.user.email}`;
    if (!assignmentTimestamps.has(key)) {
      meta.timeline.push({
        timestamp: a.assignedAt.toISOString(),
        actor: "system",
        action: "assigned",
        details: key,
      });
    }
  }

  // Sort timeline chronologically
  meta.timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return NextResponse.json({
    findingId: id,
    lifecycleStage: meta.lifecycleStage,
    priority: meta.priority ?? null,
    timeline: meta.timeline,
    linkedPRs: meta.linkedPRs,
  });
}
