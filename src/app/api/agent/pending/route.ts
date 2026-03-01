import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { getOrgLimits } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

async function resolveAppFromBearer(authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  if (!token.startsWith("sa_")) return null;

  const hash = sha256(token);
  const app = await db.monitoredApp.findFirst({ where: { agentKeyHash: hash, agentEnabled: true } });
  if (!app) return null;

  // Verify org still has PRO+ subscription
  const limits = await getOrgLimits(app.orgId);
  if (!["PRO", "ENTERPRISE", "ENTERPRISE_PLUS"].includes(limits.tier)) return null;

  return app;
}

/** GET — agent polls to check if a manual scan was requested */
export async function GET(req: Request) {
  const app = await resolveAppFromBearer(req.headers.get("authorization"));
  if (!app) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit: max 60 polls/hour per app (one per minute is plenty for agents)
  const rl = await checkRateLimit(`agent-pending:${app.id}`, {
    maxAttempts: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Polling too frequently. Back off and retry in 1 minute." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds ?? 60) } },
    );
  }

  // Update lastSeenAt
  await db.monitoredApp.update({
    where: { id: app.id },
    data: { agentLastSeenAt: new Date() },
  });

  // Future: check for a "scan requested" flag; for now always false
  return NextResponse.json({ scanRequested: false });
}
