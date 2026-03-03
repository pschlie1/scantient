import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAudit, getOrgLimits } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { atLeast } from "@/lib/tier-capabilities";

function generateApiKey(): { plain: string; hash: string; prefix: string } {
  const raw = crypto.randomBytes(32).toString("base64url");
  const plain = `vs_${raw}`;
  const hash = crypto.createHash("sha256").update(plain).digest("hex");
  const prefix = plain.slice(0, 10);
  return { plain, hash, prefix };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const keys = await db.apiKey.findMany({
    where: { orgId: session.orgId },
    select: { id: true, name: true, keyPrefix: true, lastUsedAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 100, // defensive cap; actual key counts are plan-capped (max 50)
  });

  return NextResponse.json({ keys });
}

const createSchema = z.object({ name: z.string().min(1) });

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!["OWNER", "ADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Admin access required to create API keys" }, { status: 403 });
  }

  const rl = await checkRateLimit(`api-key-create:${session.orgId}`, {
    maxAttempts: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSeconds ?? 60) },
    });
  }

  const limits = await getOrgLimits(session.orgId);
  if (!atLeast(limits.tier, "PRO")) {
    return NextResponse.json(
      { error: "API key access is available on Pro and Enterprise plans. Please upgrade to continue." },
      { status: 403 },
    );
  }

  // Fix 5: Enforce per-tier API key caps
  const KEY_CAPS: Record<string, number> = {
    PRO: 5,
    ENTERPRISE: 20,
    ENTERPRISE_PLUS: 50,
  };

  const cap = KEY_CAPS[limits.tier] ?? 0;
  if (cap > 0) {
    const existingCount = await db.apiKey.count({ where: { orgId: session.orgId } });
    if (existingCount >= cap) {
      return NextResponse.json(
        { error: `Your ${limits.tier} plan allows up to ${cap} API keys. Delete an existing key to create a new one.` },
        { status: 403 },
      );
    }
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const { plain, hash, prefix } = generateApiKey();

  const key = await db.apiKey.create({
    data: {
      orgId: session.orgId,
      name: parsed.data.name,
      keyHash: hash,
      keyPrefix: prefix,
      createdByUserId: session.id,
    },
    select: { id: true, name: true, keyPrefix: true, lastUsedAt: true, createdAt: true },
  });

  await logAudit(session, "api_key.created", key.id, `Created API key: ${key.name}`);

  return NextResponse.json({ key, plainKey: plain }, { status: 201 });
}
