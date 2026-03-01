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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
    return NextResponse.next();
  }

  // Check for session cookie
  const session = request.cookies.get("scantient-session");
  if (!session?.value) {
    // API routes get 401, pages get redirect
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Verify JWT signature + expiry using jose (Edge Runtime compatible)
  const jwtSecret = process.env.JWT_SECRET;
  if (jwtSecret) {
    try {
      const secret = new TextEncoder().encode(jwtSecret);
      await jwtVerify(session.value, secret);
    } catch {
      // Invalid or expired token — clear cookie and redirect/reject
      if (pathname.startsWith("/api/")) {
        const res = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        res.cookies.delete("scantient-session");
        return res;
      }
      const res = NextResponse.redirect(new URL("/login", request.url));
      res.cookies.delete("scantient-session");

      return res;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logos/|icons/|images/|.*\\.svg$|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.webp$|.*\\.ico$|.*\\.gif$).*)"],
};
