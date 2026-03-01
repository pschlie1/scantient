import { NextResponse } from "next/server";
import { z } from "zod";
import { addDays } from "date-fns";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAddUser, logAudit } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const members = await db.user.findMany({
    where: { orgId: session.orgId },
    select: { id: true, name: true, email: true, role: true, lastLoginAt: true },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  return NextResponse.json({ members });
}

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]),
});

async function sendInviteEmail(
  to: string,
  orgName: string,
  inviterName: string | null,
  role: string,
  inviteToken: string,
) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM_EMAIL ?? "noreply@scantient.com";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_URL ?? "https://scantient.com";

  if (!key) {
    console.warn("[team] RESEND_API_KEY not set. Skipping invite email.");
    return;
  }

  const inviteUrl = `${appUrl}/invite/${inviteToken}`;
  const inviterDisplay = inviterName ?? "Someone";

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto;">
      <div style="margin-bottom: 32px;">
        <div style="width: 40px; height: 40px; background: #000; border-radius: 10px; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
          <span style="color: #fff; font-weight: bold; font-size: 18px;">V</span>
        </div>
        <h1 style="font-size: 22px; font-weight: 700; margin: 0 0 8px 0; color: #111;">
          You've been invited to join ${orgName} on Scantient
        </h1>
        <p style="color: #555; font-size: 14px; margin: 0;">
          ${inviterDisplay} has invited you to join <strong>${orgName}</strong> as a <strong>${role}</strong>.
        </p>
      </div>

      <a
        href="${inviteUrl}"
        style="display: inline-block; background: #000; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; margin-bottom: 24px;"
      >
        Accept invitation →
      </a>

      <p style="font-size: 13px; color: #888; margin-top: 24px;">
        This invite expires in 7 days. If you weren't expecting this, you can safely ignore it.
      </p>
      <p style="font-size: 13px; color: #aaa;">
        Or copy this link: <a href="${inviteUrl}" style="color: #555;">${inviteUrl}</a>
      </p>
    </div>
  `;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `You've been invited to join ${orgName} on Scantient`,
      html,
    }),
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fix 4: Rate limit invitations per org to prevent spam (10 per hour)
  const inviteLimit = await checkRateLimit(`team-invite:${session.orgId}`, {
    maxAttempts: 10,
    windowMs: 60 * 60 * 1000,
    fallbackMode: "fail-closed",
  });
  if (!inviteLimit.allowed) {
    return NextResponse.json(
      { error: "Too many invitations sent. Try again later." },
      { status: 429 },
    );
  }

  // Only OWNER and ADMIN can invite
  if (!["OWNER", "ADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Admin access required to invite team members" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email, role } = parsed.data;

  const { allowed, reason } = await canAddUser(session.orgId);
  if (!allowed) {
    return NextResponse.json({ error: reason }, { status: 403 });
  }

  // Check if user already in org
  const existing = await db.user.findFirst({
    where: { email, orgId: session.orgId },
  });
  if (existing) {
    return NextResponse.json({ error: "User already in team" }, { status: 409 });
  }

  // Check if there's already a pending invite for this email in this org
  const existingInvite = await db.invite.findFirst({
    where: { email, orgId: session.orgId, expiresAt: { gt: new Date() } },
  });
  if (existingInvite) {
    return NextResponse.json({ error: "An active invite already exists for this email" }, { status: 409 });
  }

  // Fetch org name for the email
  const org = await db.organization.findUnique({
    where: { id: session.orgId },
    select: { name: true },
  });

  const token = crypto.randomUUID();

  const invite = await db.invite.create({
    data: {
      email,
      role,
      orgId: session.orgId,
      token,
      expiresAt: addDays(new Date(), 7),
    },
  });

  await logAudit(session, "user.invited", invite.id, `Invited ${email} as ${role}`);

  // Send invite email (fire — failures are logged but don't block response)
  try {
    await sendInviteEmail(email, org?.name ?? session.orgName, session.name, role, token);
  } catch (err) {
    console.warn("[team] Failed to send invite email:", err);
  }

  return NextResponse.json({ message: "Invite sent" }, { status: 201 });
}
