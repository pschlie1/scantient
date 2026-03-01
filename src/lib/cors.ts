import { NextResponse } from "next/server";

/**
 * CORS configuration for Scantient API routes.
 *
 * /api/v1/** — API-key authenticated developer endpoints. Authentication is
 *              carried in the Authorization header (not cookies), so wildcard
 *              origin is safe. Credentials are NOT allowed.
 *
 * /api/public/** — Unauthenticated public endpoints (badges, scores, CI scans).
 *                  Open CORS is intentional — they're designed for embedding.
 */

export const CORS_HEADERS_API = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
  "Access-Control-Max-Age": "86400",
} as const;

export const CORS_HEADERS_PUBLIC = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
  "Access-Control-Max-Age": "86400",
} as const;

/** Apply CORS headers to an existing NextResponse. */
export function applyCors(
  response: NextResponse,
  headers: Record<string, string>,
): NextResponse {
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

/** Return a 204 No Content response for OPTIONS preflight requests. */
export function corsPreflightResponse(
  headers: Record<string, string>,
): NextResponse {
  const response = new NextResponse(null, { status: 204 });
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}
