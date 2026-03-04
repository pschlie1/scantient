import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getOrgLimits, logAudit } from "@/lib/tenant";
import { logApiError } from "@/lib/observability";
import { urlSchema } from "@/lib/validation";
import { isPrivateUrl } from "@/lib/ssrf-guard";
import { checkRateLimit } from "@/lib/rate-limit";

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

  // audit-23: Rate limit bulk add — 5 requests per hour per org (each can add up to 50 apps).
  // Without this limit the endpoint could be used to exhaust storage or create thousands of
  // scan jobs in rapid succession by bypassing the per-request app-count checks.
  const rl = await checkRateLimit(`apps-bulk:${session.orgId}`, {
    maxAttempts: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many bulk-add requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds ?? 3600) },
      },
    );
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

      // audit-23: SSRF guard — reject private/internal URLs per-entry.
      // The single-app POST /api/apps correctly blocks these, but the bulk endpoint
      // previously skipped this check, letting attackers register internal addresses
      // (e.g. 169.254.169.254, 10.x.x.x) that would then be fetched by the scanner.
      let blocked = false;
      try {
        blocked = await isPrivateUrl(appInput.url);
      } catch {
        blocked = true;
      }
      if (blocked) {
        errors.push({
          url: appInput.url,
          reason: "App URL must be a public address. Private and internal URLs are not allowed.",
        });
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

    // audit-23: Audit log for bulk add operations — ensures compliance trail matches
    // single-app create behaviour (which always calls logAudit).
    if (created > 0) {
      await logAudit(
        session,
        "app.bulk_created",
        "bulk",
        `Bulk registered ${created} app(s); skipped ${skipped}; errors ${errors.length}`,
      );
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
