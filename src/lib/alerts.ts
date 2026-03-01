import { createHmac } from "crypto";
import { db } from "@/lib/db";
import { getOrgLimits } from "@/lib/tenant";
import type { SecurityFinding } from "@/lib/types";
import { sendTeamsNotification } from "@/lib/teams-notify";
import { createPagerDutyIncident } from "@/lib/pagerduty-notify";
import { signWebhookPayload } from "@/lib/webhook-signature";

const TIER_CHANNELS: Record<string, string[]> = {
  FREE: [],
  STARTER: ["EMAIL"],
  PRO: ["EMAIL", "SLACK"],
  ENTERPRISE: ["EMAIL", "SLACK", "WEBHOOK"],
  ENTERPRISE_PLUS: ["EMAIL", "SLACK", "WEBHOOK"],
  EXPIRED: [],
};

/**
 * Retry a function with exponential backoff.
 * Throws the last error if all attempts fail.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 500,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

async function sendEmail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM_EMAIL ?? "alerts@scantient.com";

  if (!key) {
    console.warn("[alerts] RESEND_API_KEY not set. Skipping email.");
    return;
  }

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
}

async function sendSlack(webhookUrl: string, text: string) {
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

async function sendTeams(webhookUrl: string, title: string, text: string, facts: { name: string; value: string }[] = []) {
  const card = {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            { type: "TextBlock", size: "Medium", weight: "Bolder", text: title },
            { type: "TextBlock", text, wrap: true },
            ...(facts.length
              ? [
                  {
                    type: "FactSet",
                    facts: facts.map((f) => ({ title: f.name, value: f.value })),
                  },
                ]
              : []),
          ],
        },
      },
    ],
  };

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(card),
  });
}

function isTeamsWebhookUrl(url: string): boolean {
  return url.includes(".webhook.office.com/") || url.includes(".logic.azure.com/");
}

/**
 * Derive a per-endpoint HMAC signing key.
 *
 * Previously the webhook URL itself was used as the raw HMAC key.  This meant
 * anyone who knew the URL (e.g., from server logs or interception) could forge
 * a valid signature.  The fix derives the signing key with
 * HMAC-SHA256(url, WEBHOOK_SIGNING_SECRET) so the signature is bound to a
 * server-side secret that the webhook destination cannot independently produce.
 *
 * Backwards-compat: if WEBHOOK_SIGNING_SECRET is not configured the function
 * falls back to the old URL-only key and emits a warning.  Set
 * WEBHOOK_SIGNING_SECRET to a long random string in production.
 */
function deriveWebhookSigningKey(url: string): string {
  const masterSecret = process.env.WEBHOOK_SIGNING_SECRET;
  if (!masterSecret) {
    console.warn(
      "[alerts] WEBHOOK_SIGNING_SECRET not set — webhook signatures use URL as key (insecure). " +
        "Set WEBHOOK_SIGNING_SECRET to a long random secret in your environment.",
    );
    return url; // legacy fallback
  }
  return createHmac("sha256", masterSecret).update(url, "utf8").digest("hex");
}

async function sendWebhook(url: string, payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  const signingKey = deriveWebhookSigningKey(url);
  const signature = signWebhookPayload(body, signingKey);
  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Scantient-Signature": signature,
      "X-Scantient-Timestamp": new Date().toISOString(),
    },
    body,
  });
}

const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;

export async function sendCriticalFindingsAlert(appId: string, findings: SecurityFinding[]) {
  if (!findings.length) return;

  const app = await db.monitoredApp.findUnique({
    where: { id: appId },
    include: { org: true },
  });
  if (!app) return;

  // Get org alert configs
  const configs = await db.alertConfig.findMany({
    where: { orgId: app.orgId, enabled: true },
  });

  if (configs.length === 0) {
    // Fallback: send to app owner directly
    const high = findings.filter((f) => ["HIGH", "CRITICAL"].includes(f.severity));
    if (high.length > 0) {
      const html = buildAlertHtml(app.name, app.url, high);
      await withRetry(() => sendEmail(app.ownerEmail, `⚠️ Scantient Alert: ${app.name}`, html));
    }
    return;
  }

  // Enforce tier-based channel restrictions before dispatching
  const limits = await getOrgLimits(app.orgId);
  const allowedChannels = TIER_CHANNELS[limits.tier] ?? [];

  for (const config of configs) {
    if (!allowedChannels.includes(config.channel)) {
      console.warn(
        `[alerts] Skipping ${config.channel} alert config ${config.id} — channel not allowed for org ${app.orgId} on tier ${limits.tier}. Config is stale.`,
      );
      continue;
    }
    const minOrder = SEVERITY_ORDER[config.minSeverity as keyof typeof SEVERITY_ORDER] ?? 1;
    const relevant = findings.filter(
      (f) => (SEVERITY_ORDER[f.severity as keyof typeof SEVERITY_ORDER] ?? 3) <= minOrder,
    );

    if (relevant.length === 0) continue;

    try {
      switch (config.channel) {
        case "EMAIL": {
          const html = buildAlertHtml(app.name, app.url, relevant);
          await withRetry(() => sendEmail(config.destination, `⚠️ Scantient Alert: ${app.name}`, html));
          break;
        }
        case "SLACK": {
          const text = buildSlackMessage(app.name, app.url, relevant);
          await withRetry(() => sendSlack(config.destination, text));
          break;
        }
        case "WEBHOOK": {
          if (isTeamsWebhookUrl(config.destination)) {
            const facts = relevant.slice(0, 5).map((f) => ({ name: f.severity, value: f.title }));
            await withRetry(() => sendTeams(
              config.destination,
              `⚠️ Scantient Alert: ${app.name}`,
              `${relevant.length} security issue(s) detected on ${app.url}`,
              facts,
            ));
          } else {
            const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://scantient.com"}/dashboard`;
            const topFinding = relevant[0];
            await withRetry(() => sendWebhook(config.destination, {
              event: topFinding?.severity === "CRITICAL" ? "finding.critical" : "finding.new",
              org: { id: app.orgId, name: app.org.name },
              app: { id: app.id, name: app.name, url: app.url },
              findings: relevant.map((f) => ({
                code: f.code,
                title: f.title,
                severity: f.severity,
                description: f.description,
                fixPrompt: f.fixPrompt,
              })),
              findingsCount: relevant.length,
              dashboardUrl,
              timestamp: new Date().toISOString(),
            }), 3, 1000);
          }
          break;
        }
      }

      // Log notification
      await db.notification.create({
        data: {
          alertConfigId: config.id,
          subject: `Alert: ${app.name}`,
          body: `${relevant.length} finding(s) detected`,
          delivered: true,
        },
      });
    } catch (error) {
      await db.notification.create({
        data: {
          alertConfigId: config.id,
          subject: `Alert: ${app.name}`,
          body: `${relevant.length} finding(s) detected`,
          delivered: false,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });
    }
  }

  // Fire Teams integration (from IntegrationConfig, if configured)
  await fireTeamsIntegration(app.orgId, app.name, app.url, findings);

  // Fire PagerDuty for CRITICAL findings (ENTERPRISE+ only, from IntegrationConfig)
  const criticals = findings.filter((f) => f.severity === "CRITICAL");
  if (criticals.length > 0) {
    await firePagerDutyIntegration(app.orgId, app.name, app.url, criticals, app.org.name);
  }
}

async function firePagerDutyIntegration(
  orgId: string,
  appName: string,
  appUrl: string,
  criticals: SecurityFinding[],
  orgName: string,
) {
  try {
    const { deobfuscate } = await import("@/lib/crypto-util");
    const pdIntegration = await db.integrationConfig.findUnique({
      where: { orgId_type: { orgId, type: "pagerduty" } },
    });
    if (!pdIntegration || !pdIntegration.enabled) return;

    const cfg = pdIntegration.config as Record<string, string>;
    const routingKey = deobfuscate(cfg.routingKey);

    const summary = `[Scantient] ${criticals.length} CRITICAL finding(s) on ${appName}: ${criticals[0]?.title ?? "Security issue detected"}`;
    await createPagerDutyIncident(routingKey, {
      summary,
      severity: "critical",
      source: appUrl,
      component: appName,
      group: orgName,
      customDetails: {
        findings_count: String(criticals.length),
        top_finding: criticals[0]?.title ?? "",
        app_url: appUrl,
        dashboard_url: "https://scantient.com/dashboard",
      },
    });
  } catch (err) {
    // Non-fatal: PagerDuty integration errors should not block alert delivery
    console.warn("[alerts] PagerDuty integration error (non-fatal):", err instanceof Error ? err.message : err);
  }
}

async function fireTeamsIntegration(
  orgId: string,
  appName: string,
  appUrl: string,
  findings: SecurityFinding[],
) {
  try {
    const { deobfuscate } = await import("@/lib/crypto-util");
    const teamsIntegration = await db.integrationConfig.findUnique({
      where: { orgId_type: { orgId, type: "teams" } },
    });
    if (!teamsIntegration || !teamsIntegration.enabled) return;

    const cfg = teamsIntegration.config as Record<string, string>;
    const webhookUrl = deobfuscate(cfg.webhookUrl);

    const criticals = findings.filter((f) => f.severity === "CRITICAL");
    const highs = findings.filter((f) => f.severity === "HIGH");
    const topSeverity = criticals.length > 0 ? "critical" : highs.length > 0 ? "high" : "medium";

    const lines = findings.slice(0, 5).map((f) => `• [${f.severity}] ${f.title}`).join("\n");
    await sendTeamsNotification(webhookUrl, {
      title: `⚠️ Scantient Alert: ${appName}`,
      text: `${findings.length} security issue(s) detected on ${appUrl}\n\n${lines}`,
      severity: topSeverity,
      appName,
      appUrl,
      dashboardUrl: "https://scantient.com/dashboard",
    });
  } catch (err) {
    // Non-fatal: Teams integration errors should not block alert delivery
    console.warn("[alerts] Teams integration error (non-fatal):", err instanceof Error ? err.message : err);
  }
}

export async function sendTestNotification(configId: string) {
  const config = await db.alertConfig.findUnique({ where: { id: configId } });
  if (!config) throw new Error("Alert config not found");

  // Check that the org still has a tier that supports this channel
  const testLimits = await getOrgLimits(config.orgId);
  const testAllowedChannels = TIER_CHANNELS[testLimits.tier] ?? [];
  if (!testAllowedChannels.includes(config.channel)) {
    throw new Error(
      `${config.channel} alerts are not available on your current ${testLimits.tier} plan.`,
    );
  }

  const subject = "✅ Scantient Test Notification";
  const body = "This is a test notification from Scantient. Your alert channel is working correctly!";

  try {
    switch (config.channel) {
      case "EMAIL":
        await withRetry(() => sendEmail(config.destination, subject, `<div style="font-family: -apple-system, sans-serif;"><h2>${subject}</h2><p>${body}</p></div>`));
        break;
      case "SLACK":
        await withRetry(() => sendSlack(config.destination, `${subject}\n${body}`));
        break;
      case "WEBHOOK":
        if (isTeamsWebhookUrl(config.destination)) {
          await withRetry(() => sendTeams(config.destination, subject, body));
        } else {
          await withRetry(() => sendWebhook(config.destination, { event: "test", message: body, timestamp: new Date().toISOString() }));
        }
        break;
    }

    await db.notification.create({
      data: { alertConfigId: config.id, subject, body: "Test notification", delivered: true },
    });
  } catch (error) {
    await db.notification.create({
      data: {
        alertConfigId: config.id,
        subject,
        body: "Test notification",
        delivered: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
    throw error;
  }
}

export async function sendChangeDetectedAlert(appId: string, appName: string, appUrl: string) {
  const app = await db.monitoredApp.findUnique({
    where: { id: appId },
    include: { org: true },
  });
  if (!app) return;

  const configs = await db.alertConfig.findMany({
    where: { orgId: app.orgId, enabled: true },
  });

  const subject = `🔄 Scantient: ${appName} has changed`;
  const message = `Deployment change detected on ${appName} (${appUrl}). The application content has changed since the last scan.`;

  // Enforce tier-based channel restrictions before dispatching
  const changeLimits = await getOrgLimits(app.orgId);
  const changeAllowedChannels = TIER_CHANNELS[changeLimits.tier] ?? [];

  for (const config of configs) {
    if (!changeAllowedChannels.includes(config.channel)) {
      console.warn(
        `[alerts] Skipping ${config.channel} change-detected alert config ${config.id} — channel not allowed for org ${app.orgId} on tier ${changeLimits.tier}. Config is stale.`,
      );
      continue;
    }
    try {
      switch (config.channel) {
        case "EMAIL":
          await sendEmail(config.destination, subject, `<div style="font-family: -apple-system, sans-serif;"><h2>${subject}</h2><p>${message}</p><p><a href="${appUrl}">${appUrl}</a></p></div>`);
          break;
        case "SLACK":
          await sendSlack(config.destination, `${subject}\n${message}`);
          break;
        case "WEBHOOK":
          if (isTeamsWebhookUrl(config.destination)) {
            await sendTeams(config.destination, subject, message, [{ name: "App", value: appName }, { name: "URL", value: appUrl }]);
          } else {
            await sendWebhook(config.destination, { event: "change.detected", app: { id: appId, name: appName, url: appUrl }, timestamp: new Date().toISOString() });
          }
          break;
      }
      await db.notification.create({ data: { alertConfigId: config.id, subject, body: "Change detected", delivered: true } });
    } catch (error) {
      await db.notification.create({ data: { alertConfigId: config.id, subject, body: "Change detected", delivered: false, error: error instanceof Error ? error.message : "Unknown" } });
    }
  }
}

function buildAlertHtml(appName: string, appUrl: string, findings: SecurityFinding[]): string {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 600px;">
      <h2 style="margin-bottom: 4px;">⚠️ Scantient Alert: ${appName}</h2>
      <p style="color: #666; margin-top: 0;">
        <a href="${appUrl}">${appUrl}</a>
      </p>
      <p>We detected <strong>${findings.length}</strong> security issue(s):</p>
      ${findings
        .map(
          (f) => `
        <div style="border-left: 3px solid ${f.severity === "CRITICAL" ? "#dc2626" : "#f59e0b"}; padding: 8px 12px; margin: 12px 0; background: #f9fafb;">
          <strong>[${f.severity}] ${f.title}</strong>
          <p style="margin: 4px 0; font-size: 14px; color: #555;">${f.description}</p>
        </div>
      `,
        )
        .join("")}
      <p style="font-size: 13px; color: #888;">
        View details and fix prompts in your <a href="#">Scantient dashboard</a>.
      </p>
    </div>
  `;
}

function buildSlackMessage(appName: string, appUrl: string, findings: SecurityFinding[]): string {
  const lines = findings.map((f) => `• *[${f.severity}]* ${f.title}`);
  return `⚠️ *Scantient Alert: ${appName}*\n<${appUrl}>\n\n${findings.length} issue(s) detected:\n${lines.join("\n")}`;
}
