import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getOrgLimits, logAudit } from "@/lib/tenant";
import { obfuscate } from "@/lib/crypto-util";
import { checkRateLimit } from "@/lib/rate-limit";
import { hasFeature } from "@/lib/tier-capabilities";

const ssoSchema = z.object({
  provider: z.enum(["oidc", "saml"]),
  clientId: z.string().min(1),
  clientSecret: z.string().optional(),
  tenantId: z.string().optional(),
  domain: z.string().min(1),
  discoveryUrl: z.string().url().optional(),
  enabled: z.boolean().optional().default(true),
});

export async function GET() {
  try {
    const session = await requireRole(["OWNER"]);
    const limits = await getOrgLimits(session.orgId);
    if (!hasFeature(limits.tier, "sso")) {
      return NextResponse.json(
        { error: "SSO is available on Enterprise plans only. Upgrade to configure single sign-on." },
        { status: 403 },
      );
    }
    const ssoConfig = await db.sSOConfig.findUnique({ where: { orgId: session.orgId } });
    if (!ssoConfig) return NextResponse.json(null);
    return NextResponse.json({ id: ssoConfig.id, provider: ssoConfig.provider, clientId: ssoConfig.clientId, clientSecret: ssoConfig.clientSecret ? "••••••••" : null, tenantId: ssoConfig.tenantId, domain: ssoConfig.domain, discoveryUrl: ssoConfig.discoveryUrl, enabled: ssoConfig.enabled });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json({ error: msg }, { status: msg === "Forbidden" ? 403 : 401 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireRole(["OWNER"]);
    const limits = await getOrgLimits(session.orgId);
    if (!hasFeature(limits.tier, "sso")) {
      return NextResponse.json(
        { error: "SSO is available on Enterprise plans only. Upgrade to configure single sign-on." },
        { status: 403 },
      );
    }
    const rl = await checkRateLimit(`integration-sso:${session.orgId}`, {
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
    const parsed = ssoSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const { provider, clientId, clientSecret, tenantId, domain, discoveryUrl, enabled } = parsed.data;
    const existing = await db.sSOConfig.findUnique({ where: { orgId: session.orgId } });
    const encryptedSecret = clientSecret ? obfuscate(clientSecret) : existing?.clientSecret ?? null;
    const config = await db.sSOConfig.upsert({
      where: { orgId: session.orgId },
      create: { orgId: session.orgId, provider, clientId, clientSecret: encryptedSecret, tenantId: tenantId ?? null, domain: domain.toLowerCase(), discoveryUrl: discoveryUrl ?? null, enabled: enabled ?? true },
      update: { provider, clientId, clientSecret: encryptedSecret, tenantId: tenantId ?? null, domain: domain.toLowerCase(), discoveryUrl: discoveryUrl ?? null, enabled: enabled ?? true },
    });
    // Audit log: SSO config change (fire-and-forget)
    const action = existing ? "sso_config.updated" : "sso_config.created";
    logAudit(session, action, "sso", `provider:${provider},domain:${domain.toLowerCase()}`).catch(() => { /* non-fatal */ });
    return NextResponse.json({ id: config.id, ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json({ error: msg }, { status: msg === "Forbidden" ? 403 : 401 });
  }
}

export async function DELETE() {
  try {
    const session = await requireRole(["OWNER"]);
    const limits = await getOrgLimits(session.orgId);
    if (!hasFeature(limits.tier, "sso")) {
      return NextResponse.json(
        { error: "SSO is available on Enterprise plans only. Upgrade to configure single sign-on." },
        { status: 403 },
      );
    }
    const rl = await checkRateLimit(`integration-sso:${session.orgId}`, {
      maxAttempts: 20,
      windowMs: 60 * 60 * 1000,
    });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds ?? 60) },
      });
    }
    await db.sSOConfig.deleteMany({ where: { orgId: session.orgId } });
    // Audit log: SSO config removed (fire-and-forget)
    logAudit(session, "sso_config.deleted", "sso").catch(() => { /* non-fatal */ });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json({ error: msg }, { status: msg === "Forbidden" ? 403 : 401 });
  }
}
