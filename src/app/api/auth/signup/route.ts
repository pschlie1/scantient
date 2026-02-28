import { NextResponse } from "next/server";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { db } from "@/lib/db";
import { hashPassword, createSession } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { trackEvent } from "@/lib/analytics";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is required");
  return secret;
}

async function sendVerificationEmail(to: string, verifyLink: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM_EMAIL ?? "noreply@vibesafe.app";

  if (!key) {
    console.warn("[auth] RESEND_API_KEY not set. Skipping verification email.");
    return;
  }

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px;">
      <h2>Verify your VibeSafe email</h2>
      <p>Click the link below to verify your email address. This link expires in 24 hours.</p>
      <p><a href="${verifyLink}" style="display:inline-block;padding:10px 20px;background:#000;color:#fff;border-radius:6px;text-decoration:none;">Verify Email</a></p>
      <p style="font-size:12px;color:#666;">If you didn't sign up for VibeSafe, you can ignore this email.</p>
    </div>
  `;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject: "Verify your VibeSafe email", html }),
  });
}

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(2),
  orgName: z.string().min(2),
});

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const limit = await checkRateLimit(`signup:${ip}`, {
    maxAttempts: 3,
    windowMs: 60 * 60 * 1000,
    fallbackMode: "fail-closed",
  });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many signup attempts. Please try again later." }, {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds ?? 60) },
    });
  }

  const body = await req.json();
  const parsed = signupSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email, password, name, orgName } = parsed.data;

  // Check if user already exists
  const existing = await db.user.findFirst({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  // Create org + user + free subscription in a transaction
  const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const passwordHash = await hashPassword(password);

  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 14); // 14-day trial

  const org = await db.organization.create({
    data: {
      name: orgName,
      slug: `${slug}-${Date.now().toString(36)}`,
      users: {
        create: {
          email,
          name,
          passwordHash,
          role: "OWNER",
          emailVerified: false,
        },
      },
      subscription: {
        create: {
          tier: "FREE",
          status: "TRIALING",
          maxApps: 2,
          maxUsers: 1,
          trialEndsAt: trialEnd,
        },
      },
    },
    include: { users: true },
  });

  const user = org.users[0];
  const session = await createSession(user.id);

  // Send email verification
  try {
    const verifyToken = jwt.sign(
      { sub: user.id, purpose: "email-verify" },
      getJwtSecret(),
      { expiresIn: "24h" },
    );
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://vibesafe-two.vercel.app";
    const verifyLink = `${appUrl}/verify-email?token=${verifyToken}`;
    await sendVerificationEmail(email, verifyLink);
  } catch (err) {
    console.warn("[auth] Failed to send verification email:", err);
  }

  await trackEvent({
    event: "signup_completed",
    orgId: org.id,
    userId: user.id,
    properties: { planTier: "FREE", trialDays: 14 },
  });

  return NextResponse.json({ user: session }, { status: 201 });
}
