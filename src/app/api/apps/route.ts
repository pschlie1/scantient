import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createAppSchema } from "@/lib/types";

export async function GET() {
  const apps = await db.monitoredApp.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      monitorRuns: {
        orderBy: { startedAt: "desc" },
        include: { findings: true },
        take: 1,
      },
    },
  });

  return NextResponse.json({ apps });
}

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = createAppSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Check for duplicate URL
  const existing = await db.monitoredApp.findUnique({
    where: { url: parsed.data.url },
  });

  if (existing) {
    return NextResponse.json(
      { error: { message: `This URL is already being monitored as "${existing.name}"` } },
      { status: 409 },
    );
  }

  const app = await db.monitoredApp.create({
    data: {
      ...parsed.data,
      nextCheckAt: new Date(),
    },
  });

  return NextResponse.json({ app }, { status: 201 });
}
