import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStripe, PLANS } from "@/lib/stripe";
import type { PlanKey } from "@/lib/stripe";
import type { SubscriptionTier } from "@prisma/client";

/**
 * Map a Stripe PlanKey to a DB SubscriptionTier.
 * ENTERPRISE_PLUS maps to ENTERPRISE because the DB enum does not include it.
 */
function toDbTier(planKey: PlanKey): SubscriptionTier {
  if (planKey === "ENTERPRISE_PLUS") return "ENTERPRISE";
  return planKey as SubscriptionTier;
}

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj = (event.data as any).object;

  switch (event.type) {
    case "checkout.session.completed": {
      const orgId = obj.metadata?.orgId as string | undefined;
      const planKey = obj.metadata?.plan as PlanKey | undefined;
      const subscriptionId = obj.subscription as string;

      if (!orgId || !planKey) break;

      const plan = PLANS[planKey];

      await db.subscription.upsert({
        where: { orgId },
        update: {
          tier: toDbTier(planKey),
          status: "ACTIVE",
          stripeSubscriptionId: subscriptionId,
          stripePriceId: plan.priceId,
          maxApps: plan.maxApps,
          maxUsers: plan.maxUsers,
          trialEndsAt: null,
        },
        create: {
          orgId,
          tier: toDbTier(planKey),
          status: "ACTIVE",
          stripeSubscriptionId: subscriptionId,
          stripePriceId: plan.priceId,
          maxApps: plan.maxApps,
          maxUsers: plan.maxUsers,
        },
      });
      break;
    }

    case "customer.subscription.updated": {
      const existing = await db.subscription.findFirst({
        where: { stripeSubscriptionId: obj.id },
      });
      if (!existing) break;

      await db.subscription.update({
        where: { id: existing.id },
        data: {
          status: obj.status === "active" ? "ACTIVE" : obj.status === "past_due" ? "PAST_DUE" : "CANCELED",
          cancelAtPeriodEnd: obj.cancel_at_period_end ?? false,
        },
      });
      break;
    }

    case "customer.subscription.deleted": {
      const existing = await db.subscription.findFirst({
        where: { stripeSubscriptionId: obj.id },
      });
      if (!existing) break;

      await db.subscription.update({
        where: { id: existing.id },
        data: {
          tier: "FREE",
          status: "CANCELED",
          maxApps: 2,
          maxUsers: 1,
          stripeSubscriptionId: null,
          stripePriceId: null,
        },
      });
      break;
    }
  }

  return NextResponse.json({ received: true });
}
