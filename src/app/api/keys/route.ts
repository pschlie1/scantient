import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAudit, getOrgLimits } from "@/lib/tenant";

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
  });

  return NextResponse.json({ keys });
}

const createSchema = z.object({ name: z.string().min(1) });

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!["OWNER", "ADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Only admins can create API keys" }, { status: 403 });
  }

  const limits = await getOrgLimits(session.orgId);
  if (!["PRO", "ENTERPRISE"].includes(limits.tier)) {
    return NextResponse.json(
      { error: "API key access is available on Pro and Enterprise plans. Please upgrade to continue." },
      { status: 403 },
    );
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
    },
    select: { id: true, name: true, keyPrefix: true, lastUsedAt: true, createdAt: true },
  });

  await logAudit(session, "api_key.created", key.id, `Created API key: ${key.name}`);

  return NextResponse.json({ key, plainKey: plain }, { status: 201 });
}
