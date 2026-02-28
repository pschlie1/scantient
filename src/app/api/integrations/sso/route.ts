import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { obfuscate } from "@/lib/crypto-util";

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
    return NextResponse.json({ id: config.id, ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json({ error: msg }, { status: msg === "Forbidden" ? 403 : 401 });
  }
}

export async function DELETE() {
  try {
    const session = await requireRole(["OWNER"]);
    await db.sSOConfig.deleteMany({ where: { orgId: session.orgId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json({ error: msg }, { status: msg === "Forbidden" ? 403 : 401 });
  }
}
