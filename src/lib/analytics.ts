import { db } from "@/lib/db";

export type AnalyticsEventName =
  | "signup_completed"
  | "app_created"
  | "scan_triggered"
  | "scan_completed"
  | "finding_resolved";

interface AnalyticsEventInput {
  event: AnalyticsEventName;
  orgId: string;
  userId?: string;
  properties?: Record<string, unknown>;
}

function isEnabled(): boolean {
  return process.env.INTERNAL_ANALYTICS_ENABLED === "1";
}

function redactProperties(properties: Record<string, unknown> = {}): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (/email|name|password|token|key|secret|url/i.test(key)) continue;
    redacted[key] = value;
  }
  return redacted;
}

/**
 * Privacy-safe internal analytics sink.
 * Env-gated and persisted via AuditLog to avoid vendor lock-in.
 */
export async function trackEvent(input: AnalyticsEventInput): Promise<void> {
  if (!isEnabled()) return;

  const details = {
    event: input.event,
    timestamp: new Date().toISOString(),
    properties: redactProperties(input.properties),
  };

  await db.auditLog.create({
    data: {
      orgId: input.orgId,
      userId: input.userId,
      action: "ANALYTICS_EVENT",
      resource: input.event,
      details: JSON.stringify(details),
    },
  }).catch(() => {
    // Non-blocking analytics; never impact user flow.
  });
}
