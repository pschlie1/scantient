import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { deobfuscate } from "@/lib/crypto-util";

export async function POST() {
  try {
    const session = await requireRole(["ADMIN", "OWNER"]);
    const integration = await db.integrationConfig.findUnique({
      where: { orgId_type: { orgId: session.orgId, type: "jira" } },
    });
    if (!integration) return NextResponse.json({ ok: false, error: "Jira not configured" }, { status: 404 });
    const cfg = integration.config as Record<string, string>;
    const apiToken = deobfuscate(cfg.apiToken);
    const credentials = Buffer.from(`${cfg.email}:${apiToken}`).toString("base64");
    const res = await fetch(`https://${cfg.url}/rest/api/3/myself`, {
      headers: { Authorization: `Basic ${credentials}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      return NextResponse.json({ ok: false, error: `Jira responded with ${res.status}: ${text}` });
    }
    const data = await res.json() as { displayName?: string };
    return NextResponse.json({ ok: true, displayName: data.displayName ?? cfg.email });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Request failed";
    if (msg === "Forbidden") return NextResponse.json({ error: msg }, { status: 403 });
    if (msg === "Unauthorized") return NextResponse.json({ error: msg }, { status: 401 });
    return NextResponse.json({ ok: false, error: msg });
  }
}
