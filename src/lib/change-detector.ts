import { createHash } from "crypto";
import { db } from "@/lib/db";

/**
 * Generate a content hash from HTML body and response headers.
 * Strips volatile elements (timestamps, nonces, CSRF tokens) for stable comparison.
 */
export function computeContentHash(html: string, headers: Record<string, string> = {}): string {
  // Strip highly volatile content for stable hashing
  const cleanedHtml = html
    .replace(/nonce="[^"]*"/g, "")
    .replace(/csrf[^"]*"[^"]*"/gi, "")
    .replace(/<meta[^>]*name="generated-at"[^>]*>/gi, "")
    .replace(/\b\d{10,13}\b/g, "") // unix timestamps
    .trim();

  // Include security-relevant headers in the hash
  const relevantHeaders = [
    "content-security-policy",
    "x-frame-options",
    "strict-transport-security",
    "x-content-type-options",
    "server",
  ];

  const headerStr = relevantHeaders
    .map((h) => `${h}:${headers[h.toLowerCase()] ?? ""}`)
    .join("|");

  return createHash("sha256")
    .update(cleanedHtml + "|HEADERS|" + headerStr)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Check if the app content has changed since the last scan.
 * Returns { changed: boolean, previousHash, currentHash }.
 * Stores the hash in the run summary as a metadata prefix.
 */
export async function detectChange(
  appId: string,
  currentHash: string,
): Promise<{ changed: boolean; previousHash: string | null }> {
  // Find the most recent completed run for this app that has a hash stored
  const previousRun = await db.monitorRun.findFirst({
    where: {
      appId,
      completedAt: { not: null },
      summary: { startsWith: "[hash:" },
    },
    orderBy: { startedAt: "desc" },
  });

  if (!previousRun) {
    return { changed: false, previousHash: null };
  }

  // Extract hash from summary: "[hash:abc123] rest of summary"
  const match = previousRun.summary.match(/^\[hash:([a-f0-9]+)\]/);
  const previousHash = match?.[1] ?? null;

  return {
    changed: previousHash !== null && previousHash !== currentHash,
    previousHash,
  };
}

/**
 * Prefix a summary string with the content hash for storage.
 */
export function embedHashInSummary(hash: string, summary: string): string {
  return `[hash:${hash}] ${summary}`;
}
