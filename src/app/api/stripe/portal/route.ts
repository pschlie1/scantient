import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`stripe-portal:${session.id}`, { maxAttempts: 5, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSeconds ?? 60) },
    });
  }

  const org = await db.organization.findUnique({ where: { id: session.orgId } });
  if (!org?.stripeCustomerId) {
    return NextResponse.json({ error: "No billing account found" }, { status: 404 });
  }

  const portalSession = await getStripe().billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: `${process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000"}/settings/billing`,
  });

  return NextResponse.json({ url: portalSession.url });
}
