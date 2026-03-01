import { NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** POST — generate a new agent key for the app (ADMIN/OWNER only) */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!["OWNER", "ADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const app = await db.monitoredApp.findFirst({ where: { id, orgId: session.orgId } });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rawKey = `sa_${randomBytes(32).toString("base64url")}`;
  const keyHash = sha256(rawKey);
  const keyPrefix = rawKey.slice(0, 10);

  await db.monitoredApp.update({
    where: { id },
    data: {
      agentEnabled: true,
      agentKeyHash: keyHash,
      agentKeyPrefix: keyPrefix,
    },
  });

  return NextResponse.json({ plainKey: rawKey, prefix: keyPrefix });
}

/** DELETE — revoke the agent key for the app (ADMIN/OWNER only) */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!["OWNER", "ADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const app = await db.monitoredApp.findFirst({ where: { id, orgId: session.orgId } });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.monitoredApp.update({
    where: { id },
    data: {
      agentEnabled: false,
      agentKeyHash: null,
      agentKeyPrefix: null,
    },
  });

  return NextResponse.json({ ok: true });
}
