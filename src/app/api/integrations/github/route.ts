import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getOrgLimits } from "@/lib/tenant";
import { obfuscate, deobfuscate } from "@/lib/crypto-util";
import { checkRateLimit } from "@/lib/rate-limit";
import { hasFeature } from "@/lib/tier-capabilities";


const githubConfigSchema = z.object({
  owner: z.string().min(1, "GitHub owner/org name is required."),
  repo: z.string().min(1, "Repository name is required."),
  token: z.string().min(1, "GitHub personal access token is required."),
});

function maskToken(token: string): string {
  if (token.length <= 8) return "••••••••";
  return `${token.slice(0, 4)}${"•".repeat(Math.min(token.length - 8, 20))}${token.slice(-4)}`;
}

export async function GET() {
  try {
    const session = await requireRole(["ADMIN", "OWNER"]);
    const limits = await getOrgLimits(session.orgId);
    if (!hasFeature(limits.tier, "githubIntegration")) {
      return NextResponse.json(
        { error: "GitHub Issues integration is available on Pro and Enterprise plans." },
        { status: 403 },
      );
    }
    const integration = await db.integrationConfig.findUnique({
      where: { orgId_type: { orgId: session.orgId, type: "github" } },
    });
    if (!integration) return NextResponse.json(null);
    const cfg = integration.config as Record<string, string>;
    const rawToken = deobfuscate(cfg.token);
    return NextResponse.json({
      owner: cfg.owner,
      repo: cfg.repo,
      token: maskToken(rawToken),
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
    if (!hasFeature(limits.tier, "githubIntegration")) {
      return NextResponse.json(
        { error: "GitHub Issues integration is available on Pro and Enterprise plans." },
        { status: 403 },
      );
    }
    const rl = await checkRateLimit(`integration-github:${session.orgId}`, {
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
    const parsed = githubConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { owner, repo, token } = parsed.data;
    const config = { owner, repo, token: obfuscate(token) };
    const integration = await db.integrationConfig.upsert({
      where: { orgId_type: { orgId: session.orgId, type: "github" } },
      create: { orgId: session.orgId, type: "github", config, enabled: true },
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
    if (!hasFeature(limits.tier, "githubIntegration")) {
      return NextResponse.json(
        { error: "GitHub Issues integration is available on Pro and Enterprise plans." },
        { status: 403 },
      );
    }
    const rl = await checkRateLimit(`integration-github:${session.orgId}`, {
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
      where: { orgId: session.orgId, type: "github" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json({ error: msg }, { status: msg === "Forbidden" ? 403 : 401 });
  }
}

/** Internal: get GitHub config (decrypted) for a given org */
export async function getGitHubConfig(orgId: string) {
  const integration = await db.integrationConfig.findUnique({
    where: { orgId_type: { orgId, type: "github" } },
  });
  if (!integration || !integration.enabled) return null;
  const cfg = integration.config as Record<string, string>;
  return { owner: cfg.owner, repo: cfg.repo, token: deobfuscate(cfg.token) };
}
