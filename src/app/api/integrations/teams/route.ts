import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getOrgLimits } from "@/lib/tenant";
import { obfuscate } from "@/lib/crypto-util";

const TEAMS_TIERS = ["PRO", "ENTERPRISE", "ENTERPRISE_PLUS"];

const TEAMS_URL_PATTERN = /https:\/\/.+(webhook|office|teams|logic)/i;

const teamsConfigSchema = z.object({
  webhookUrl: z
    .string()
    .url()
    .refine(
      (url) => url.startsWith("https://") && TEAMS_URL_PATTERN.test(url),
      "Webhook URL must be a valid Microsoft Teams, Office 365, or Logic App webhook URL.",
    ),
});

function maskWebhookUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}/••••••`;
  } catch {
    return "••••••••";
  }
}

export async function GET() {
  try {
    const session = await requireRole(["ADMIN", "OWNER"]);
    const limits = await getOrgLimits(session.orgId);
    if (!TEAMS_TIERS.includes(limits.tier)) {
      return NextResponse.json(
        { error: "Microsoft Teams alerts are available on Pro and Enterprise plans." },
        { status: 403 },
      );
    }
    const integration = await db.integrationConfig.findUnique({
      where: { orgId_type: { orgId: session.orgId, type: "teams" } },
    });
    if (!integration) return NextResponse.json(null);
    const cfg = integration.config as Record<string, string>;
    return NextResponse.json({
      webhookUrl: maskWebhookUrl(cfg.webhookUrl ?? ""),
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
    if (!TEAMS_TIERS.includes(limits.tier)) {
      return NextResponse.json(
        { error: "Microsoft Teams alerts are available on Pro and Enterprise plans." },
        { status: 403 },
      );
    }
    const body = await req.json();
    const parsed = teamsConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { webhookUrl } = parsed.data;
    const config = { webhookUrl: obfuscate(webhookUrl) };
    const integration = await db.integrationConfig.upsert({
      where: { orgId_type: { orgId: session.orgId, type: "teams" } },
      create: { orgId: session.orgId, type: "teams", config, enabled: true },
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
    if (!TEAMS_TIERS.includes(limits.tier)) {
      return NextResponse.json(
        { error: "Microsoft Teams alerts are available on Pro and Enterprise plans." },
        { status: 403 },
      );
    }
    await db.integrationConfig.deleteMany({
      where: { orgId: session.orgId, type: "teams" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json({ error: msg }, { status: msg === "Forbidden" ? 403 : 401 });
  }
}

/** Internal: get Teams config (decrypted) for a given org */
export async function getTeamsConfig(orgId: string) {
  const { deobfuscate } = await import("@/lib/crypto-util");
  const integration = await db.integrationConfig.findUnique({
    where: { orgId_type: { orgId, type: "teams" } },
  });
  if (!integration || !integration.enabled) return null;
  const cfg = integration.config as Record<string, string>;
  return { webhookUrl: deobfuscate(cfg.webhookUrl) };
}
