import { NextResponse } from "next/server";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { db } from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email(),
});

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is required");
  return secret;
}

async function sendPasswordResetEmail(to: string, resetLink: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM_EMAIL ?? "noreply@vibesafe.app";

  if (!key) {
    console.warn("[auth] RESEND_API_KEY not set. Skipping password reset email.");
    return;
  }

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px;">
      <h2>Reset your VibeSafe password</h2>
      <p>Click the link below to reset your password. This link expires in 1 hour.</p>
      <p><a href="${resetLink}" style="display:inline-block;padding:10px 20px;background:#000;color:#fff;border-radius:6px;text-decoration:none;">Reset Password</a></p>
      <p style="font-size:12px;color:#666;">If you didn't request this, you can ignore this email.</p>
    </div>
  `;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject: "Reset your VibeSafe password", html }),
  });
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const limit = await checkRateLimit(`forgot-password:${ip}`, {
    maxAttempts: 5,
    windowMs: 60 * 60 * 1000,
    fallbackMode: "fail-open",
  });
  if (!limit.allowed) {
    // Still return 200 to avoid leaking info, but don't process
    return NextResponse.json({ ok: true });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    // Always return 200 to not leak whether email exists
    return NextResponse.json({ ok: true });
  }

  const { email } = parsed.data;

  const user = await db.user.findFirst({ where: { email } });

  if (user) {
    const token = jwt.sign(
      { sub: user.id, purpose: "password-reset" },
      getJwtSecret(),
      { expiresIn: "1h" },
    );

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://vibesafe-two.vercel.app";
    const resetLink = `${appUrl}/reset-password?token=${token}`;

    await sendPasswordResetEmail(email, resetLink);
  }

  // Always return 200 — don't leak user existence
  return NextResponse.json({ ok: true });
}
