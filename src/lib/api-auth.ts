import crypto from "node:crypto";
import { db } from "@/lib/db";

/**
 * Authenticate a request using an API key from the X-API-Key header.
 * Used by public/CI endpoints.
 */
export async function authenticateApiKeyHeader(req: Request): Promise<string | null> {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey?.startsWith("vs_")) return null;

  const hash = crypto.createHash("sha256").update(apiKey).digest("hex");
  const key = await db.apiKey.findFirst({ where: { keyHash: hash } });
  if (!key) return null;
  if (key.expiresAt && key.expiresAt < new Date()) return null;

  await db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  await db.auditLog.create({
    data: {
      orgId: key.orgId,
      action: "API_KEY_USED",
      resource: `apikey:${key.id}`,
      details: JSON.stringify({ keyPrefix: key.keyPrefix, source: "x-api-key-header" }),
    },
  }).catch(() => {});
  return key.orgId;
}

/**
 * Authenticate a request using a VibeSafe API key (Bearer token).
 * Returns the orgId if valid, null otherwise.
 */
export async function authenticateApiKey(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer vs_")) return null;

  const token = auth.slice(7);
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const key = await db.apiKey.findFirst({ where: { keyHash: hash } });
  if (!key) return null;
  if (key.expiresAt && key.expiresAt < new Date()) return null;

  await db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  await db.auditLog.create({
    data: {
      orgId: key.orgId,
      action: "API_KEY_USED",
      resource: `apikey:${key.id}`,
      details: JSON.stringify({ keyPrefix: key.keyPrefix }),
    },
  }).catch(() => {});
  return key.orgId;
}
