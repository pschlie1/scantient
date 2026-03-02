/**
 * Stripe Infrastructure Connector (Tier 3-C)
 *
 * Checks:
 *  1. Test mode in production — CRITICAL if key starts with `sk_test_`
 *  2. Webhook endpoint health — HIGH if any webhook has >5% failure rate (last 7 days)
 *  3. No webhook signing secret — HIGH if webhooks exist but STRIPE_WEBHOOK_SECRET not set
 *  4. Livemode balance fetch — validates the key works; MEDIUM if unreachable
 *
 * Credentials: { secretKey: string }
 * API: https://api.stripe.com/v1/
 * All fetches use ssrfSafeFetch.
 */

import { ssrfSafeFetch } from "@/lib/ssrf-guard";
import type { ConnectorResult, SecurityFinding } from "./types";

// ─── API types ────────────────────────────────────────────────────────────────

interface StripeBalance {
  object: "balance";
  livemode: boolean;
  available: Array<{ amount: number; currency: string }>;
}

interface StripeWebhookEndpoint {
  id: string;
  url: string;
  status: "enabled" | "disabled";
  enabled_events: string[];
}

interface StripeEvent {
  id: string;
  type: string;
  livemode: boolean;
  created: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripeHeaders(secretKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${secretKey}`,
    "User-Agent": "Scantient/1.0 (Infrastructure Connector)",
    Accept: "application/json",
  };
}

async function fetchStripe<T>(
  url: string,
  secretKey: string,
): Promise<{ data: T | null; error: string | null; status: number }> {
  try {
    const res = await ssrfSafeFetch(
      url,
      {
        method: "GET",
        headers: stripeHeaders(secretKey),
        signal: AbortSignal.timeout(12_000),
      },
      1,
    );
    if (!res.ok) {
      return { data: null, error: `Stripe API error: HTTP ${res.status}`, status: res.status };
    }
    const data = (await res.json()) as T;
    return { data, error: null, status: res.status };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Stripe API unreachable",
      status: 0,
    };
  }
}

// ─── Checks ───────────────────────────────────────────────────────────────────

function checkTestMode(secretKey: string): SecurityFinding[] {
  if (secretKey.startsWith("sk_test_")) {
    return [
      {
        code: "STRIPE_TEST_MODE_IN_PRODUCTION",
        title: "Stripe test mode key in production",
        description:
          "The configured Stripe secret key starts with `sk_test_`, indicating this is a test mode key. Using test keys in production means payments will not be processed and all transactions will silently fail.",
        severity: "CRITICAL",
        fixPrompt:
          "Replace the Stripe secret key with a live mode key (`sk_live_...`). Obtain live keys from the Stripe Dashboard under Developers → API keys. Never use test keys in production environments.",
      },
    ];
  }
  return [];
}

async function checkBalance(
  secretKey: string,
): Promise<{ findings: SecurityFinding[]; data: Record<string, unknown>; keyValid: boolean }> {
  const findings: SecurityFinding[] = [];

  const { data, error, status } = await fetchStripe<StripeBalance>(
    "https://api.stripe.com/v1/balance",
    secretKey,
  );

  if (status === 401 || status === 403) {
    findings.push({
      code: "STRIPE_INVALID_KEY",
      title: "Stripe API key invalid or revoked",
      description: "The Stripe API key could not authenticate against the Stripe API. The key may be expired, revoked, or incorrect.",
      severity: "CRITICAL",
      fixPrompt:
        "Verify the Stripe secret key in your configuration. Generate a new key from the Stripe Dashboard under Developers → API keys and update your environment variables.",
    });
    return { findings, data: { balanceStatus: "auth-failed" }, keyValid: false };
  }

  if (error || !data) {
    findings.push({
      code: "STRIPE_API_UNREACHABLE",
      title: "Stripe API unreachable",
      description: `Could not reach the Stripe API: ${error ?? "unknown error"}. This may indicate a network issue or Stripe outage.`,
      severity: "MEDIUM",
      fixPrompt:
        "Check Stripe status at https://status.stripe.com. Verify network egress is allowed from your deployment environment to api.stripe.com.",
    });
    return { findings, data: { balanceError: error }, keyValid: false };
  }

  const available = data.available?.[0];
  return {
    findings: [],
    data: {
      balance: {
        livemode: data.livemode,
        available: available
          ? { amount: available.amount, currency: available.currency }
          : null,
      },
    },
    keyValid: true,
  };
}

async function checkWebhooks(
  secretKey: string,
): Promise<{ findings: SecurityFinding[]; data: Record<string, unknown> }> {
  const findings: SecurityFinding[] = [];

  // Fetch webhook endpoints
  const { data: webhooksData, error } = await fetchStripe<{
    data: StripeWebhookEndpoint[];
    has_more: boolean;
  }>("https://api.stripe.com/v1/webhook_endpoints?limit=20", secretKey);

  if (error || !webhooksData) {
    return { findings: [], data: { webhooksError: error } };
  }

  const endpoints = webhooksData.data ?? [];

  if (endpoints.length === 0) {
    return { findings: [], data: { webhooks: { count: 0 } } };
  }

  // Check: webhook signing secret not configured
  // We check the environment variable - if webhooks are configured in Stripe but no
  // STRIPE_WEBHOOK_SECRET is set in the environment, events won't be verified.
  const webhookSecretConfigured = !!(
    process.env.STRIPE_WEBHOOK_SECRET ?? process.env.STRIPE_SIGNING_SECRET
  );

  if (!webhookSecretConfigured) {
    findings.push({
      code: "STRIPE_NO_WEBHOOK_SECRET",
      title: "Stripe webhook endpoints configured but no signing secret set",
      description: `${endpoints.length} Stripe webhook endpoint${endpoints.length === 1 ? "" : "s"} are configured, but STRIPE_WEBHOOK_SECRET is not set in the environment. Without the signing secret, webhook events cannot be verified, leaving your app vulnerable to forged webhook payloads.`,
      severity: "HIGH",
      fixPrompt:
        "Add the webhook signing secret to your environment variables as STRIPE_WEBHOOK_SECRET. Find the signing secret in Stripe Dashboard → Developers → Webhooks → select your endpoint → Signing secret.",
    });
  }

  // Check webhook failure rates using events
  // Fetch recent failed/warning events as a proxy for webhook health
  const sevenDaysAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);

  for (const endpoint of endpoints.slice(0, 5)) {
    if (endpoint.status === "disabled") {
      findings.push({
        code: "STRIPE_WEBHOOK_DISABLED",
        title: `Stripe webhook endpoint disabled: ${endpoint.url}`,
        description: `The Stripe webhook endpoint "${endpoint.url}" is disabled. Events will not be delivered to this endpoint.`,
        severity: "HIGH",
        fixPrompt: `Re-enable the webhook endpoint in Stripe Dashboard → Developers → Webhooks, or remove it if no longer needed.`,
      });
      continue;
    }

    // Fetch events for this endpoint to calculate failure rate
    // Use delivery events - limited to what's accessible via the Stripe events API
    const { data: eventsData } = await fetchStripe<{ data: StripeEvent[] }>(
      `https://api.stripe.com/v1/events?limit=100&created[gte]=${sevenDaysAgo}&delivery_success=false`,
      secretKey,
    );

    if (eventsData) {
      const failedCount = (eventsData.data ?? []).length;

      // Also fetch total events count to calculate rate
      const { data: totalEventsData } = await fetchStripe<{ data: StripeEvent[] }>(
        `https://api.stripe.com/v1/events?limit=100&created[gte]=${sevenDaysAgo}`,
        secretKey,
      );

      const totalCount = (totalEventsData?.data ?? []).length;

      if (totalCount > 10 && failedCount / totalCount > 0.05) {
        const failureRate = Math.round((failedCount / totalCount) * 100);
        findings.push({
          code: "STRIPE_WEBHOOK_HIGH_FAILURE_RATE",
          title: `Stripe webhook failure rate: ${failureRate}%`,
          description: `${failedCount} out of ${totalCount} Stripe events in the last 7 days failed to deliver. A high failure rate indicates your webhook handler may be returning errors or timing out.`,
          severity: "HIGH",
          fixPrompt:
            "Investigate webhook delivery failures in Stripe Dashboard → Developers → Webhooks. Check your webhook handler endpoint for errors, timeouts, or incorrect status code responses. Ensure your handler returns 2xx within 5 seconds.",
        });
      }
    }
  }

  return {
    findings,
    data: {
      webhooks: {
        count: endpoints.length,
        endpoints: endpoints.slice(0, 5).map((e) => ({
          url: e.url,
          status: e.status,
        })),
        signingSecretConfigured: webhookSecretConfigured,
      },
    },
  };
}

// ─── Main connector export ────────────────────────────────────────────────────

/**
 * Run all Stripe infrastructure checks.
 * @param credentials - { secretKey: string }
 */
export async function run(
  credentials: Record<string, string>,
): Promise<ConnectorResult> {
  const { secretKey } = credentials;
  const checkedAt = new Date().toISOString();

  if (!secretKey) {
    return {
      ok: false,
      findings: [
        {
          code: "STRIPE_MISSING_CREDENTIALS",
          title: "Stripe secret key not configured",
          description: "A Stripe secret key is required to run Stripe infrastructure checks.",
          severity: "MEDIUM",
          fixPrompt:
            "Add a Stripe secret key in the connector settings. Obtain one from the Stripe Dashboard under Developers → API keys.",
        },
      ],
      data: {},
      checkedAt,
    };
  }

  // Check 1: test mode (synchronous — no API call needed)
  const testModeFindings = checkTestMode(secretKey);

  // Check 2: validate key works + livemode balance
  const { findings: balanceFindings, data: balanceData, keyValid } = await checkBalance(secretKey);

  const allFindings = [...testModeFindings, ...balanceFindings];
  const allData: Record<string, unknown> = { ...balanceData };

  // Only run webhook checks if the key is valid (no point if we can't auth)
  if (keyValid) {
    const { findings: webhookFindings, data: webhookData } = await checkWebhooks(secretKey);
    allFindings.push(...webhookFindings);
    Object.assign(allData, webhookData);
  }

  const hasCritical = allFindings.some((f) => f.severity === "CRITICAL");
  const hasHigh = allFindings.some((f) => f.severity === "HIGH");

  return {
    ok: !hasCritical && !hasHigh,
    findings: allFindings,
    data: allData,
    checkedAt,
  };
}
