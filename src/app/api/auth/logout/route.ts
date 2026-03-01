import { NextResponse } from "next/server";
import { getSession, destroySession } from "@/lib/auth";
import { logAudit } from "@/lib/tenant";

export async function POST() {
  // Capture session before destroying it (audit log needs user context)
  const session = await getSession().catch(() => null);
  await destroySession();
  // Audit log: user.logout (fire-and-forget)
  if (session) {
    logAudit(session, "user.logout", "auth").catch(() => { /* non-fatal */ });
  }
  return NextResponse.json({ ok: true });
}
