import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAddApp, logAudit } from "@/lib/tenant";
import { createAppSchema } from "@/lib/types";
import { logApiError } from "@/lib/observability";
import { trackEvent } from "@/lib/analytics";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));
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

  try {
    const body = await req.json();
    const parsed = createAppSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    // Check plan limits
    const { allowed, reason } = await canAddApp(session.orgId);
    if (!allowed) {
      return NextResponse.json({ error: { message: reason } }, { status: 403 });
    }

    // Check for duplicate URL within org
    const existing = await db.monitoredApp.findFirst({
      where: { orgId: session.orgId, url: parsed.data.url },
    });

    if (existing) {
      return NextResponse.json(
        { error: { message: `This URL is already monitored as "${existing.name}"` } },
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
