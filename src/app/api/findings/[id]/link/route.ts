import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { parseRemediationMeta, linkPRToFinding } from "@/lib/remediation-lifecycle";
import { getOrgLimits } from "@/lib/tenant";

const linkSchema = z.object({
  url: z.string().url().refine(
    (u) => /github\.com\//.test(u),
    { message: "Must be a GitHub PR or commit URL" },
  ),
  title: z.string().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (session.role === "VIEWER") {
    return NextResponse.json({ error: "Viewers have read-only access" }, { status: 403 });
  }

  const limits = await getOrgLimits(session.orgId);
  if (!["PRO", "ENTERPRISE", "ENTERPRISE_PLUS"].includes(limits.tier)) {
    return NextResponse.json({ error: "PR linking requires a Pro plan or higher." }, { status: 403 });
  }

  const { id } = await params;

  // Verify finding belongs to org
  const finding = await db.finding.findFirst({
    where: { id, run: { app: { orgId: session.orgId } } },
  });
  if (!finding) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = linkSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const meta = await linkPRToFinding(id, {
    url: parsed.data.url,
    title: parsed.data.title,
    linkedAt: new Date().toISOString(),
    linkedBy: session.id,
  });

  await db.auditLog.create({
    data: {
      orgId: session.orgId,
      userId: session.id,
      action: "FINDING_PR_LINKED",
      resource: `finding:${id}`,
      details: JSON.stringify({ url: parsed.data.url }),
    },
  });

  return NextResponse.json({ linkedPRs: meta.linkedPRs });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limits = await getOrgLimits(session.orgId);
  if (!["PRO", "ENTERPRISE", "ENTERPRISE_PLUS"].includes(limits.tier)) {
    return NextResponse.json({ error: "PR linking requires a Pro plan or higher." }, { status: 403 });
  }

  const { id } = await params;
  const finding = await db.finding.findFirst({
    where: { id, run: { app: { orgId: session.orgId } } },
  });
  if (!finding) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { meta } = parseRemediationMeta(finding.notes);
  return NextResponse.json({ linkedPRs: meta.linkedPRs });
}
