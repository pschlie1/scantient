import { NextResponse } from "next/server";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { db } from "@/lib/db";
import { hashPassword, createSession } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { trackEvent } from "@/lib/analytics";
import { extractSuggestedDomain } from "@/lib/onboarding";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is required");
  return secret;
}

async function sendVerificationEmail(to: string, verifyLink: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM_EMAIL ?? "noreply@scantient.com";

  if (!key) {
    console.warn("[auth] RESEND_API_KEY not set. Skipping verification email.");
    return;
  }

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px;">
      <h2>Verify your Scantient email</h2>
      <p>Click the link below to verify your email address. This link expires in 24 hours.</p>
      <p><a href="${verifyLink}" style="display:inline-block;padding:10px 20px;background:#000;color:#fff;border-radius:6px;text-decoration:none;">Verify Email</a></p>
      <p style="font-size:12px;color:#666;">If you didn't sign up for Scantient, you can ignore this email.</p>
    </div>
  `;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject: "Verify your Scantient email", html }),
  });
}

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12, "Password must be at least 12 characters"),
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
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://scantient.com";
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

  // Fire-and-forget: onboarding welcome email
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_URL ?? "https://scantient.com";
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.ALERT_FROM_EMAIL ?? "noreply@scantient.com";
  if (resendKey) {
    const onboardingHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; color: #111;">
        <div style="margin-bottom: 28px;">
          <div style="width: 40px; height: 40px; background: #000; border-radius: 10px; margin-bottom: 16px; display: inline-flex; align-items: center; justify-content: center;">
            <span style="color: #fff; font-weight: bold; font-size: 18px; line-height: 1;">V</span>
          </div>
          <h1 style="font-size: 22px; font-weight: 700; margin: 0 0 8px 0;">Welcome to Scantient 🎉</h1>
          <p style="color: #555; font-size: 15px; margin: 0; line-height: 1.6;">
            You're in. Here's how to get the most out of Scantient in the next few minutes.
          </p>
        </div>

        <ol style="padding-left: 0; list-style: none; margin: 0 0 32px 0;">
          <li style="display: flex; gap: 16px; margin-bottom: 20px;">
            <span style="flex-shrink: 0; width: 28px; height: 28px; background: #f3f4f6; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; color: #111;">1</span>
            <div>
              <p style="margin: 0 0 4px 0; font-weight: 600; font-size: 15px;">Verify your email</p>
              <p style="margin: 0; color: #666; font-size: 14px;">Click the verification link sent to your email to activate your account.</p>
            </div>
          </li>
          <li style="display: flex; gap: 16px; margin-bottom: 20px;">
            <span style="flex-shrink: 0; width: 28px; height: 28px; background: #f3f4f6; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; color: #111;">2</span>
            <div>
              <p style="margin: 0 0 4px 0; font-weight: 600; font-size: 15px;">Add your first app</p>
              <p style="margin: 0; color: #666; font-size: 14px;">Paste a URL — we'll scan it for security issues in seconds.</p>
            </div>
          </li>
          <li style="display: flex; gap: 16px;">
            <span style="flex-shrink: 0; width: 28px; height: 28px; background: #f3f4f6; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; color: #111;">3</span>
            <div>
              <p style="margin: 0 0 4px 0; font-weight: 600; font-size: 15px;">Set up alerts</p>
              <p style="margin: 0; color: #666; font-size: 14px;">Get notified by email, Slack, or webhook when issues are detected.</p>
            </div>
          </li>
        </ol>

        <a
          href="${appUrl}/dashboard"
          style="display: inline-block; background: #000; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600;"
        >
          Go to dashboard →
        </a>

        <p style="margin-top: 32px; font-size: 12px; color: #aaa;">
          If you have questions, reply to this email — we read every one.
        </p>
      </div>
    `;

    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject: "Welcome to Scantient — here's how to get started",
        html: onboardingHtml,
      }),
    }).catch((err) => console.warn("[auth] Failed to send onboarding email:", err));
  }

  const suggestedDomain = extractSuggestedDomain(email);
  return NextResponse.json({ user: session, suggestedDomain }, { status: 201 });
}
