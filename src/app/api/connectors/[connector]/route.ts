/**
 * Connector credentials API
 *
 * GET  /api/connectors/[connector] — returns whether credentials are configured
 * POST /api/connectors/[connector] — save/update credentials (encrypted)
 * DELETE /api/connectors/[connector] — remove credentials
 *
 * Credentials are AES-256-GCM encrypted using ENCRYPTION_KEY before storage.
 * The plain credentials are never returned by GET — only configuration status.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { encrypt, decrypt } from "@/lib/crypto-util";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/tenant";

const VALID_CONNECTORS = ["vercel", "github", "stripe"] as const;
type ConnectorName = (typeof VALID_CONNECTORS)[number];

function isValidConnector(name: string): name is ConnectorName {
  return VALID_CONNECTORS.includes(name as ConnectorName);
}

// Credential schemas per connector
const credentialSchemas: Record<ConnectorName, z.ZodTypeAny> = {
  vercel: z.object({
    token: z.string().min(1),
    projectId: z.string().optional(),
  }),
  github: z.object({
    token: z.string().min(1),
    owner: z.string().min(1),
    repo: z.string().min(1),
  }),
  stripe: z.object({
    secretKey: z.string().min(1),
  }),
};

type RouteParams = { params: Promise<{ connector: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { connector } = await params;
  if (!isValidConnector(connector)) {
    return NextResponse.json({ error: "Unknown connector" }, { status: 404 });
  }

  const cred = await db.connectorCredential.findUnique({
    where: { orgId_connector: { orgId: session.orgId, connector } },
    select: { id: true, updatedAt: true },
  });

  return NextResponse.json({
    connector,
    configured: cred !== null,
    updatedAt: cred?.updatedAt.toISOString() ?? null,
  });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (["VIEWER", "MEMBER"].includes(session.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const rl = await checkRateLimit(`connector-save:${session.orgId}`, {
    maxAttempts: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { connector } = await params;
  if (!isValidConnector(connector)) {
    return NextResponse.json({ error: "Unknown connector" }, { status: 404 });
  }

  const body = await req.json();
  const schema = credentialSchemas[connector];
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const encrypted = encrypt(JSON.stringify(parsed.data));

  await db.connectorCredential.upsert({
    where: { orgId_connector: { orgId: session.orgId, connector } },
    create: {
      orgId: session.orgId,
      connector,
      encrypted,
    },
    update: { encrypted },
  });

  await logAudit(session, "connector.saved", connector, `Saved ${connector} connector credentials`);

  return NextResponse.json({ ok: true, connector });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (["VIEWER", "MEMBER"].includes(session.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { connector } = await params;
  if (!isValidConnector(connector)) {
    return NextResponse.json({ error: "Unknown connector" }, { status: 404 });
  }

  await db.connectorCredential.deleteMany({
    where: { orgId: session.orgId, connector },
  });

  await logAudit(session, "connector.removed", connector, `Removed ${connector} connector`);

  return NextResponse.json({ ok: true });
}

/**
 * Utility: load and decrypt connector credentials for a given org.
 * Returns null if no credentials are configured.
 * Used internally by the scanner.
 */
export async function getConnectorCredentials(
  orgId: string,
  connector: ConnectorName,
): Promise<Record<string, string> | null> {
  const cred = await db.connectorCredential.findUnique({
    where: { orgId_connector: { orgId, connector } },
  });
  if (!cred) return null;
  try {
    const decrypted = decrypt(cred.encrypted);
    return JSON.parse(decrypted) as Record<string, string>;
  } catch {
    return null;
  }
}
