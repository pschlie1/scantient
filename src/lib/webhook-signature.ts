/**
 * Webhook signature utilities.
 * HMAC-SHA256 signatures for webhook authenticity verification.
 */

import { createHmac, timingSafeEqual } from "crypto";

/**
 * Sign a webhook payload string with HMAC-SHA256.
 * Returns a hex-encoded signature prefixed with "sha256=".
 */
export function signWebhookPayload(payload: string, secret: string): string {
  const hmac = createHmac("sha256", secret);
  hmac.update(payload, "utf8");
  return `sha256=${hmac.digest("hex")}`;
}

/**
 * Verify a webhook signature.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  try {
    const expected = signWebhookPayload(payload, secret);
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signature, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
