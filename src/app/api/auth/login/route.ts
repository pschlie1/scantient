import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { logAudit } from "@/lib/tenant";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    console.log("[login] step: rate-limit ip", ip);
    const limit = await checkRateLimit(`login:${ip}`, {
      maxAttempts: 5,
      windowMs: 15 * 60 * 1000,
      fallbackMode: "fail-closed",
    });
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many login attempts. Please try again later." }, {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds ?? 60) },
      });
    }

    console.log("[login] step: parse body");
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
    }

    const { email, password } = parsed.data;

    console.log("[login] step: rate-limit email", email);
    const emailLimit = await checkRateLimit(`login-email:${email.toLowerCase()}`, {
      maxAttempts: 10,
      windowMs: 60 * 60 * 1000,
      fallbackMode: "fail-closed",
    });
    if (!emailLimit.allowed) {
      return NextResponse.json({ error: "Too many login attempts. Please try again later." }, {
        status: 429,
        headers: { "Retry-After": String(emailLimit.retryAfterSeconds ?? 3600) },
      });
    }

    console.log("[login] step: db lookup");
    const user = await db.user.findFirst({
      where: { email },
      include: { org: true },
    });

    if (!user || !user.passwordHash) {
      console.log("[login] user not found or no password");
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    if (!user.emailVerified) {
      console.log("[login] email not verified");
      return NextResponse.json(
        { error: "Please verify your email before logging in" },
        { status: 403 },
      );
    }

    console.log("[login] step: verify password");
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      console.log("[login] invalid password");
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    console.log("[login] step: create session");
    const session = await createSession(user.id);
    console.log("[login] step: audit log");
    logAudit(session, "user.login", "auth").catch(() => { /* non-fatal */ });
    console.log("[login] step: return response");
    return NextResponse.json({ user: session });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[login] UNHANDLED ERROR:", message);
    if (stack) console.error("[login] STACK:", stack);
    return NextResponse.json({ error: "Internal server error", detail: message }, { status: 500 });
  }
}
