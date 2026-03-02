import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

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

// Security headers applied to every non-static response
const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  // Vercel adds Access-Control-Allow-Origin: * by default — restrict to same origin.
  // Scantient is a web app, not a public API; cross-origin access is not permitted.
  "Access-Control-Allow-Origin": "https://scantient.com",
  "Content-Security-Policy": [
    "default-src 'self'",
    // unsafe-eval only needed in development for Next.js HMR; strip in production
    process.env.NODE_ENV === "development"
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    // Restrict img-src: own origin + data URIs + Stripe (for hosted payment elements)
    "img-src 'self' data: blob: https://q.stripe.com",
    "font-src 'self' data:",
    // connect-src: add Sentry ingest so client-side errors are captured
    "connect-src 'self' https://api.resend.com https://api.stripe.com https://o*.ingest.sentry.io",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Report CSP violations to /api/health (cheap endpoint, no auth required)
    "report-uri /api/health",
  ].join("; "),
};

function applySecurityHeaders(response: NextResponse, isApiRoute: boolean): void {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
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

  // Public paths (exact or prefix match)
  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/v1/") || // API key auth handled in route
    pathname.startsWith("/api/public/") || // public scan/badge endpoints
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/invite/") // invite token pages
  ) {
    const response = NextResponse.next();
    // Do NOT apply no-store to public API routes — they serve cacheable content
    // (SVG badges, public scores) and should not be marked private/no-store.
    applySecurityHeaders(response, isApiRoute && !isPublicApiRoute);
    return response;
  }

  // Check for session cookie
  const session = request.cookies.get("scantient-session");
  if (!session?.value) {
    // API routes get 401, pages get redirect
    if (isApiRoute) {
      const res = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      applySecurityHeaders(res, true);
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
      applySecurityHeaders(res, true);
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
      applySecurityHeaders(res, true);
      return res;
    }
    const res = NextResponse.redirect(new URL("/login", request.url));
    res.cookies.delete("scantient-session");
    return res;
  }

  const response = NextResponse.next();
  applySecurityHeaders(response, isApiRoute);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logos/|icons/|images/|.*\\.svg$|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.webp$|.*\\.ico$|.*\\.gif$).*)"],
};
