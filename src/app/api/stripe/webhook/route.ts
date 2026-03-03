import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { getStripe, PLANS } from "@/lib/stripe";
import type { PlanKey } from "@/lib/stripe";
import type { SubscriptionTier } from "@prisma/client";

/**
 * Map a Stripe PlanKey to a DB SubscriptionTier.
 * Direct 1:1 mapping now that ENTERPRISE_PLUS is a first-class enum value.
 */
function toDbTier(planKey: PlanKey): SubscriptionTier {
  const map: Record<PlanKey, SubscriptionTier> = {
    FREE: "FREE",
    STARTER: "STARTER",
    PRO: "PRO",
    ENTERPRISE: "ENTERPRISE",
    ENTERPRISE_PLUS: "ENTERPRISE_PLUS",
  };
  return map[planKey] ?? "FREE";
}

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event;
  try {
    // constructEvent verifies the Stripe-Signature header — events not originating
    // from Stripe will throw and return 400 before any DB writes occur.
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotency: all DB writes below use `upsert` keyed on orgId/stripeSubscriptionId,
  // so replayed events (Stripe guarantees at-least-once delivery) are safe no-ops.
  // If stricter deduplication is ever required, store event.id in a processed_events
  // table and skip if already seen.

  switch (event.type) {
    case "checkout.session.completed": {
      const obj = event.data.object as Stripe.Checkout.Session;
      const orgId = obj.metadata?.orgId;
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
      const obj = event.data.object as Stripe.Subscription;
      const existing = await db.subscription.findFirst({
        where: { stripeSubscriptionId: obj.id },
      });
      if (!existing) break;

      // Build reverse price-to-plan map
      const priceToPlan: Record<string, PlanKey> = {};
      for (const [key, plan] of Object.entries(PLANS)) {
        if (plan.priceId) priceToPlan[plan.priceId] = key as PlanKey;
      }

      const newPriceId = obj.items?.data?.[0]?.price?.id as string | undefined;
      const newPlanKey = newPriceId ? priceToPlan[newPriceId] : undefined;
      const newPlan = newPlanKey ? PLANS[newPlanKey] : undefined;

      await db.subscription.update({
        where: { id: existing.id },
        data: {
          status: obj.status === "active" ? "ACTIVE" : obj.status === "past_due" ? "PAST_DUE" : "CANCELED",
          cancelAtPeriodEnd: obj.cancel_at_period_end ?? false,
          // Only update tier/limits if we can identify the new plan
          ...(newPlan && newPlanKey ? {
            tier: toDbTier(newPlanKey),
            maxApps: newPlan.maxApps,
            maxUsers: newPlan.maxUsers,
            stripePriceId: newPriceId,
          } : {}),
        },
      });
      break;
    }

    case "invoice.payment_failed": {
      const obj = event.data.object as Stripe.Invoice;
      // Stripe SDK v20+: subscription ID lives under parent.subscription_details.subscription
      const rawSub = obj.parent?.subscription_details?.subscription;
      const subscriptionId: string | null = typeof rawSub === "string" ? rawSub : (rawSub as Stripe.Subscription | null)?.id ?? null;
      if (!subscriptionId) break;

      const existing = await db.subscription.findFirst({
        where: { stripeSubscriptionId: subscriptionId },
      });
      if (!existing) break;

      await db.subscription.update({
        where: { id: existing.id },
        data: { status: "PAST_DUE" },
      });
      break;
    }

    case "customer.subscription.deleted": {
      const obj = event.data.object as Stripe.Subscription;
      const existing = await db.subscription.findFirst({
        where: { stripeSubscriptionId: obj.id },
      });
      if (!existing) break;

      await db.subscription.update({
        where: { id: existing.id },
        data: {
          tier: "FREE",
          status: "CANCELED",
          maxApps: 1,
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
