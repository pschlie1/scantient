import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

/**
 * AES-256-GCM encryption for sensitive config values (e.g. API tokens, SSO secrets).
 * Requires ENCRYPTION_KEY env var — throws if missing.
 * Format: base64( iv[12] + authTag[16] + ciphertext )
 */

function getEncryptionKey(): Buffer {
  const k = process.env.ENCRYPTION_KEY;
  if (!k) throw new Error("ENCRYPTION_KEY environment variable is required");
  return createHash("sha256").update(k).digest();
}

export function obfuscate(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Concatenate iv + authTag + ciphertext and base64-encode
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function deobfuscate(encoded: string): string {
  const data = Buffer.from(encoded, "base64");
  const iv = data.subarray(0, 12);
  const authTag = data.subarray(12, 28);
  const ciphertext = data.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// Named aliases for clarity
export const encrypt = obfuscate;
export const decrypt = deobfuscate;
