import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-auth";

export async function GET(req: Request) {
  const orgId = await authenticateApiKey(req);
  if (!orgId) return NextResponse.json({ error: "Invalid API key" }, { status: 401 });

  const apps = await db.monitoredApp.findMany({
    where: { orgId },
    select: {
      id: true,
      name: true,
      url: true,
      status: true,
      criticality: true,
      lastCheckedAt: true,
      uptimePercent: true,
      avgResponseMs: true,
    },
    orderBy: { name: "asc" },
    take: 200,
  });

  return NextResponse.json({ apps });
}
