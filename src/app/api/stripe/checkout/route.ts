import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getStripe, PLANS } from "@/lib/stripe";
import type { PlanKey } from "@/lib/stripe";

const checkoutSchema = z.object({
  plan: z.enum(["STARTER", "PRO", "ENTERPRISE", "ENTERPRISE_PLUS"]),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    customerId = customer.id;
    await db.organization.update({
      where: { id: org.id },
      data: { stripeCustomerId: customerId },
    });
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
