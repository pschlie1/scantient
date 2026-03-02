import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getOrgLimits } from "@/lib/tenant";
import { logApiError } from "@/lib/observability";
import { urlSchema } from "@/lib/validation";

const bulkAppSchema = z.object({
  apps: z
    .array(
      z.object({
        url: urlSchema,
        name: z.string().max(100, "App name must be 100 characters or fewer").optional(),
        ownerEmail: z.string().email().optional(),
        criticality: z.enum(["low", "medium", "high", "critical"]).optional(),
      }),
    )
    .min(1, "At least one app is required")
    .max(50, "Maximum 50 apps per request"),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (["VIEWER", "MEMBER"].includes(session.role)) {
    return NextResponse.json({ error: "Viewers have read-only access" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const parsed = bulkAppSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { apps } = parsed.data;

    // Check org plan limits
    const limits = await getOrgLimits(session.orgId);
    const currentCount = await db.monitoredApp.count({ where: { orgId: session.orgId } });

    if (currentCount >= limits.maxApps) {
      return NextResponse.json(
        { error: `Your ${limits.tier} plan allows ${limits.maxApps} apps. Upgrade to add more.` },
        { status: 403 },
      );
    }

    const remainingSlots = limits.maxApps - currentCount;

    // Fetch existing URLs for dedup check (capped above any plan's app limit)
    const existingApps = await db.monitoredApp.findMany({
      where: { orgId: session.orgId },
      select: { url: true },
      take: 1000,
    });
    const existingUrls = new Set(existingApps.map((a) => a.url));

    let created = 0;
    let skipped = 0;
    const errors: Array<{ url: string; reason: string }> = [];

    for (const appInput of apps) {
      // Enforce remaining slots
      if (created >= remainingSlots) {
        errors.push({
          url: appInput.url,
          reason: `Plan limit reached (${limits.maxApps} apps max on ${limits.tier} plan)`,
        });
        continue;
      }

      // Skip duplicates
      if (existingUrls.has(appInput.url)) {
        skipped++;
        continue;
      }

      try {
        const hostname = new URL(appInput.url).hostname;
        const name = appInput.name ?? hostname;
        const ownerEmail = appInput.ownerEmail ?? session.email;
        const criticality = appInput.criticality ?? "medium";

        await db.monitoredApp.create({
          data: {
            orgId: session.orgId,
            url: appInput.url,
            name,
            ownerEmail,
            criticality,
            nextCheckAt: new Date(),
          },
        });

        existingUrls.add(appInput.url);
        created++;
      } catch (err) {
        errors.push({
          url: appInput.url,
          reason: err instanceof Error ? err.message : "Failed to create app",
        });
      }
    }

    return NextResponse.json({ created, skipped, errors });
  } catch (error) {
    logApiError(error, {
      route: "/api/apps/bulk",
      method: "POST",
      orgId: session.orgId,
      userId: session.id,
      statusCode: 500,
    });

    return NextResponse.json({ error: "Failed to process bulk add" }, { status: 500 });
  }
}
