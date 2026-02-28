import crypto from "node:crypto";
import { db } from "@/lib/db";

/**
 * Authenticate a request using a VibeSafe API key (Bearer token).
 * Returns the orgId if valid, null otherwise.
 */
export async function authenticateApiKey(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer vs_")) return null;

  const token = auth.slice(7); // Remove "Bearer "
  const hash = crypto.createHash("sha256").update(token).digest("hex");

  const key = await db.apiKey.findFirst({
    where: { keyHash: hash },
  });

  if (!key) return null;

  // Check expiry
  if (key.expiresAt && key.expiresAt < new Date()) return null;

  // Update last used
  await db.apiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() },
  });

  // Log API key usage for agent activity tracking (DAA/WAA/MAA)
  await db.auditLog.create({
    data: {
      orgId: key.orgId,
      action: "API_KEY_USED",
      resource: `apikey:${key.id}`,
      details: JSON.stringify({ keyPrefix: key.keyPrefix }),
    },
  }).catch(() => {}); // Non-blocking — don't fail auth if logging fails

  return key.orgId;
}
