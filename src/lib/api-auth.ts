import crypto from "node:crypto";
import { db } from "@/lib/db";

// API keys use a "vs_" prefix — reject anything that doesn't match before hitting the DB.
const API_KEY_PREFIX = "vs_";
const API_KEY_MIN_LENGTH = 10;  // Must have prefix + at least 7 chars
const API_KEY_MAX_LENGTH = 60;  // Generous ceiling; prevents extreme-length DB queries

/**
 * Authenticate a request using an API key from the X-API-Key header.
 * Used by public/CI endpoints.
 */
export async function authenticateApiKeyHeader(req: Request): Promise<string | null> {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey?.startsWith(API_KEY_PREFIX) || apiKey.length < API_KEY_MIN_LENGTH || apiKey.length > API_KEY_MAX_LENGTH) return null;

  const hash = crypto.createHash("sha256").update(apiKey).digest("hex");
  const key = await db.apiKey.findFirst({ where: { keyHash: hash } });
  if (!key) return null;
  if (key.expiresAt && key.expiresAt < new Date()) return null;

  // Verify org still has an active PRO+ subscription
  const sub = await db.subscription.findUnique({ where: { orgId: key.orgId } });
  const tier = sub?.tier ?? "FREE";
  if (!["PRO", "ENTERPRISE", "ENTERPRISE_PLUS"].includes(tier)) return null;

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
 * Authenticate a request using a Scantient API key (Bearer token).
 * Returns the orgId if valid and org has an active PRO+ subscription, null otherwise.
 */
export async function authenticateApiKey(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith(`Bearer ${API_KEY_PREFIX}`)) return null;
  
  const token = auth.slice(7);
  if (token.length < API_KEY_MIN_LENGTH || token.length > API_KEY_MAX_LENGTH) return null;

  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const key = await db.apiKey.findFirst({ where: { keyHash: hash } });
  if (!key) return null;
  if (key.expiresAt && key.expiresAt < new Date()) return null;

  // Verify org still has an active PRO+ subscription
  const sub = await db.subscription.findUnique({ where: { orgId: key.orgId } });
  const tier = sub?.tier ?? "FREE";
  if (!["PRO", "ENTERPRISE", "ENTERPRISE_PLUS"].includes(tier)) return null;

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
