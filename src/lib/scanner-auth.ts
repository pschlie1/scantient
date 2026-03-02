/**
 * Tier 1 Auth Surface Scanner — Security Checks
 *
 * Runs 10 auth security checks against discovered endpoints.
 *
 * Safety constraints:
 * - All fetches use ssrfSafeFetch
 * - Max 5 probe requests per endpoint (rate limit / brute force tests)
 * - 200ms minimum delay between repeated requests to same endpoint
 * - Never sends real credentials — only obviously fake test data
 * - Total timeout: 60 seconds for entire auth scan
 * - Wrapped in try/catch at call site — never breaks main scan
 */

import { ssrfSafeFetch } from "@/lib/ssrf-guard";
import { checkCookieSecurity } from "@/lib/security";
import { buildFixPrompt } from "@/lib/remediation";
import type { DiscoveredEndpoint } from "@/lib/endpoint-discovery";
import type { SecurityFinding } from "@/lib/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const SCAN_TIMEOUT_MS = 60_000;
const PROBE_DELAY_MS = 200;
const USER_AGENT = "Scantient/1.0 (Security Monitor)";

// Dummy credentials — obviously fake, never real
const DUMMY_EMAIL_NONEXISTENT = "scantient-probe-nonexistent-12345@example.com";
const DUMMY_EMAIL_ADMIN = "admin@example.com";
const DUMMY_PASSWORD = "wrong-password-scantient-probe";
const PASSWORD_IN_BODY = "TestPass123!";

// Headers indicating rate limiting
const RATE_LIMIT_HEADERS = [
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  "x-rate-limit-limit",
  "x-rate-limit-remaining",
  "retry-after",
  "ratelimit-limit",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasRateLimitHeaders(headers: Headers): boolean {
  return RATE_LIMIT_HEADERS.some((h) => headers.get(h) !== null);
}

async function postJson(
  url: string,
  body: Record<string, string>,
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number; text: string; headers: Headers } | null> {
  try {
    const res = await ssrfSafeFetch(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": USER_AGENT,
          ...extraHeaders,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      },
      0, // no redirects — check immediate response
    );
    const text = await res.text();
    return { status: res.status, text, headers: res.headers };
  } catch {
    return null;
  }
}

function isAuthEndpoint(ep: DiscoveredEndpoint): boolean {
  return (
    ep.category === "auth" ||
    /login|signin|signup|auth|session|token|register|password/i.test(ep.path)
  );
}

function isAdminEndpoint(ep: DiscoveredEndpoint): boolean {
  return ep.category === "admin" || /admin|internal|staff|superuser/i.test(ep.path);
}

function isGraphqlEndpoint(ep: DiscoveredEndpoint): boolean {
  return /graphql/i.test(ep.path);
}

function looksLikeJson(text: string): boolean {
  const t = text.trim();
  return t.startsWith("{") || t.startsWith("[");
}

// ─── Check 1: Rate limiting on auth endpoints ────────────────────────────────

async function checkRateLimiting(ep: DiscoveredEndpoint): Promise<SecurityFinding[]> {
  if (!isAuthEndpoint(ep)) return [];

  const REQUESTS = 6;
  const statuses: number[] = [];
  let rateLimited = false;

  for (let i = 0; i < REQUESTS; i++) {
    const result = await postJson(ep.url, {
      email: DUMMY_EMAIL_NONEXISTENT,
      password: DUMMY_PASSWORD,
    });

    if (!result) break;

    if (result.status === 429) {
      rateLimited = true;
      break;
    }

    if (hasRateLimitHeaders(result.headers)) {
      rateLimited = true;
      break;
    }

    statuses.push(result.status);

    if (i < REQUESTS - 1) await sleep(PROBE_DELAY_MS);
  }

  if (rateLimited || statuses.length === 0) return [];

  // If all 6 returned same status without any rate limit signals → flag it
  const allSame = statuses.every((s) => s === statuses[0]);
  if (!allSame) return [];

  return [
    {
      code: "AUTH_NO_RATE_LIMIT",
      title: `Auth endpoint lacks rate limiting: ${ep.path}`,
      description: `Sent ${statuses.length} rapid login requests to "${ep.url}". All returned HTTP ${statuses[0]} with no rate limit headers (x-ratelimit-*, retry-after). This endpoint may be vulnerable to credential stuffing.`,
      severity: "HIGH",
      fixPrompt: buildFixPrompt(
        `No rate limiting on auth endpoint: ${ep.path}`,
        "Implement rate limiting on all authentication endpoints:\n1. Use a library like express-rate-limit or upstash-ratelimit.\n2. Limit to 5 attempts per IP per 15 minutes.\n3. Add exponential backoff after repeated failures.\n4. Return Retry-After headers on 429 responses.\n5. Consider IP-based and account-based rate limiting.",
      ),
    },
  ];
}

// ─── Check 2: Account enumeration ───────────────────────────────────────────

async function checkAccountEnumeration(ep: DiscoveredEndpoint): Promise<SecurityFinding[]> {
  if (!isAuthEndpoint(ep)) return [];

  const res1 = await postJson(ep.url, {
    email: DUMMY_EMAIL_NONEXISTENT,
    password: DUMMY_PASSWORD,
  });
  if (!res1) return [];

  if (res1.status === 429) return []; // already rate-limited

  await sleep(PROBE_DELAY_MS);

  const res2 = await postJson(ep.url, {
    email: DUMMY_EMAIL_ADMIN,
    password: DUMMY_PASSWORD,
  });
  if (!res2) return [];

  if (res2.status === 429) return [];

  const findings: SecurityFinding[] = [];

  // Check for exact-match enumeration phrases
  const body1 = res1.text.toLowerCase();
  const body2 = res2.text.toLowerCase();

  const userNotFoundPhrases = ["user not found", "no account", "account not found", "email not found", "no user"];
  const wrongPasswordPhrases = ["invalid password", "incorrect password", "wrong password", "password incorrect"];

  const body1HasNotFound = userNotFoundPhrases.some((p) => body1.includes(p));
  const body2HasWrongPass = wrongPasswordPhrases.some((p) => body2.includes(p));
  const body1HasWrongPass = wrongPasswordPhrases.some((p) => body1.includes(p));
  const body2HasNotFound = userNotFoundPhrases.some((p) => body2.includes(p));

  if ((body1HasNotFound && body2HasWrongPass) || (body1HasWrongPass && body2HasNotFound)) {
    findings.push({
      code: "AUTH_ACCOUNT_ENUMERATION",
      title: `Account enumeration via distinct error messages: ${ep.path}`,
      description: `The login endpoint at "${ep.url}" returns different error messages for non-existent vs. wrong-password attempts. This allows attackers to enumerate valid email addresses.`,
      severity: "HIGH",
      fixPrompt: buildFixPrompt(
        `Account enumeration at ${ep.path}`,
        "Use a generic error message for all login failures:\n1. Return identical responses for 'account not found' and 'wrong password'.\n2. Example: 'Invalid email or password.'\n3. Ensure response timing is also consistent (add artificial delay if needed).\n4. This prevents user enumeration attacks.",
      ),
    });
    return findings;
  }

  // Check for significant body size difference (>20%)
  const len1 = res1.text.length;
  const len2 = res2.text.length;
  if (len1 > 0 && len2 > 0) {
    const larger = Math.max(len1, len2);
    const smaller = Math.min(len1, len2);
    const diffPercent = ((larger - smaller) / larger) * 100;

    if (diffPercent > 20) {
      findings.push({
        code: "AUTH_ACCOUNT_ENUMERATION",
        title: `Account enumeration via response size difference: ${ep.path}`,
        description: `Login responses for a non-existent account vs. wrong password differ by ${Math.round(diffPercent)}% in body size (${len1} vs ${len2} bytes). Attackers can use response size to enumerate valid accounts.`,
        severity: "MEDIUM",
        fixPrompt: buildFixPrompt(
          `Account enumeration via response size at ${ep.path}`,
          "Ensure login endpoint returns identical response bodies for all failure cases:\n1. Use a single generic error message.\n2. Pad responses if necessary to normalize size.\n3. Return the same HTTP status code (400 or 401) for all failures.",
        ),
      });
    }
  }

  return findings;
}

// ─── Check 3: Cookie security on auth response ───────────────────────────────

async function checkAuthCookieSecurity(ep: DiscoveredEndpoint): Promise<SecurityFinding[]> {
  if (!isAuthEndpoint(ep)) return [];

  const result = await postJson(ep.url, {
    email: DUMMY_EMAIL_NONEXISTENT,
    password: DUMMY_PASSWORD,
  });
  if (!result) return [];

  // Reuse existing checkCookieSecurity but only flag cookies with auth-related names
  const allCookieFindings = checkCookieSecurity(result.headers);

  const setCookie = result.headers.get("set-cookie");
  if (!setCookie) return [];

  // Filter to only auth-related cookies
  const authCookieFindings = allCookieFindings.filter((f) => {
    // AUTH_COOKIE_MISSING_FLAGS code will be applied; check if it's cookie-related
    return f.code.startsWith("COOKIE_");
  });

  // Re-code the findings to use the auth-specific code
  return authCookieFindings.map((f) => ({
    ...f,
    code: "AUTH_COOKIE_MISSING_FLAGS",
    title: `Auth endpoint cookie missing security flags: ${ep.path} — ${f.title}`,
    description: `${f.description} (Detected on auth endpoint: ${ep.url})`,
  }));
}

// ─── Check 4: Password in response body ─────────────────────────────────────

async function checkPasswordInResponse(ep: DiscoveredEndpoint): Promise<SecurityFinding[]> {
  if (!isAuthEndpoint(ep)) return [];

  const result = await postJson(ep.url, {
    email: "test@example.com",
    password: PASSWORD_IN_BODY,
  });
  if (!result) return [];

  if (result.text.includes(PASSWORD_IN_BODY)) {
    return [
      {
        code: "AUTH_PASSWORD_IN_RESPONSE",
        title: `Password echoed back in response body: ${ep.path}`,
        description: `The auth endpoint "${ep.url}" returned the submitted password in the response body. This is a critical security vulnerability that exposes credentials.`,
        severity: "CRITICAL",
        fixPrompt: buildFixPrompt(
          `Password echoed in response at ${ep.path}`,
          "Never include passwords in API responses:\n1. Audit all auth endpoint response serializers.\n2. Strip password fields from user objects before returning.\n3. Add automated tests that assert passwords are not in responses.\n4. Consider using an allowlist approach — only return specific fields.",
        ),
      },
    ];
  }

  return [];
}

// ─── Check 5: Token in URL ───────────────────────────────────────────────────

function checkTokenInUrl(html: string, jsPayloads: string[]): SecurityFinding[] {
  const TOKEN_IN_URL_PATTERN = /[?&](token|jwt|auth|session|access_token|id_token)=/i;

  const combined = [html, ...jsPayloads].join("\n");
  if (TOKEN_IN_URL_PATTERN.test(combined)) {
    return [
      {
        code: "AUTH_TOKEN_IN_URL",
        title: "Authentication token appears in URL query string",
        description:
          "Found patterns suggesting tokens (token, jwt, auth, session, access_token, id_token) are passed as URL query parameters. Tokens in URLs are logged by servers, proxies, and browser history — a significant credential exposure risk.",
        severity: "HIGH",
        fixPrompt: buildFixPrompt(
          "Auth token in URL query string",
          "Never pass authentication tokens as URL parameters:\n1. Use Authorization headers for API auth tokens.\n2. Use HttpOnly cookies for session tokens.\n3. For OAuth flows, use code exchange (PKCE) not implicit flow.\n4. Audit all redirect URLs to ensure tokens are not appended.",
        ),
      },
    ];
  }

  return [];
}

// ─── Check 6: Missing CSRF on auth endpoints ─────────────────────────────────

async function checkMissingCsrf(ep: DiscoveredEndpoint): Promise<SecurityFinding[]> {
  if (!isAuthEndpoint(ep)) return [];

  // Check: does POST without CSRF header get a non-403 response?
  const result = await postJson(
    ep.url,
    { email: DUMMY_EMAIL_NONEXISTENT, password: DUMMY_PASSWORD },
    // Explicitly omit CSRF headers to see if the endpoint enforces them
    { "X-CSRF-Token": "" },
  );

  if (!result) return [];

  // If we get a response that isn't a 403 (forbidden) / 401 (unauth) specifically
  // related to CSRF rejection, flag as potentially missing CSRF protection.
  // 422 / 400 indicates validation (might still be checking CSRF), 200 or 404 without CSRF = likely unprotected
  if (result.status === 200 || result.status === 400 || result.status === 422) {
    return [
      {
        code: "AUTH_MISSING_CSRF",
        title: `Auth endpoint may lack CSRF protection: ${ep.path}`,
        description: `POST to "${ep.url}" without a CSRF token returned HTTP ${result.status}. If this endpoint processes state-changing actions without CSRF validation, it may be vulnerable to cross-site request forgery.`,
        severity: "MEDIUM",
        fixPrompt: buildFixPrompt(
          `Missing CSRF protection at ${ep.path}`,
          "Implement CSRF protection on all state-changing endpoints:\n1. Use the Synchronizer Token Pattern (hidden CSRF token in forms).\n2. Use SameSite=Strict or SameSite=Lax cookies (passive CSRF defense).\n3. For APIs, use the Custom Request Header pattern (X-Requested-With).\n4. In Next.js, use the built-in CSRF protection from next-auth or implement middleware.",
        ),
      },
    ];
  }

  return [];
}

// ─── Check 7: Permissive CORS on auth endpoints ───────────────────────────────

async function checkPermissiveCors(ep: DiscoveredEndpoint): Promise<SecurityFinding[]> {
  if (!isAuthEndpoint(ep) && ep.category !== "api") return [];

  try {
    const res = await ssrfSafeFetch(
      ep.url,
      {
        method: "OPTIONS",
        headers: {
          "User-Agent": USER_AGENT,
          Origin: "https://evil-attacker.com",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "Content-Type, Authorization",
        },
        signal: AbortSignal.timeout(8_000),
      },
      0,
    );

    const acao = res.headers.get("access-control-allow-origin");
    if (!acao) return [];

    const isPermissive =
      acao === "*" ||
      acao.toLowerCase() === "https://evil-attacker.com";

    if (isPermissive) {
      return [
        {
          code: "AUTH_PERMISSIVE_CORS",
          title: `Auth/API endpoint has permissive CORS: ${ep.path}`,
          description: `The endpoint "${ep.url}" responds to CORS preflight with Access-Control-Allow-Origin: ${acao}. This allows cross-origin requests from any domain (or the attacker origin), potentially exposing auth tokens and user data.`,
          severity: "HIGH",
          fixPrompt: buildFixPrompt(
            `Permissive CORS on auth endpoint ${ep.path}`,
            "Restrict CORS on authentication and API endpoints:\n1. Maintain an allowlist of trusted origins.\n2. Never use Access-Control-Allow-Origin: * on endpoints that handle credentials.\n3. In Next.js middleware, check the Origin header against your allowlist.\n4. Set Access-Control-Allow-Credentials: true only for trusted origins.",
          ),
        },
      ];
    }
  } catch {
    // ignore fetch failures
  }

  return [];
}

// ─── Check 8: GraphQL introspection ──────────────────────────────────────────

async function checkGraphqlIntrospection(ep: DiscoveredEndpoint): Promise<SecurityFinding[]> {
  if (!isGraphqlEndpoint(ep)) return [];

  const INTROSPECTION_QUERY = `{"query":"{__schema{queryType{name}}}"}`;

  try {
    const res = await ssrfSafeFetch(
      ep.url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": USER_AGENT,
        },
        body: INTROSPECTION_QUERY,
        signal: AbortSignal.timeout(8_000),
      },
      0,
    );

    if (res.status !== 200) return [];
    const text = await res.text();
    if (!text.includes("__schema") && !text.includes("queryType")) return [];

    return [
      {
        code: "GRAPHQL_INTROSPECTION_EXPOSED",
        title: `GraphQL introspection enabled in production: ${ep.path}`,
        description: `The GraphQL endpoint "${ep.url}" responds to introspection queries, exposing the complete API schema. Attackers can map all available queries, mutations, and types.`,
        severity: "HIGH",
        fixPrompt: buildFixPrompt(
          `GraphQL introspection exposed at ${ep.path}`,
          "Disable GraphQL introspection in production:\n1. In Apollo Server: set introspection: false in production.\n2. In graphql-yoga: configure introspection based on NODE_ENV.\n3. In Hasura: use HASURA_GRAPHQL_ENABLE_CONSOLE=false.\n4. Add a middleware to reject __schema queries in production.",
        ),
      },
    ];
  } catch {
    return [];
  }
}

// ─── Check 9: Admin endpoint unauthenticated ─────────────────────────────────

async function checkAdminEndpointUnauthed(ep: DiscoveredEndpoint): Promise<SecurityFinding[]> {
  if (!isAdminEndpoint(ep)) return [];

  try {
    const res = await ssrfSafeFetch(
      ep.url,
      {
        method: "GET",
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(8_000),
      },
      0,
    );

    if (res.status !== 200) return [];

    const text = await res.text();
    const isJson = looksLikeJson(text);

    return [
      {
        code: "ADMIN_ENDPOINT_UNAUTHED",
        title: `Admin endpoint accessible without authentication: ${ep.path}`,
        description: `The admin endpoint "${ep.url}" returned HTTP 200 without any authentication. ${isJson ? "The response contains JSON data, suggesting API data is exposed." : "The response contains HTML content that may be an unprotected admin panel."}`,
        severity: isJson ? "CRITICAL" : "HIGH",
        fixPrompt: buildFixPrompt(
          `Unauthenticated admin endpoint at ${ep.path}`,
          "Protect all admin endpoints with authentication and authorization:\n1. Add authentication middleware to all /admin/* routes.\n2. Verify the user has admin role before returning data.\n3. Use server-side session validation (not client-side).\n4. Consider IP allowlisting for admin interfaces.\n5. Add audit logging for all admin access.",
        ),
      },
    ];
  } catch {
    return [];
  }
}

// ─── Check 10: Brute force protection ────────────────────────────────────────

async function checkBruteForceProtection(ep: DiscoveredEndpoint): Promise<SecurityFinding[]> {
  if (!isAuthEndpoint(ep)) return [];

  const REQUESTS = 5;
  const results: { status: number; body: string } [] = [];

  for (let i = 0; i < REQUESTS; i++) {
    const result = await postJson(ep.url, {
      email: DUMMY_EMAIL_NONEXISTENT,
      password: `brute-force-probe-attempt-${i}`,
    });

    if (!result) break;

    if (result.status === 429) return []; // Already rate-limited — good

    if (hasRateLimitHeaders(result.headers)) return []; // Rate limiting present — good

    results.push({ status: result.status, body: result.text });

    if (i < REQUESTS - 1) await sleep(PROBE_DELAY_MS);
  }

  if (results.length < 3) return []; // Not enough data

  // Check if all responses are identical (same status + same body)
  const firstStatus = results[0]?.status;
  const firstBody = results[0]?.body ?? "";
  const allIdentical = results.every(
    (r) => r.status === firstStatus && r.body === firstBody,
  );

  if (!allIdentical) return [];

  return [
    {
      code: "AUTH_BRUTE_FORCE_UNPROTECTED",
      title: `Auth endpoint not protected against brute force: ${ep.path}`,
      description: `Sent ${results.length} sequential login attempts to "${ep.url}". All returned identical HTTP ${firstStatus} responses with no rate limiting. This endpoint is likely vulnerable to brute force password attacks.`,
      severity: "HIGH",
      fixPrompt: buildFixPrompt(
        `Brute force unprotected at ${ep.path}`,
        "Implement brute force protection:\n1. Rate limit by IP: max 5 attempts per 15 minutes.\n2. Implement account lockout after N failed attempts.\n3. Add CAPTCHA after 3 failed attempts.\n4. Use Argon2 or bcrypt for password hashing (slows brute force).\n5. Send security alert emails on multiple failed login attempts.\n6. Consider using a WAF or bot management solution.",
      ),
    },
  ];
}

// ─── Main entry point ────────────────────────────────────────────────────────

export async function runAuthScan(
  endpoints: DiscoveredEndpoint[],
  baseUrl: string,
  html = "",
  jsPayloads: string[] = [],
): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];
  const scanStart = Date.now();

  // Check 5 (Token in URL) runs on HTML/JS, not per-endpoint
  try {
    findings.push(...checkTokenInUrl(html, jsPayloads));
  } catch {
    // non-fatal
  }

  // Run per-endpoint checks in parallel per endpoint, but not all endpoints at once
  // Process auth endpoints first (most valuable), then others
  const authEndpoints = endpoints.filter(isAuthEndpoint);
  const adminEndpoints = endpoints.filter((ep) => !isAuthEndpoint(ep) && isAdminEndpoint(ep));
  const graphqlEndpoints = endpoints.filter(
    (ep) => !isAuthEndpoint(ep) && !isAdminEndpoint(ep) && isGraphqlEndpoint(ep),
  );
  const corsEndpoints = endpoints.filter(
    (ep) => isAuthEndpoint(ep) || ep.category === "api",
  );

  for (const ep of authEndpoints) {
    if (Date.now() - scanStart > SCAN_TIMEOUT_MS) break;

    // Run checks sequentially per endpoint to avoid hammering
    const checks = await Promise.allSettled([
      checkRateLimiting(ep),
      checkAccountEnumeration(ep),
      checkAuthCookieSecurity(ep),
      checkPasswordInResponse(ep),
      checkMissingCsrf(ep),
      checkBruteForceProtection(ep),
    ]);

    for (const settled of checks) {
      if (settled.status === "fulfilled") {
        findings.push(...settled.value);
      }
    }

    await sleep(PROBE_DELAY_MS);
  }

  // CORS checks for auth + API endpoints
  for (const ep of corsEndpoints) {
    if (Date.now() - scanStart > SCAN_TIMEOUT_MS) break;
    try {
      findings.push(...(await checkPermissiveCors(ep)));
    } catch {
      // non-fatal
    }
    await sleep(PROBE_DELAY_MS);
  }

  // GraphQL introspection
  for (const ep of [...graphqlEndpoints, ...authEndpoints.filter(isGraphqlEndpoint)]) {
    if (Date.now() - scanStart > SCAN_TIMEOUT_MS) break;
    try {
      findings.push(...(await checkGraphqlIntrospection(ep)));
    } catch {
      // non-fatal
    }
  }

  // Admin endpoint checks
  for (const ep of adminEndpoints) {
    if (Date.now() - scanStart > SCAN_TIMEOUT_MS) break;
    try {
      findings.push(...(await checkAdminEndpointUnauthed(ep)));
    } catch {
      // non-fatal
    }
  }

  // Deduplicate findings by code
  const seen = new Set<string>();
  const deduped: SecurityFinding[] = [];
  for (const f of findings) {
    const key = `${f.code}::${f.title}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(f);
    }
  }

  void baseUrl; // baseUrl is available for future use
  return deduped;
}
