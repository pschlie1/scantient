import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getOrgLimits } from "@/lib/tenant";
import { isPrivateUrl } from "@/lib/ssrf-guard";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const configs = await db.alertConfig.findMany({
    where: { orgId: session.orgId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ configs });
}

const TIER_CHANNELS: Record<string, string[]> = {
  FREE: [],
  STARTER: ["EMAIL"],
  PRO: ["EMAIL", "SLACK"],
  ENTERPRISE: ["EMAIL", "SLACK", "WEBHOOK"],
  ENTERPRISE_PLUS: ["EMAIL", "SLACK", "WEBHOOK"],
  EXPIRED: [],
};

const createSchema = z.object({
  channel: z.enum(["EMAIL", "SLACK", "WEBHOOK"]),
  destination: z.string().min(3),
  minSeverity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("HIGH"),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (["VIEWER", "MEMBER"].includes(session.role)) {
    return NextResponse.json({ error: "Viewers have read-only access" }, { status: 403 });
  }

  const limits = await getOrgLimits(session.orgId);
  const allowedChannels = TIER_CHANNELS[limits.tier] ?? [];

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (!allowedChannels.includes(parsed.data.channel)) {
    const available = allowedChannels.length
      ? `Your ${limits.tier} plan supports: ${allowedChannels.join(", ")}.`
      : `Your ${limits.tier} plan does not include alert channels.`;
    return NextResponse.json(
      { error: `${parsed.data.channel} alerts are not available on your plan. ${available} Upgrade for more options.` },
      { status: 403 },
    );
  }

  // SSRF guard for URL-based channels
  if (["SLACK", "WEBHOOK"].includes(parsed.data.channel)) {
    let isBlocked = false;
    try {
      isBlocked = await isPrivateUrl(parsed.data.destination);
    } catch {
      isBlocked = true;
    }
    if (isBlocked) {
      return NextResponse.json(
        { error: "Destination URL points to a private or internal address. Use a public webhook URL." },
        { status: 400 },
      );
    }
  }

  const config = await db.alertConfig.create({
    data: {
      orgId: session.orgId,
      ...parsed.data,
    },
  });

  return NextResponse.json({ config }, { status: 201 });
}
