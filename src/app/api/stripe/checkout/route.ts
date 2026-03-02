import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getStripe, PLANS } from "@/lib/stripe";
import type { PlanKey } from "@/lib/stripe";
import { checkRateLimit } from "@/lib/rate-limit";

const checkoutSchema = z.object({
  plan: z.enum(["STARTER", "PRO", "ENTERPRISE", "ENTERPRISE_PLUS"]),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`stripe-checkout:${session.id}`, { maxAttempts: 5, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSeconds ?? 60) },
    });
  }

  const body = await req.json();
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const plan = PLANS[parsed.data.plan as PlanKey];
  if (!plan.priceId) {
    return NextResponse.json({ error: "Stripe not configured for this plan" }, { status: 500 });
  }

  // Get or create Stripe customer
  const org = await db.organization.findUnique({ where: { id: session.orgId } });
  if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });

  let customerId = org.stripeCustomerId;
  if (!customerId) {
    const customer = await getStripe().customers.create({
      email: session.email,
      name: org.name,
      metadata: { orgId: org.id },
    });

    // Atomic claim: only write if stripeCustomerId is still null
    const result = await db.organization.updateMany({
      where: { id: session.orgId, stripeCustomerId: null },
      data: { stripeCustomerId: customer.id },
    });

    if (result.count === 0) {
      // Another request won the race -- clean up orphaned Stripe customer
      await getStripe().customers.del(customer.id).catch(() => {});
      // Re-fetch to get the real customerId
      const fresh = await db.organization.findUnique({
        where: { id: session.orgId },
        select: { stripeCustomerId: true },
      });
      customerId = fresh?.stripeCustomerId ?? customer.id;
    } else {
      customerId = customer.id;
    }
  }

  const checkoutSession = await getStripe().checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: plan.priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000"}/settings/billing?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000"}/settings/billing`,
    metadata: { orgId: session.orgId, plan: parsed.data.plan },
  });

  return NextResponse.json({ url: checkoutSession.url });
}
