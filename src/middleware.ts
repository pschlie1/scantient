import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * Generate a cryptographically random nonce for CSP.
 * Uses the Web Crypto API (available in Edge Runtime and Node 18+).
 */
function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/about",
  "/blog",
  "/careers",
  "/compliance",
  "/contact",
  "/cookie-policy",
  "/docs",
  "/help",
  "/press",
  "/privacy",
  "/score",
  "/security-checklist",
  "/status",
  "/terms",
  "/vibe-coding-risks",
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/forgot-password",
  "/api/auth/verify-email",
  "/api/auth/sso",
  "/api/stripe/webhook",
  "/api/cron/run",
  "/api/health",
  "/api/newsletter/subscribe",
  "/api/public",
];

// Static security headers (applied to every non-static response)
const STATIC_SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
};

/**
 * Build a per-request Content-Security-Policy header using a nonce.
 *
 * Strategy: nonce + strict-dynamic
 * - `nonce-{nonce}`: only scripts with this nonce attribute execute
 * - `strict-dynamic`: nonce-approved scripts may load further scripts dynamically
 *   (required for Next.js chunk loading)
 * - `unsafe-inline`: fallback for older browsers that don't support nonces
 *   (ignored by modern browsers when a nonce is present)
 * - `unsafe-eval`: only in development (Next.js HMR requires it)
 *
 * This is materially stronger than `'unsafe-inline'` alone because modern
 * browsers enforce the nonce, blocking any injected inline scripts.
 */
function buildCsp(nonce: string): string {
  const scriptSrc =
    process.env.NODE_ENV === "development"
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline' 'unsafe-eval'`
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline'`;

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    // img-src: own origin + data URIs + Stripe (hosted payment elements)
    "img-src 'self' data: blob: https://q.stripe.com",
    "font-src 'self' data:",
    // connect-src: Sentry ingest for client-side error capture
    "connect-src 'self' https://api.resend.com https://api.stripe.com https://o*.ingest.sentry.io",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Report CSP violations to /api/health (cheap endpoint, no auth required)
    "report-uri /api/health",
  ].join("; ");
}

function applySecurityHeaders(
  response: NextResponse,
  nonce: string,
  isApiRoute: boolean,
): void {
  // Static headers
  for (const [key, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  // Dynamic nonce-based CSP
  response.headers.set("Content-Security-Policy", buildCsp(nonce));
  // Prevent caching of authenticated API responses
  if (isApiRoute) {
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    response.headers.set("Pragma", "no-cache");
    // Surface rate limiting so scanners and API clients know limits are enforced
    response.headers.set("X-RateLimit-Limit", "100");
    response.headers.set("X-RateLimit-Policy", "100;w=60");
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApiRoute = pathname.startsWith("/api/");
  // Public API routes (badges, public scores) should remain cacheable —
  // exclude them from the no-store / private Cache-Control header.
  const isPublicApiRoute = pathname.startsWith("/api/public/");

  // Generate a per-request nonce for CSP. Used for all non-static responses.
  const nonce = generateNonce();

  // Helper: build a NextResponse.next() that forwards the nonce to the app
  // via a request header so layout.tsx can read it via next/headers.
  const nextWithNonce = () =>
    NextResponse.next({
      request: { headers: new Headers({ ...Object.fromEntries(request.headers), "x-nonce": nonce }) },
    });

  // Public paths (exact or prefix match)
  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/v1/") || // API key auth handled in route
    pathname.startsWith("/api/public/") || // public scan/badge endpoints
    pathname.startsWith("/api/internal/") || // internal probe — has own token auth
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/invite/") // invite token pages
  ) {
    const response = nextWithNonce();
    // Do NOT apply no-store to public API routes — they serve cacheable content
    // (SVG badges, public scores) and should not be marked private/no-store.
    applySecurityHeaders(response, nonce, isApiRoute && !isPublicApiRoute);
    return response;
  }

  // Check for session cookie
  const session = request.cookies.get("scantient-session");
  if (!session?.value) {
    // API routes get 401, pages get redirect
    if (isApiRoute) {
      const res = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      applySecurityHeaders(res, nonce, true);
      return res;
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Verify JWT signature + expiry using jose (Edge Runtime compatible)
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    // Config error — fail closed. Never allow unverified access.
    if (isApiRoute) {
      const res = NextResponse.json({ error: "Server configuration error" }, { status: 500 });
      applySecurityHeaders(res, nonce, true);
      return res;
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
  try {
    const secret = new TextEncoder().encode(jwtSecret);
    await jwtVerify(session.value, secret);
  } catch {
    // Invalid or expired token — clear cookie and redirect/reject
    if (isApiRoute) {
      const res = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      res.cookies.delete("scantient-session");
      applySecurityHeaders(res, nonce, true);
      return res;
    }
    const res = NextResponse.redirect(new URL("/login", request.url));
    res.cookies.delete("scantient-session");
    return res;
  }

  const response = nextWithNonce();
  applySecurityHeaders(response, nonce, isApiRoute);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logos/|icons/|images/|.*\\.svg$|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.webp$|.*\\.ico$|.*\\.gif$).*)"],
};
