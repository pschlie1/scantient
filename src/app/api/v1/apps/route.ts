import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-auth";
import { applyCors, corsPreflightResponse, CORS_HEADERS_API } from "@/lib/cors";

export function OPTIONS() {
  return corsPreflightResponse(CORS_HEADERS_API);
}

async function handler(req: Request): Promise<NextResponse> {
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

export async function GET(req: Request) {
  return applyCors(await handler(req), CORS_HEADERS_API);
}
