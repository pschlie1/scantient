import { NextResponse } from "next/server";
import { getSession, destroySession } from "@/lib/auth";
import { logAudit } from "@/lib/tenant";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = await checkRateLimit(`logout:${ip}`, { maxAttempts: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSeconds ?? 60) },
    });
  }

  // Capture session before destroying it (audit log needs user context)
  const session = await getSession().catch(() => null);
  await destroySession();
  // Audit log: user.logout (fire-and-forget)
  if (session) {
    logAudit(session, "user.logout", "auth").catch(() => { /* non-fatal */ });
  }
  return NextResponse.json({ ok: true });
}
