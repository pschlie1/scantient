import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

async function resolveAppFromBearer(authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  if (!token.startsWith("sa_")) return null;

  const hash = sha256(token);
  return db.monitoredApp.findFirst({ where: { agentKeyHash: hash, agentEnabled: true } });
}

/** GET — agent polls to check if a manual scan was requested */
export async function GET(req: Request) {
  const app = await resolveAppFromBearer(req.headers.get("authorization"));
  if (!app) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Update lastSeenAt
  await db.monitoredApp.update({
    where: { id: app.id },
    data: { agentLastSeenAt: new Date() },
  });

  // Future: check for a "scan requested" flag; for now always false
  return NextResponse.json({ scanRequested: false });
}
