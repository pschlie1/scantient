import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, createSession } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { trackEvent } from "@/lib/analytics";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(2),
  orgName: z.string().min(2),
});

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const limit = checkRateLimit(`signup:${ip}`, { maxAttempts: 3, windowMs: 60 * 60 * 1000 });
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
          emailVerified: true,
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

  await trackEvent({
    event: "signup_completed",
    orgId: org.id,
    userId: user.id,
    properties: { planTier: "FREE", trialDays: 14 },
  });

  return NextResponse.json({ user: session }, { status: 201 });
}
