import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAddApp, logAudit } from "@/lib/tenant";
import { isPrivateUrl } from "@/lib/ssrf-guard";
import { createAppSchema } from "@/lib/types";
import { logApiError } from "@/lib/observability";
import { trackEvent } from "@/lib/analytics";
import { checkRateLimit } from "@/lib/rate-limit";

const appsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const queryParsed = appsQuerySchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });
    if (!queryParsed.success) {
      return NextResponse.json({ error: queryParsed.error.flatten() }, { status: 400 });
    }
    const { page, limit } = queryParsed.data;
    const skip = (page - 1) * limit;

    const [apps, total] = await Promise.all([
      db.monitoredApp.findMany({
        where: { orgId: session.orgId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          monitorRuns: {
            orderBy: { startedAt: "desc" },
            include: { findings: true },
            take: 1,
          },
        },
      }),
      db.monitoredApp.count({ where: { orgId: session.orgId } }),
    ]);

    return NextResponse.json({
      apps,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    logApiError(error, {
      route: "/api/apps",
      method: "GET",
      orgId: session.orgId,
      userId: session.id,
      statusCode: 500,
    });

    return NextResponse.json({ error: "Failed to load apps" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (session.role === "VIEWER") {
    return NextResponse.json({ error: "Viewers have read-only access" }, { status: 403 });
  }

  const rl = await checkRateLimit(`apps-create:${session.orgId}`, {
    maxAttempts: 30,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSeconds ?? 60) },
    });
  }

  try {
    const body = await req.json();
    const parsed = createAppSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    // Check plan limits
    const { allowed, reason } = await canAddApp(session.orgId);
    if (!allowed) {
      return NextResponse.json({ error: reason }, { status: 403 });
    }

    // SSRF guard: reject private/internal URLs
    if (await isPrivateUrl(parsed.data.url)) {
      return NextResponse.json(
        { error: "App URL must be a public address. Private and internal URLs are not allowed." },
        { status: 400 },
      );
    }

    // Check for duplicate URL within org
    const existing = await db.monitoredApp.findFirst({
      where: { orgId: session.orgId, url: parsed.data.url },
    });

    if (existing) {
      return NextResponse.json(
        { error: `This URL is already monitored as "${existing.name}"` },
        { status: 409 },
      );
    }

    const app = await db.monitoredApp.create({
      data: {
        orgId: session.orgId,
        ...parsed.data,
        nextCheckAt: new Date(),
      },
    });

    await logAudit(session, "app.created", app.id, `Registered ${app.name} (${app.url})`);
    await trackEvent({
      event: "app_created",
      orgId: session.orgId,
      userId: session.id,
      properties: { appId: app.id, criticality: app.criticality },
    });

    return NextResponse.json({ app }, { status: 201 });
  } catch (error) {
    logApiError(error, {
      route: "/api/apps",
      method: "POST",
      orgId: session.orgId,
      userId: session.id,
      statusCode: 500,
    });

    return NextResponse.json({ error: "Failed to register app" }, { status: 500 });
  }
}
