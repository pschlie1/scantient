import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "IGNORED"])
    .optional(),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
});

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    page: searchParams.get("page") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    severity: searchParams.get("severity") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { page, limit, status, severity } = parsed.data;
  const skip = (page - 1) * limit;

  const where = {
    run: { app: { orgId: session.orgId } },
    ...(status ? { status } : {}),
    ...(severity ? { severity } : {}),
  };

  const [findings, total] = await Promise.all([
    db.finding.findMany({
      where,
      orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
      skip,
      take: limit,
      include: {
        run: {
          select: {
            appId: true,
            app: { select: { name: true, url: true } },
          },
        },
      },
    }),
    db.finding.count({ where }),
  ]);

  return NextResponse.json({
    findings,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}
