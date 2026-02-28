import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { obfuscate, deobfuscate } from "@/lib/crypto-util";

const jiraConfigSchema = z.object({
  url: z.string().url(),
  email: z.string().email(),
  apiToken: z.string().min(1),
  projectKey: z.string().min(1),
  issueType: z.string().min(1),
});

export async function GET() {
  try {
    const session = await requireRole(["ADMIN", "OWNER"]);
    const integration = await db.integrationConfig.findUnique({
      where: { orgId_type: { orgId: session.orgId, type: "jira" } },
    });
    if (!integration) return NextResponse.json(null);
    const cfg = integration.config as Record<string, string>;
    return NextResponse.json({ url: cfg.url, email: cfg.email, apiToken: "••••••••", projectKey: cfg.projectKey, issueType: cfg.issueType, enabled: integration.enabled });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json({ error: msg }, { status: msg === "Forbidden" ? 403 : 401 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireRole(["ADMIN", "OWNER"]);
    const body = await req.json();
    const parsed = jiraConfigSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const { url, email, apiToken, projectKey, issueType } = parsed.data;
    const config = { url, email, apiToken: obfuscate(apiToken), projectKey, issueType };
    const integration = await db.integrationConfig.upsert({
      where: { orgId_type: { orgId: session.orgId, type: "jira" } },
      create: { orgId: session.orgId, type: "jira", config, enabled: true },
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
    await db.integrationConfig.deleteMany({ where: { orgId: session.orgId, type: "jira" } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json({ error: msg }, { status: msg === "Forbidden" ? 403 : 401 });
  }
}

export async function getJiraConfig(orgId: string) {
  const integration = await db.integrationConfig.findUnique({
    where: { orgId_type: { orgId, type: "jira" } },
  });
  if (!integration || !integration.enabled) return null;
  const cfg = integration.config as Record<string, string>;
  return { url: cfg.url, email: cfg.email, apiToken: deobfuscate(cfg.apiToken), projectKey: cfg.projectKey, issueType: cfg.issueType };
}
