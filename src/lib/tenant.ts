/**
 * Tenant-scoped database helpers.
 * Every data access goes through these to enforce isolation.
 */
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";

/** Get subscription limits for the current org */
export async function getOrgLimits(orgId: string) {
  const sub = await db.subscription.findUnique({ where: { orgId } });

  const defaults: Record<string, { maxApps: number; maxUsers: number }> = {
    FREE: { maxApps: 1, maxUsers: 1 },
    STARTER: { maxApps: 5, maxUsers: 2 },
    PRO: { maxApps: 15, maxUsers: 10 },
    ENTERPRISE: { maxApps: 100, maxUsers: 50 },
    ENTERPRISE_PLUS: { maxApps: 999, maxUsers: 999 },
    EXPIRED: { maxApps: 0, maxUsers: 0 },
  };

  let tier: string = sub?.tier ?? "FREE";
  const status = sub?.status ?? "TRIALING";

  // Check trial expiry: if trial has ended and no active subscription, mark as EXPIRED
  if (
    sub?.trialEndsAt &&
    new Date(sub.trialEndsAt) < new Date() &&
    status !== "ACTIVE"
  ) {
    tier = "EXPIRED";
  }

  return {
    tier,
    status,
    ...defaults[tier] ?? defaults.FREE,
    trialEndsAt: sub?.trialEndsAt,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
  };
}

/** Check if org can add more apps */
export async function canAddApp(orgId: string): Promise<{ allowed: boolean; reason?: string }> {
  const limits = await getOrgLimits(orgId);
  const currentApps = await db.monitoredApp.count({ where: { orgId } });

  if (currentApps >= limits.maxApps) {
    return {
      allowed: false,
      reason: `Your ${limits.tier} plan allows ${limits.maxApps} apps. Upgrade to add more.`,
    };
  }

  return { allowed: true };
}

/** Check if org can add more users */
export async function canAddUser(orgId: string): Promise<{ allowed: boolean; reason?: string }> {
  const limits = await getOrgLimits(orgId);
  const currentUsers = await db.user.count({ where: { orgId } });

  if (currentUsers >= limits.maxUsers) {
    return {
      allowed: false,
      reason: `Your ${limits.tier} plan allows ${limits.maxUsers} users. Upgrade to add more.`,
    };
  }

  return { allowed: true };
}

/** Audit log helper */
export async function logAudit(
  session: SessionUser,
  action: string,
  resource: string,
  details?: string,
) {
  await db.auditLog.create({
    data: {
      orgId: session.orgId,
      userId: session.id,
      action,
      resource,
      details,
    },
  });
}
