import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/tenant";
import { isPrivateUrl } from "@/lib/ssrf-guard";

const updateAppSchema = z.object({
  name: z.string().min(1).optional(),
  url: z.string().url().optional(),
  repoUrl: z.string().url().optional().nullable(),
  monitorEnabled: z.boolean().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const app = await db.monitoredApp.findFirst({
    where: { id, orgId: session.orgId },
    include: {
      monitorRuns: {
        orderBy: { startedAt: "desc" },
        include: { findings: { orderBy: { severity: "asc" } } },
        take: 20,
      },
    },
  });

  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ app });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (["VIEWER", "MEMBER"].includes(session.role)) {
    return NextResponse.json({ error: "Viewers have read-only access" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = updateAppSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // SSRF guard: reject private/internal URLs at save time
  if (parsed.data.url && await isPrivateUrl(parsed.data.url)) {
    return NextResponse.json(
      { error: "App URL must be a public address. Private and internal URLs are not allowed." },
      { status: 400 },
    );
  }

  const app = await db.monitoredApp.findFirst({
    where: { id, orgId: session.orgId },
  });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await db.monitoredApp.update({
    where: { id },
    data: parsed.data,
  });

  await logAudit(session, "app.updated", id, `Updated ${updated.name}`);
  return NextResponse.json({ app: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (["VIEWER", "MEMBER"].includes(session.role)) {
    return NextResponse.json({ error: "Viewers have read-only access" }, { status: 403 });
  }

  const { id } = await params;

  // Verify ownership
  const app = await db.monitoredApp.findFirst({
    where: { id, orgId: session.orgId },
  });

  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.monitoredApp.delete({ where: { id } });
  await logAudit(session, "app.deleted", id, `Removed ${app.name}`);

  return NextResponse.json({ ok: true });
}
