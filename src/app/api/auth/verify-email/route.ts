import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { db } from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is required");
  return secret;
}

interface VerifyTokenPayload {
  sub: string;
  purpose: string;
}

export async function GET(req: Request) {
  const ip = getClientIp(req);
  const rl = await checkRateLimit(`verify-email:${ip}`, { maxAttempts: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSeconds ?? 60) },
    });
  }

  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  let payload: VerifyTokenPayload;
  try {
    payload = jwt.verify(token, getJwtSecret()) as VerifyTokenPayload;
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  if (payload.purpose !== "email-verify") {
    return NextResponse.json({ error: "Invalid token purpose" }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const wasAlreadyVerified = user.emailVerified;

  if (!user.emailVerified) {
    await db.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://scantient.com";
  // First-time verification → redirect to dashboard with onboarding wizard
  const redirectUrl = wasAlreadyVerified
    ? `${appUrl}/dashboard`
    : `${appUrl}/dashboard?onboarding=true`;

  return NextResponse.json({ ok: true, redirectUrl });
}
