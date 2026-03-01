import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { deobfuscate } from "@/lib/crypto-util";
import { getOrgLimits } from "@/lib/tenant";
import { isPrivateUrl } from "@/lib/ssrf-guard";

const bodySchema = z.object({ findingId: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const session = await requireRole(["ADMIN", "OWNER", "MEMBER"]);
    const limits = await getOrgLimits(session.orgId);
    if (!["PRO", "ENTERPRISE", "ENTERPRISE_PLUS"].includes(limits.tier)) {
      return NextResponse.json({ error: "Jira integration requires a Pro plan or higher." }, { status: 403 });
    }
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "findingId is required" }, { status: 400 });
    const { findingId } = parsed.data;
    const finding = await db.finding.findFirst({
      where: { id: findingId },
      include: { run: { include: { app: { select: { orgId: true, name: true, url: true } } } } },
    });
    if (!finding || finding.run.app.orgId !== session.orgId) {
      return NextResponse.json({ error: "Finding not found" }, { status: 404 });
    }
    const integration = await db.integrationConfig.findUnique({
      where: { orgId_type: { orgId: session.orgId, type: "jira" } },
    });
    if (!integration || !integration.enabled) {
      return NextResponse.json({ error: "Jira not configured" }, { status: 404 });
    }
    const cfg = integration.config as Record<string, string>;
    if (await isPrivateUrl(cfg.url)) {
      return NextResponse.json({ error: "Jira URL must be a public address" }, { status: 400 });
    }
    const apiToken = deobfuscate(cfg.apiToken);
    const credentials = Buffer.from(`${cfg.email}:${apiToken}`).toString("base64");
    const app = finding.run.app;
    const severity = finding.severity;
    const priority = severity === "CRITICAL" ? "Highest" : severity === "HIGH" ? "High" : "Medium";
    const issueBody = {
      fields: {
        project: { key: cfg.projectKey },
        summary: `[Scantient] ${severity}: ${finding.title} on ${app.name}`,
        description: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: `${finding.description}\n\nFix: ${finding.fixPrompt}\n\nApp URL: ${app.url}` }] }] },
        issuetype: { name: cfg.issueType },
        priority: { name: priority },
      },
    };
    const baseUrl = cfg.url.replace(/\/$/, "");
    const jiraRes = await fetch(`${baseUrl}/rest/api/3/issue`, {
      method: "POST",
      headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(issueBody),
      signal: AbortSignal.timeout(15000),
    });
    if (!jiraRes.ok) {
      const text = await jiraRes.text().catch(() => jiraRes.statusText);
      return NextResponse.json({ error: `Jira API error: ${jiraRes.status} - ${text}` }, { status: 502 });
    }
    const jiraData = await jiraRes.json() as { key?: string };
    const ticketKey = jiraData.key ?? "";
    const ticketUrl = `${baseUrl}/browse/${ticketKey}`;
    const existingNotes = finding.notes ?? "";
    const newNotes = existingNotes ? `${existingNotes}\nJira: ${ticketUrl}` : `Jira: ${ticketUrl}`;
    await db.finding.update({ where: { id: findingId }, data: { notes: newNotes } });
    return NextResponse.json({ ticketUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Request failed";
    if (msg === "Forbidden") return NextResponse.json({ error: msg }, { status: 403 });
    if (msg === "Unauthorized") return NextResponse.json({ error: msg }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
