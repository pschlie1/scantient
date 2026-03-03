import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getOrgLimits } from "@/lib/tenant";
import { obfuscate, deobfuscate } from "@/lib/crypto-util";
import { checkRateLimit } from "@/lib/rate-limit";
import { hasFeature } from "@/lib/tier-capabilities";


const pagerdutyConfigSchema = z.object({
  routingKey: z.string().min(20, "Routing key must be at least 20 characters."),
  serviceId: z.string().optional(),
});

function maskRoutingKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}${"•".repeat(key.length - 8)}${key.slice(-4)}`;
}

export async function GET() {
  try {
    const session = await requireRole(["ADMIN", "OWNER"]);
    const limits = await getOrgLimits(session.orgId);
    if (!hasFeature(limits.tier, "pagerdutyIntegration")) {
      return NextResponse.json(
        { error: "PagerDuty integration is available on Enterprise plans." },
        { status: 403 },
      );
    }
    const integration = await db.integrationConfig.findUnique({
      where: { orgId_type: { orgId: session.orgId, type: "pagerduty" } },
    });
    if (!integration) return NextResponse.json(null);
    const cfg = integration.config as Record<string, string>;
    const rawKey = deobfuscate(cfg.routingKey);
    return NextResponse.json({
      routingKey: maskRoutingKey(rawKey),
      serviceId: cfg.serviceId ?? null,
      enabled: integration.enabled,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json({ error: msg }, { status: msg === "Forbidden" ? 403 : 401 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireRole(["ADMIN", "OWNER"]);
    const limits = await getOrgLimits(session.orgId);
    if (!hasFeature(limits.tier, "pagerdutyIntegration")) {
      return NextResponse.json(
        { error: "PagerDuty integration is available on Enterprise plans." },
        { status: 403 },
      );
    }
    const rl = await checkRateLimit(`integration-pagerduty:${session.orgId}`, {
      maxAttempts: 20,
      windowMs: 60 * 60 * 1000,
    });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds ?? 60) },
      });
    }
    const body = await req.json();
    const parsed = pagerdutyConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { routingKey, serviceId } = parsed.data;
    const config: Record<string, string> = {
      routingKey: obfuscate(routingKey),
    };
    if (serviceId) config.serviceId = serviceId;
    const integration = await db.integrationConfig.upsert({
      where: { orgId_type: { orgId: session.orgId, type: "pagerduty" } },
      create: { orgId: session.orgId, type: "pagerduty", config, enabled: true },
      update: { config, enabled: true },
    });
    return NextResponse.json({ id: integration.id, ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json({ error: msg }, { status: msg === "Forbidden" ? 403 : 401 });
  }
}

export async function DELETE() {
  try {
    const session = await requireRole(["ADMIN", "OWNER"]);
    const limits = await getOrgLimits(session.orgId);
    if (!hasFeature(limits.tier, "pagerdutyIntegration")) {
      return NextResponse.json(
        { error: "PagerDuty integration is available on Enterprise plans." },
        { status: 403 },
      );
    }
    const rl = await checkRateLimit(`integration-pagerduty:${session.orgId}`, {
      maxAttempts: 20,
      windowMs: 60 * 60 * 1000,
    });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds ?? 60) },
      });
    }
    await db.integrationConfig.deleteMany({
      where: { orgId: session.orgId, type: "pagerduty" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json({ error: msg }, { status: msg === "Forbidden" ? 403 : 401 });
  }
}

/** Internal: get PagerDuty config (decrypted) for a given org */
export async function getPagerDutyConfig(orgId: string) {
  const integration = await db.integrationConfig.findUnique({
    where: { orgId_type: { orgId, type: "pagerduty" } },
  });
  if (!integration || !integration.enabled) return null;
  const cfg = integration.config as Record<string, string>;
  return { routingKey: deobfuscate(cfg.routingKey), serviceId: cfg.serviceId };
}
