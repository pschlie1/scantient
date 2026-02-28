import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Count unique API keys used per time period (from lastUsedAt on ApiKey)
  const keys = await db.apiKey.findMany({
    where: { orgId: session.orgId, lastUsedAt: { not: null } },
    select: { id: true, lastUsedAt: true },
  });

  const daa = keys.filter((k) => k.lastUsedAt! >= dayAgo).length;
  const waa = keys.filter((k) => k.lastUsedAt! >= weekAgo).length;
  const maa = keys.filter((k) => k.lastUsedAt! >= monthAgo).length;

  // Also count API-related audit log entries for richer usage data
  const apiActions = await db.auditLog.count({
    where: {
      orgId: session.orgId,
      action: "API_KEY_USED",
      createdAt: { gte: monthAgo },
    },
  });

  return NextResponse.json({
    dailyActiveAgents: daa,
    weeklyActiveAgents: waa,
    monthlyActiveAgents: maa,
    totalApiCallsLast30d: apiActions,
  });
}
