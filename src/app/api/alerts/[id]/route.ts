import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

const updateAlertSchema = z.object({
  enabled: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (["VIEWER", "MEMBER"].includes(session.role)) {
    return NextResponse.json({ error: "Viewers have read-only access" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = updateAlertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const config = await db.alertConfig.findFirst({
    where: { id, orgId: session.orgId },
  });
  if (!config) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await db.alertConfig.update({
    where: { id },
    data: { enabled: parsed.data.enabled ?? config.enabled },
  });

  return NextResponse.json({ config: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (["VIEWER", "MEMBER"].includes(session.role)) {
    return NextResponse.json({ error: "Viewers have read-only access" }, { status: 403 });
  }

  const { id } = await params;
  const config = await db.alertConfig.findFirst({
    where: { id, orgId: session.orgId },
  });
  if (!config) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.alertConfig.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
