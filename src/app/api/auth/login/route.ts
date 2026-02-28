import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const ip = getClientIp(req);
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

  const body = await req.json();
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
  }

  const { email, password } = parsed.data;

  const user = await db.user.findFirst({
    where: { email },
    include: { org: true },
  });

  if (!user || !user.passwordHash) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const session = await createSession(user.id);
  return NextResponse.json({ user: session });
}
