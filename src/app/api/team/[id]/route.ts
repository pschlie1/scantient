import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/tenant";

const patchSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]),
});

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!["OWNER", "ADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { id } = await params;

  if (id === session.id) {
    return NextResponse.json({ error: "You cannot remove yourself" }, { status: 400 });
  }

  const target = await db.user.findFirst({ where: { id, orgId: session.orgId } });
  if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  if (target.role === "OWNER") {
    return NextResponse.json({ error: "Cannot remove the account owner" }, { status: 403 });
  }

  await db.user.delete({ where: { id } });
  await logAudit(session, "user.removed", id, `Removed ${target.email} from org`);
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (session.role !== "OWNER") {
    return NextResponse.json({ error: "Only the account owner is allowed to change roles" }, { status: 403 });
  }

  const { id } = await params;

  if (id === session.id) {
    return NextResponse.json({ error: "You cannot change your own role" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const target = await db.user.findFirst({ where: { id, orgId: session.orgId } });
  if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  if (target.role === "OWNER") {
    return NextResponse.json({ error: "Cannot change the owner role" }, { status: 403 });
  }

  const updated = await db.user.update({
    where: { id },
    data: { role: parsed.data.role },
    select: { id: true, name: true, email: true, role: true },
  });

  await logAudit(
    session,
    "user.role_changed",
    id,
    `Changed ${target.email} role to ${parsed.data.role}`,
  );
  return NextResponse.json({ member: updated });
}
