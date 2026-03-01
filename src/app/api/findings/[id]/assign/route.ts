import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getOrgLimits } from "@/lib/tenant";

const assignSchema = z.object({
  userId: z.string().nullable(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limits = await getOrgLimits(session.orgId);
  if (!["STARTER", "PRO", "ENTERPRISE", "ENTERPRISE_PLUS"].includes(limits.tier)) {
    return NextResponse.json({ error: "Finding assignment requires a Starter plan or higher." }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = assignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Verify finding belongs to user's org
  const finding = await db.finding.findFirst({
    where: { id },
    include: { run: { include: { app: true } } },
  });

  if (!finding || finding.run.app.orgId !== session.orgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { userId } = parsed.data;

  if (userId === null) {
    // Unassign all
    await db.findingAssignment.deleteMany({ where: { findingId: id } });
    return NextResponse.json({ assignment: null });
  }

  // Verify user belongs to same org
  const user = await db.user.findFirst({
    where: { id: userId, orgId: session.orgId },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found in org" }, { status: 404 });
  }

  const assignment = await db.findingAssignment.upsert({
    where: { findingId_userId: { findingId: id, userId } },
    update: {},
    create: { findingId: id, userId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return NextResponse.json({ assignment });
}
