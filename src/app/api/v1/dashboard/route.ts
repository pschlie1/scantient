import { subDays } from "date-fns";
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

  const sevenDaysAgo = subDays(new Date(), 7);

  const [apps, openFindings] = await Promise.all([
    db.monitoredApp.findMany({
      where: { orgId },
      select: { id: true, name: true, status: true, lastCheckedAt: true, avgResponseMs: true },
      take: 200,
    }),
    db.finding.count({
      where: {
        status: "OPEN",
        severity: { in: ["CRITICAL", "HIGH"] },
        run: { app: { orgId } },
        createdAt: { gte: sevenDaysAgo },
      },
    }),
  ]);

  const healthy = apps.filter((a) => a.status === "HEALTHY").length;
  const warning = apps.filter((a) => a.status === "WARNING").length;
  const critical = apps.filter((a) => a.status === "CRITICAL").length;

  return NextResponse.json({
    summary: {
      totalApps: apps.length,
      healthy,
      warning,
      critical,
      openCriticalFindings: openFindings,
    },
    apps,
  });
}

export async function GET(req: Request) {
  return applyCors(await handler(req), CORS_HEADERS_API);
}
