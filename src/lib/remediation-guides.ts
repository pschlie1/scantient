/**
 * Remediation Guides
 *
 * Step-by-step fixes for each security finding type.
 * Keep explanations short, actionable, and code-focused.
 */

export const REMEDIATION_GUIDES: Record<string, { title: string; steps: string[] }> = {
  // API & Authentication
  EXPOSED_API_KEY: {
    title: "Exposed API Key",
    steps: [
      "1. Do NOT commit the API key again—rotate it immediately in your provider's dashboard",
      "2. Move all API keys to environment variables: const apiKey = process.env.OPENAI_API_KEY",
      "3. Remove the key from all client-side code (React, JavaScript bundles)",
      "4. Use a backend API route to proxy requests (e.g., /api/proxy → calls OpenAI)",
      "5. Deploy and re-scan to verify the key is no longer exposed",
      "6. Consider adding .env to .gitignore and using dotenv-safe to prevent future leaks",
    ],
  },

  CLIENT_SIDE_AUTH_BYPASS: {
    title: "Client-Side Auth Bypass",
    steps: [
      "1. Verify: Is authentication decided in client-side JavaScript? (e.g., if (user.role === 'admin')).",
      "2. Move all auth checks to the server: return 401 if the user is not authenticated",
      "3. Use session tokens or JWTs verified on the backend for every request",
      "4. Never trust client-side role checks—always verify on the server",
      "5. Example: Server route should check req.user.role before returning sensitive data",
      "6. Re-scan to confirm the endpoint is now properly protected",
    ],
  },

  AUTH_MISSING_CSRF: {
    title: "CSRF Token Missing",
    steps: [
      "1. Add CSRF token generation on login: const csrfToken = generateRandomToken()",
      "2. Store CSRF token in session: req.session.csrfToken = csrfToken",
      "3. Return token to client: Send in response or as HTTP-only cookie",
      "4. On state-changing requests (POST/PUT/DELETE), require CSRF token in body or header",
      "5. Server-side validation: if (req.body.csrfToken !== req.session.csrfToken) return 403",
      "6. Use a library like csurf (Express) or built-in support in Next.js middleware",
    ],
  },

  AUTH_ACCOUNT_ENUMERATION: {
    title: "Account Enumeration",
    steps: [
      "1. Identify the issue: Does your login endpoint reveal which emails exist? (e.g., 'Email not found' vs generic error)",
      "2. Use generic error messages: 'Invalid email or password' for all cases",
      "3. Add rate limiting to prevent brute-force attempts: max 5 attempts per 15 minutes per IP",
      "4. Implement delays: Add a 1-second delay before responding, even on error",
      "5. Log suspicious activity: Alert if same IP tries 10+ logins in an hour",
      "6. Test: Try to enumerate accounts and verify no difference in response times or messages",
    ],
  },

  AUTH_COOKIE_MISSING_FLAGS: {
    title: "Cookie Missing Security Flags",
    steps: [
      "1. Check your cookie settings in the response headers",
      "2. Add HttpOnly flag: Prevents JavaScript from accessing the cookie (XSS protection)",
      "3. Add Secure flag: Cookie only sent over HTTPS, never HTTP",
      "4. Add SameSite flag: Set to 'Strict' or 'Lax' to prevent CSRF attacks",
      "5. Example (Node.js): res.cookie('sessionId', token, { httpOnly: true, secure: true, sameSite: 'strict' })",
      "6. Example (Next.js): Set in server action or API route with proper cookie headers",
      "7. Re-scan and verify all session cookies have all three flags",
    ],
  },

  AUTH_TOKEN_IN_URL: {
    title: "Sensitive Token in URL",
    steps: [
      "1. Find where the token is passed in the URL query parameter",
      "2. Move token to request body (POST) or Authorization header",
      "3. Example: Instead of /api/verify?token=xyz, use POST /api/verify with { token: 'xyz' } in body",
      "4. If it's a password reset link, use a secure session-based approach instead",
      "5. Tokens in URLs are logged in browser history, server logs, and proxies—always avoid",
      "6. Re-scan to verify tokens are no longer in URLs",
    ],
  },

  AUTH_PASSWORD_IN_RESPONSE: {
    title: "Password or Secret in Response",
    steps: [
      "1. Find the API endpoint that returns a password or secret",
      "2. Remove all sensitive data from responses: no passwords, keys, or private tokens",
      "3. Return only: { userId, email, role, lastLogin } — never credentials",
      "4. Use a separate secure endpoint to allow password changes (requires old password + new password)",
      "5. Add a check in your code review: grep for 'password' in API responses",
      "6. Re-scan and verify the endpoint no longer leaks credentials",
    ],
  },

  // Headers & Security
  MISSING_HSTS: {
    title: "Missing HSTS Header",
    steps: [
      "1. Add the Strict-Transport-Security header to all HTTPS responses",
      "2. Example: Strict-Transport-Security: max-age=31536000; includeSubDomains; preload",
      "3. max-age=31536000 means HTTPS is enforced for 1 year",
      "4. includeSubDomains applies HSTS to all subdomains",
      "5. preload allows your domain to be included in HSTS preload lists",
      "6. In Next.js: Add to next.config.ts or middleware",
      "7. Test: Check response headers in DevTools → Network → your domain → Response Headers",
    ],
  },

  MISSING_CSP_HEADER: {
    title: "Missing Content Security Policy (CSP)",
    steps: [
      "1. Add Content-Security-Policy header to define allowed script sources",
      "2. Start strict: Content-Security-Policy: default-src 'self'",
      "3. Whitelist your CDN: default-src 'self'; script-src 'self' https://cdn.example.com",
      "4. Allow inline styles if needed: style-src 'self' 'unsafe-inline' (or use nonce for better security)",
      "5. Block inline scripts: Prevents XSS attacks from injected malicious code",
      "6. In Next.js: Add to middleware or response headers",
      "7. Test: Use DevTools Console to check for CSP violations",
    ],
  },

  COOKIE_MISSING_SECURE: {
    title: "Cookie Missing Secure Flag",
    steps: [
      "1. Locate the cookie being set",
      "2. Add Secure flag so the cookie is only sent over HTTPS",
      "3. Example (Node.js): res.cookie('session', token, { secure: true })",
      "4. Example (Next.js): Response headers with Set-Cookie: session=...; Secure; ...",
      "5. Without Secure flag, attackers can intercept the cookie over HTTP",
      "6. Verify your site only uses HTTPS—no mixed HTTP/HTTPS content",
      "7. Re-scan to confirm the Secure flag is present",
    ],
  },

  COOKIE_MISSING_HTTPONLY: {
    title: "Cookie Missing HttpOnly Flag",
    steps: [
      "1. Find the cookie being set",
      "2. Add HttpOnly flag to prevent JavaScript from accessing the cookie",
      "3. Example (Node.js): res.cookie('session', token, { httpOnly: true })",
      "4. HttpOnly prevents XSS attacks from stealing cookies via document.cookie",
      "5. Without HttpOnly, a malicious script can steal session tokens",
      "6. Ensure session cookies (not tracking cookies) have HttpOnly",
      "7. Re-scan to verify the HttpOnly flag is present",
    ],
  },

  COOKIE_MISSING_SAMESITE: {
    title: "Cookie Missing SameSite Flag",
    steps: [
      "1. Find the cookie being set",
      "2. Add SameSite flag to prevent cross-site request forgery (CSRF)",
      "3. Example: res.cookie('session', token, { sameSite: 'strict' })",
      "4. SameSite=Strict: Cookie only sent on same-site requests (strict CSRF protection)",
      "5. SameSite=Lax: Cookie sent on safe cross-site requests (form submissions)",
      "6. For session cookies, use Strict. For tracking cookies, use Lax or None",
      "7. Re-scan to confirm SameSite flag is present",
    ],
  },

  // CORS
  PERMISSIVE_CORS: {
    title: "Permissive CORS Configuration",
    steps: [
      "1. Check your Access-Control-Allow-Origin header",
      "2. If it's set to '*' or a wildcard, it allows ANY origin to access your API",
      "3. Change to specific origins: Access-Control-Allow-Origin: https://yourdomain.com",
      "4. If you need multiple origins, list them explicitly (not wildcards)",
      "5. Example (Node.js): res.header('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN)",
      "6. Remove Access-Control-Allow-Credentials if using wildcard origins",
      "7. Re-scan and verify only your domain can access your API",
    ],
  },

  CORS_WILDCARD_CREDENTIALS: {
    title: "CORS Wildcard with Credentials",
    steps: [
      "1. This is a critical misconfiguration: Access-Control-Allow-Origin: * AND Access-Control-Allow-Credentials: true",
      "2. Remove one: Either use specific origins OR remove Allow-Credentials",
      "3. Correct approach: Access-Control-Allow-Origin: https://yourdomain.com; Access-Control-Allow-Credentials: true",
      "4. Never use '*' with credentials—it exposes your API to any origin",
      "5. Test: Verify your API rejects requests from unauthorized origins",
      "6. Re-scan to confirm the misconfiguration is fixed",
    ],
  },

  // Endpoints & Admin Exposure
  ADMIN_ENDPOINT_UNAUTHED: {
    title: "Admin Endpoint Without Authentication",
    steps: [
      "1. Identify the admin endpoint (e.g., /admin, /api/admin, /api/users)",
      "2. Check if authentication is required before accessing it",
      "3. Add authentication check: if (!req.user) return 403 Forbidden",
      "4. Verify the user is authenticated AND has admin role: if (req.user.role !== 'admin') return 403",
      "5. Add middleware: Protect all /admin routes with authentication checks",
      "6. Example (Next.js): Wrap route in requireRole(['ADMIN'])",
      "7. Re-scan and verify the endpoint returns 403 without proper authentication",
    ],
  },

  ADMIN_DEBUG_ENDPOINT_EXPOSED: {
    title: "Debug or Admin Endpoint Exposed",
    steps: [
      "1. Find the exposed endpoint (e.g., /debug, /api/debug, phpinfo.php, /actuator)",
      "2. Remove it entirely if not needed (best option)",
      "3. Or: Restrict access to internal IPs only",
      "4. Or: Add authentication (if it's intentional admin access)",
      "5. Example (Node.js): if (req.ip !== '127.0.0.1') return 403",
      "6. Never expose debug endpoints in production—use proper logging instead",
      "7. Re-scan to verify the endpoint is no longer accessible",
    ],
  },

  // Files & Dependencies
  DEPENDENCY_FILE_EXPOSED: {
    title: "Dependency File Exposed (package.json, requirements.txt)",
    steps: [
      "1. Check if /package.json, /requirements.txt, /Gemfile, etc. are accessible",
      "2. Configure your web server to deny access to these files",
      "3. Example (Apache .htaccess): <FilesMatch \"package\\.json\"> Deny from all </FilesMatch>",
      "4. Example (Nginx): location ~* /package\\.json { deny all; }",
      "5. Example (Next.js): Add to middleware or vercel.json",
      "6. Remove these files from the public/ directory if present",
      "7. Re-scan and verify the files are no longer accessible",
    ],
  },

  SENSITIVE_FILE_EXPOSED: {
    title: "Sensitive File Exposed",
    steps: [
      "1. Identify the exposed file (.env, .git/HEAD, config.php, settings.json, etc.)",
      "2. Move sensitive files outside the web root (out of public/ directory)",
      "3. Add access restrictions in your web server config",
      "4. Example (nginx): location ~ /\\\\.env { deny all; }",
      "5. Example (Node.js): Check NODE_ENV—never serve .env files to clients",
      "6. Add to .gitignore: .env, .env.local, config files with secrets",
      "7. Re-scan and verify sensitive files are not accessible",
    ],
  },

  DEP_JQUERY_OUTDATED: {
    title: "Outdated jQuery Library",
    steps: [
      "1. Check your current jQuery version in the page source: <script src=\"jquery-1.x.x.js\"></script>",
      "2. Update to the latest stable version: jquery-3.7.x or newer",
      "3. Option A: Update CDN link: <script src=\"https://code.jquery.com/jquery-3.7.1.min.js\"></script>",
      "4. Option B: Update npm package: npm install --save jquery@latest",
      "5. Test your site thoroughly—jQuery updates can have breaking changes",
      "6. Consider replacing jQuery with vanilla JavaScript (Fetch API, DOM methods)",
      "7. Re-scan and verify jQuery is updated to the latest version",
    ],
  },

  // Content & Performance
  CONTENT_CHANGED: {
    title: "Content Changed Unexpectedly",
    steps: [
      "1. This alert indicates your homepage content changed since the last scan",
      "2. Investigate: Did you intentionally update the homepage? (Yes = safe to dismiss)",
      "3. If NO: Your site may have been compromised or defaced",
      "4. Check your web server and CMS logs for unauthorized changes",
      "5. Restore from backup if compromised",
      "6. Review access logs: Are there suspicious login attempts or file modifications?",
      "7. Increase monitoring and alerting for unauthorized content changes",
    ],
  },

  PERF_REGRESSION_DOUBLED: {
    title: "Performance Regression — Response Time Doubled",
    steps: [
      "1. Check your server: CPU, memory, disk I/O all at normal levels?",
      "2. Check database: Are queries slow? Add database indexes if needed",
      "3. Check network: Is bandwidth saturated? Check CDN or ISP for issues",
      "4. Profile your code: Use DevTools Timeline to find slow JavaScript",
      "5. Check for DDoS: Use monitoring tools to detect unusual traffic spikes",
      "6. Optimize assets: Minify CSS/JS, compress images, enable caching",
      "7. Monitor going forward: Set alerts if response time exceeds baseline",
    ],
  },

  // SSL & Certificates
  SSL_CERT_EXPIRED: {
    title: "SSL Certificate Expired",
    steps: [
      "1. Your site is no longer using HTTPS—browsers show warnings to visitors",
      "2. Immediately renew your SSL certificate with your certificate provider",
      "3. For free certificates: Use Let's Encrypt (via certbot or hosting provider)",
      "4. Example (Let's Encrypt): certbot renew --force-renewal",
      "5. Deploy the new certificate to your web server",
      "6. If using a hosting platform (Vercel, Netlify, AWS): Auto-renewal is usually enabled",
      "7. Test: https://www.ssllabs.com/ssltest/ to verify the certificate is valid",
    ],
  },

  SSL_CERT_EXPIRING_HIGH: {
    title: "SSL Certificate Expiring in Less Than 14 Days",
    steps: [
      "1. Your SSL certificate is expiring soon—renew it within the next 2 weeks",
      "2. For Let's Encrypt: Renewal usually happens automatically, but check logs",
      "3. For paid certificates: Purchase renewal from your provider",
      "4. Example (manual renewal): certbot renew",
      "5. Deploy the renewed certificate to your web server",
      "6. Test: Verify the new certificate is installed with openssl or DevTools",
      "7. Re-scan after renewal to confirm the alert is cleared",
    ],
  },

  SSL_CERT_EXPIRING_CRITICAL: {
    title: "SSL Certificate Expiring in Less Than 7 Days",
    steps: [
      "1. URGENT: Your SSL certificate expires very soon",
      "2. Renew your certificate immediately to prevent your site from going offline",
      "3. For Let's Encrypt: Run certbot renew --force-renewal right now",
      "4. Contact your certificate provider if auto-renewal isn't working",
      "5. Deploy the new certificate and restart your web server",
      "6. Verify: Test with https://www.ssllabs.com/ssltest/",
      "7. Consider setting up monitoring alerts 30 days before expiry to prevent future incidents",
    ],
  },

  // User Input & Forms
  FORM_GET_API_ENDPOINT: {
    title: "Form Using GET Method for API Endpoint",
    steps: [
      "1. Find the form: <form method=\"GET\" action=\"/api/...\">",
      "2. Change to POST: <form method=\"POST\" action=\"/api/...\">",
      "3. GET requests expose data in URLs (visible in browser history, logs, and proxies)",
      "4. POST requests send data in the request body (more secure)",
      "5. Re-check: Data should NOT appear in the URL",
      "6. Add CSRF token to the form for additional protection",
      "7. Re-scan and verify the form now uses POST method",
    ],
  },

  FORM_PASSWORD_NO_CSRF: {
    title: "Password Form Without CSRF Token",
    steps: [
      "1. Find the password change form",
      "2. Add a CSRF token: <input type=\"hidden\" name=\"csrfToken\" value=\"{{ token }}\" />",
      "3. Generate token on the server when rendering the form",
      "4. Validate token on the server before processing the password change",
      "5. Without CSRF protection, attackers can trick users into changing their passwords",
      "6. Example: POST /api/change-password should verify { csrfToken, oldPassword, newPassword }",
      "7. Re-scan to verify CSRF token is present",
    ],
  },

  FORM_EXTERNAL_ACTION: {
    title: "Form Submitting to External Domain",
    steps: [
      "1. Find the form: <form action=\"https://external-domain.com/...\">",
      "2. This may be legitimate (e.g., payment gateway), but verify it's the correct domain",
      "3. Confirm the external domain is trustworthy and uses HTTPS",
      "4. Verify it's not a typo or subdomain takeover",
      "5. If sending sensitive data: Require additional verification (2FA, email confirmation)",
      "6. Example: Forms submitting to payment processors (Stripe, PayPal) are normal",
      "7. If unexpected: This could indicate a compromised form—investigate immediately",
    ],
  },

  // Misc
  BROKEN_INTERNAL_LINK: {
    title: "Broken Internal Link (404)",
    steps: [
      "1. Find the broken link in the page source",
      "2. Check if the target page still exists",
      "3. Option A: Fix the link URL",
      "4. Option B: Create a redirect: 301 /old-path → /new-path",
      "5. Option C: Remove the link if the page no longer exists",
      "6. Test: Verify the link now returns 200 OK (not 404)",
      "7. Re-scan and verify broken links are fixed",
    ],
  },

  GRAPHQL_INTROSPECTION_EXPOSED: {
    title: "GraphQL Introspection Exposed",
    steps: [
      "1. Your GraphQL API exposes its entire schema (introspection query)",
      "2. Attackers can discover all queries, mutations, and types available",
      "3. Disable introspection in production: Set introspection: false in your GraphQL config",
      "4. Example (Apollo Server): new ApolloServer({ typeDefs, resolvers, introspection: false })",
      "5. Example (GraphQL-JS): Only enable in development: introspection: process.env.NODE_ENV !== 'production'",
      "6. Consider: You may want introspection enabled for developers but disabled for public APIs",
      "7. Re-scan and verify introspection queries are blocked",
    ],
  },

  LONG_REDIRECT_CHAIN: {
    title: "Long Redirect Chain (3+ redirects)",
    steps: [
      "1. This URL redirects multiple times before reaching the final page",
      "2. Each redirect adds latency and is a trust signal issue",
      "3. Example: /link → /temp → /old → /final",
      "4. Solution: Create a direct redirect from /link → /final",
      "5. Audit all redirects: Are they intentional or legacy cruft?",
      "6. Remove unnecessary redirects",
      "7. Re-scan and verify redirect chains are ≤ 2 hops",
    ],
  },

  ROBOTS_TXT_REVEALS_PATHS: {
    title: "robots.txt Reveals Sensitive Paths",
    steps: [
      "1. Your robots.txt file lists paths you want to hide from search engines",
      "2. Attackers read robots.txt to find hidden admin panels and APIs",
      "3. Remove sensitive paths: Don't use Disallow: /admin/ in robots.txt",
      "4. Use proper authentication instead: /admin should require login (403 if not authenticated)",
      "5. If you need to hide paths, use authentication + robots.txt (defense in depth)",
      "6. Example robots.txt: Only disallow obvious things like /admin*, /api/internal*",
      "7. Re-scan and verify sensitive paths are not exposed in robots.txt",
    ],
  },

  // Default fallback
  UNKNOWN_ISSUE: {
    title: "Security Finding",
    steps: [
      "1. Contact Scantient support if you need help fixing this issue",
      "2. Provide the finding code and description",
      "3. We'll help you understand the risk and provide step-by-step remediation",
    ],
  },
};

/**
 * Get remediation guide for a finding code
 * Returns fallback guide if code not found
 */
export function getRemediationGuide(code: string): { title: string; steps: string[] } {
  return REMEDIATION_GUIDES[code] || {
    title: REMEDIATION_GUIDES.UNKNOWN_ISSUE.title,
    steps: [
      ...REMEDIATION_GUIDES.UNKNOWN_ISSUE.steps,
      `Finding Code: ${code}`,
    ],
  };
}

/**
 * Get a short one-liner explanation for a finding
 */
export function getQuickFix(code: string): string {
  const guide = getRemediationGuide(code);
  return guide.steps[0] || "Security finding detected. See remediation guide for details.";
}
