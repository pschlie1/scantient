import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, createSession } from "@/lib/auth";
import { canAddUser, logAudit } from "@/lib/tenant";

// GET /api/auth/invite/[token] — return invite details
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const invite = await db.invite.findUnique({
    where: { token },
    include: { org: true },
  });

  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  if (invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invite has expired" }, { status: 410 });
  }

  return NextResponse.json({
    email: invite.email,
    orgName: invite.org.name,
    role: invite.role,
  });
}

const acceptSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  password: z.string().min(12, "Password must be at least 12 characters"),
});

// POST /api/auth/invite/[token] — accept invite and create account
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const invite = await db.invite.findUnique({
    where: { token },
    include: { org: true },
  });

  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  if (invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invite has expired" }, { status: 410 });
  }

  const body = await req.json();
  const parsed = acceptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, password } = parsed.data;

  // Check if user already exists with this email
  const existing = await db.user.findFirst({
    where: { email: invite.email },
  });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 },
    );
  }

  // Check if org can still accept more users at acceptance time (prevents race conditions)
  const userCheck = await canAddUser(invite.orgId);
  if (!userCheck.allowed) {
    return NextResponse.json(
      { error: "Your organization has reached its user limit. Ask the owner to upgrade the plan." },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(password);

  // Create user in the invite's org
  const user = await db.user.create({
    data: {
      email: invite.email,
      name,
      passwordHash,
      role: invite.role,
      orgId: invite.orgId,
      emailVerified: true, // verified by clicking the invite link
    },
  });

  // Delete the invite (one-time use)
  await db.invite.delete({ where: { token } });

  // Create session
  const session = await createSession(user.id);
  // Audit log: invite accepted (fire-and-forget)
  logAudit(session, "invite.accepted", "auth", `invite:${token}`).catch(() => { /* non-fatal */ });

  return NextResponse.json({ user: session }, { status: 201 });
}
