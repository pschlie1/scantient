import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { runHttpScanForApp } from "@/lib/scanner-http";
import { trackEvent } from "@/lib/analytics";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Verify app belongs to org
  const app = await db.monitoredApp.findFirst({ where: { id, orgId: session.orgId } });
  if (!app) return NextResponse.json({ error: "App not found" }, { status: 404 });

  try {
    await trackEvent({
      event: "scan_triggered",
      orgId: session.orgId,
      userId: session.id,
      properties: { appId: id, source: "manual" },
    });

    const result = await runHttpScanForApp(id, { source: "manual", userId: session.id });
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scan failed" },
      { status: 500 },
    );
  }
}
