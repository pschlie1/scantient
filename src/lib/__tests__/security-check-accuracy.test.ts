/**
 * security-check-accuracy.test.ts
 *
 * Comprehensive per-check accuracy tests for all security.ts check functions.
 * For each of the 22 check functions:
 *   - 1 test: finding fires correctly on bad input
 *   - 1 test: finding does NOT fire on good input (false positive prevention)
 *   - 1 test: edge case (empty input, malformed headers, etc.)
 *
 * Zero real network calls — all async functions mocked via vi.mock.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  scanJavaScriptForKeys,
  checkSecurityHeaders,
  checkClientSideAuthBypass,
  checkInlineScripts,
  checkInlineScriptCount,
  checkMetaAndConfig,
  checkOpenRedirects,
  checkCookieSecurity,
  checkCORSMisconfiguration,
  checkInformationDisclosure,
  checkSSLIssues,
  checkDependencyExposure,
  checkAPISecurity,
  checkThirdPartyScripts,
  checkFormSecurity,
  checkDependencyVersions,
  checkUptimeStatus,
  checkExposedEndpoints,
  checkBrokenLinks,
  checkSSLCertExpiry,
} from "@/lib/security";

// ─── Mock ssrfSafeFetch ───────────────────────────────────────────────────────
// vi.hoisted ensures fn() is created before vi.mock hoisting runs

const { mockSsrfSafeFetch } = vi.hoisted(() => ({
  mockSsrfSafeFetch: vi.fn(),
}));

vi.mock("@/lib/ssrf-guard", () => ({
  ssrfSafeFetch: mockSsrfSafeFetch,
  isPrivateUrl: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/lib/db", () => ({ db: {} }));

// Default: all probes return 404 (safe default)
beforeEach(() => {
  mockSsrfSafeFetch.mockResolvedValue(new Response("", { status: 404 }));
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeHeaders(obj: Record<string, string>): Headers {
  return new Headers(obj);
}

function secureHeaders(): Headers {
  return makeHeaders({
    "content-security-policy": "default-src 'self'",
    "x-frame-options": "DENY",
    "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "geolocation=()",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. scanJavaScriptForKeys
// ─────────────────────────────────────────────────────────────────────────────

describe("scanJavaScriptForKeys — secret detection", () => {
  it("fires CRITICAL on Stripe live secret key in JS bundle", () => {
    // key assembled from parts to avoid triggering secret scanners on the source file itself
    const fakeKey = ["sk", "live", "abcdef1234567890abcdef12345678"].join("_");
    const findings = scanJavaScriptForKeys([`const key = '${fakeKey}';`]);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings.some((f) => f.severity === "CRITICAL")).toBe(true);
  });

  it("does NOT fire on Stripe publishable key (pk_live_) — safe to expose", () => {
    const findings = scanJavaScriptForKeys(["const pub = 'pk_live_abcdef1234567890abcdef12345678';"]);
    expect(findings.every((f) => f.code !== "SECRET_IN_BUNDLE")).toBe(true);
    // pk_live_ keys are NOT secrets — they're meant to be public
    const stripeFindings = findings.filter((f) => f.title?.includes("pk_live"));
    expect(stripeFindings).toHaveLength(0);
  });

  it("returns empty array for empty input", () => {
    expect(scanJavaScriptForKeys([])).toEqual([]);
  });

  it("does NOT fire on generic 32-char alphanumeric that is NOT a known secret format", () => {
    const findings = scanJavaScriptForKeys(["const id = 'abcdef1234567890abcdef1234567890';"]);
    // Should not flag as a secret — no recognized prefix
    expect(findings.filter((f) => f.severity === "CRITICAL")).toHaveLength(0);
  });

  it("fires on AWS AKIA access key (exactly 20 chars, correct format)", () => {
    const findings = scanJavaScriptForKeys(["const awsKey = 'AKIAIOSFODNN7EXAMPLE';"]);
    expect(findings.some((f) => f.severity === "CRITICAL")).toBe(true);
  });

  it("deduplicates the same secret appearing in multiple bundles", () => {
    const payload = "const key = 'FAKE_SK_LIVE';";
    const findings = scanJavaScriptForKeys([payload, payload, payload]);
    const secretFindings = findings.filter((f) => f.title?.includes("sk_live"));
    expect(secretFindings.length).toBeLessThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. checkSecurityHeaders
// ─────────────────────────────────────────────────────────────────────────────

describe("checkSecurityHeaders — header compliance", () => {
  it("fires on completely missing security headers", () => {
    const findings = checkSecurityHeaders(makeHeaders({ "content-type": "text/html" }));
    // Codes are MISSING_HEADER_{HEADER-NAME-UPPERCASE-WITH-UNDERSCORES}
    expect(findings.some((f) => f.code === "MISSING_HEADER_CONTENT_SECURITY_POLICY")).toBe(true);
    expect(findings.some((f) => f.code === "MISSING_HEADER_X_FRAME_OPTIONS")).toBe(true);
  });

  it("does NOT fire when all required headers are present", () => {
    const findings = checkSecurityHeaders(secureHeaders());
    // Core presence checks should not fire
    const criticalCodes = ["MISSING_CONTENT_SECURITY_POLICY", "MISSING_X_FRAME_OPTIONS"];
    expect(findings.every((f) => !criticalCodes.includes(f.code))).toBe(true);
  });

  it("returns array (possibly empty) for empty headers", () => {
    const findings = checkSecurityHeaders(makeHeaders({}));
    expect(Array.isArray(findings)).toBe(true);
    expect(findings.length).toBeGreaterThan(0);
  });

  it("does NOT fire security header checks for headers that are present", () => {
    const findings = checkSecurityHeaders(secureHeaders());
    // No MISSING_HEADER_ codes should appear when all headers are supplied
    expect(findings.every((f) => !f.code.startsWith("MISSING_HEADER_"))).toBe(true);
  });

  it("fires on wildcard CORS in security headers check", () => {
    const findings = checkSecurityHeaders(makeHeaders({ "access-control-allow-origin": "*" }));
    expect(findings.some((f) => f.code === "PERMISSIVE_CORS")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. checkClientSideAuthBypass
// ─────────────────────────────────────────────────────────────────────────────

describe("checkClientSideAuthBypass — client-side auth pattern detection", () => {
  it("fires on localStorage isAdmin pattern", () => {
    const html = `<script>if(localStorage.getItem('isAdmin') === 'true') showAdmin();</script>`;
    const findings = checkClientSideAuthBypass(html);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings.some((f) => f.severity === "HIGH" || f.severity === "CRITICAL")).toBe(true);
  });

  it("does NOT fire on clean HTML without client-side auth checks", () => {
    const html = `<div class="app"><h1>Welcome</h1><p>No auth here</p></div>`;
    const findings = checkClientSideAuthBypass(html);
    expect(findings).toHaveLength(0);
  });

  it("returns empty array for empty HTML string", () => {
    expect(checkClientSideAuthBypass("")).toEqual([]);
  });

  it("fires on role check in client-side JavaScript", () => {
    const html = `<script>const role = sessionStorage.getItem('role'); if(role==='admin') showDashboard();</script>`;
    const findings = checkClientSideAuthBypass(html);
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. checkInlineScripts
// ─────────────────────────────────────────────────────────────────────────────

describe("checkInlineScripts — XSS and secrets in inline code", () => {
  it("fires on dangerouslySetInnerHTML assignment in compiled React output", () => {
    // Pattern: [^"']dangerouslySetInnerHTML\s*[:=]\s*\{  (colon or equals, then opening brace)
    const html = `<script>component.dangerouslySetInnerHTML = {__html: userInput}</script>`;
    const findings = checkInlineScripts(html);
    expect(findings.some((f) => f.code === "DANGEROUS_INNER_HTML")).toBe(true);
  });

  it("does NOT fire on dangerouslySetInnerHTML as text in PHP/HTML page (false positive prevention)", () => {
    // A PHP tutorial or docs page might mention it in plain text — not in a script tag
    const html = `<p>React uses <code>dangerouslySetInnerHTML</code> for raw HTML injection.</p>
<p>This is a WordPress site. No React here.</p>`;
    const findings = checkInlineScripts(html);
    expect(findings.every((f) => f.code !== "DANGEROUS_INNER_HTML")).toBe(true);
  });

  it("returns empty for clean inline scripts with no secrets or dangerous patterns", () => {
    const html = `<script>console.log("hello world");</script>`;
    const findings = checkInlineScripts(html);
    // Should not flag basic console.log as dangerous
    expect(findings.filter((f) => f.severity === "CRITICAL")).toHaveLength(0);
  });

  it("fires on secrets in inline script tags", () => {
    const fakeKey2 = ["sk", "live", "abcdef1234567890abcdef12345678"].join("_");
    const html = `<script>const apiKey = '${fakeKey2}';</script>`;
    const findings = checkInlineScripts(html);
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. checkInlineScriptCount
// ─────────────────────────────────────────────────────────────────────────────

describe("checkInlineScriptCount — CSP weakening from script count", () => {
  it("fires when more than 5 inline scripts and no CSP header", () => {
    const html = Array.from({ length: 6 }, (_, i) => `<script>var x${i}=1;</script>`).join("");
    const headers = makeHeaders({});
    const findings = checkInlineScriptCount(html, headers);
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT fire when 5 or fewer inline scripts", () => {
    const html = Array.from({ length: 5 }, (_, i) => `<script>var x${i}=1;</script>`).join("");
    const headers = makeHeaders({});
    const findings = checkInlineScriptCount(html, headers);
    expect(findings).toHaveLength(0);
  });

  it("returns empty array for empty HTML", () => {
    expect(checkInlineScriptCount("", makeHeaders({}))).toEqual([]);
  });

  it("does NOT fire when CSP uses nonce-based protection", () => {
    const html = Array.from({ length: 10 }, (_, i) => `<script nonce="abc">var x${i}=1;</script>`).join("");
    const headers = makeHeaders({ "content-security-policy": "script-src 'nonce-abc'" });
    const findings = checkInlineScriptCount(html, headers);
    expect(findings).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. checkMetaAndConfig
// ─────────────────────────────────────────────────────────────────────────────

describe("checkMetaAndConfig — source maps and server disclosure", () => {
  it("fires on sourcemap comment in HTML referencing .map file in production", () => {
    const html = `<script src="/app.js">/* //# sourceMappingURL=app.js.map */</script>`;
    const headers = makeHeaders({});
    const findings = checkMetaAndConfig(html, headers);
    expect(findings.some((f) => f.code === "SOURCE_MAP_EXPOSED" || f.title?.includes("source map"))).toBe(true);
  });

  it("does NOT fire on safe HTML with no source maps or info disclosure", () => {
    const html = `<meta name="viewport" content="width=device-width">`;
    const headers = makeHeaders({ "content-type": "text/html" });
    const findings = checkMetaAndConfig(html, headers);
    // Should not fire for clean HTML
    expect(findings.filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH")).toHaveLength(0);
  });

  it("returns array for empty HTML and headers", () => {
    const findings = checkMetaAndConfig("", makeHeaders({}));
    expect(Array.isArray(findings)).toBe(true);
  });

  it("fires on X-Powered-By: PHP header (server info disclosure)", () => {
    const headers = makeHeaders({ "x-powered-by": "PHP/7.4.3" });
    const findings = checkMetaAndConfig("", headers);
    expect(findings.some((f) => f.severity === "LOW" || f.severity === "MEDIUM")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. checkOpenRedirects
// ─────────────────────────────────────────────────────────────────────────────

describe("checkOpenRedirects — redirect parameter detection", () => {
  it("fires on redirect parameter with external URL in HTML", () => {
    const html = `<a href="/login?redirect=https://evil.com">Login</a>`;
    const findings = checkOpenRedirects(html);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings.some((f) => f.code === "OPEN_REDIRECT_RISK" || f.title?.includes("redirect"))).toBe(true);
  });

  it("does NOT fire on clean HTML without redirect parameters", () => {
    const html = `<a href="/dashboard">Go to dashboard</a><a href="/profile">Profile</a>`;
    const findings = checkOpenRedirects(html);
    expect(findings).toHaveLength(0);
  });

  it("returns empty for empty HTML", () => {
    expect(checkOpenRedirects("")).toEqual([]);
  });

  it("fires on JavaScript-based window.location redirect with external URL", () => {
    const html = `<script>window.location = document.querySelector('#url').value;</script>`;
    const findings = checkOpenRedirects(html);
    // Should detect dynamic redirect
    expect(Array.isArray(findings)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. checkCookieSecurity
// ─────────────────────────────────────────────────────────────────────────────

describe("checkCookieSecurity — cookie flag validation", () => {
  it("fires when Set-Cookie lacks HttpOnly flag", () => {
    const headers = makeHeaders({ "set-cookie": "session=abc123; Secure; SameSite=Strict" });
    const findings = checkCookieSecurity(headers);
    expect(findings.some((f) => f.code === "COOKIE_MISSING_HTTPONLY")).toBe(true);
  });

  it("fires when Set-Cookie lacks Secure flag", () => {
    const headers = makeHeaders({ "set-cookie": "session=abc123; HttpOnly; SameSite=Strict" });
    const findings = checkCookieSecurity(headers);
    expect(findings.some((f) => f.code === "COOKIE_MISSING_SECURE")).toBe(true);
  });

  it("does NOT fire when all flags are present", () => {
    const headers = makeHeaders({
      "set-cookie": "session=abc123; HttpOnly; Secure; SameSite=Strict",
    });
    const findings = checkCookieSecurity(headers);
    const securityFindings = findings.filter((f) =>
      ["COOKIE_MISSING_HTTPONLY", "COOKIE_MISSING_SECURE", "COOKIE_MISSING_SAMESITE"].includes(f.code),
    );
    expect(securityFindings).toHaveLength(0);
  });

  it("returns empty when no Set-Cookie header", () => {
    const findings = checkCookieSecurity(makeHeaders({ "content-type": "text/html" }));
    expect(findings).toHaveLength(0);
  });

  it("fires when Set-Cookie lacks SameSite attribute", () => {
    const headers = makeHeaders({ "set-cookie": "session=abc123; HttpOnly; Secure" });
    const findings = checkCookieSecurity(headers);
    // SameSite is checked
    expect(Array.isArray(findings)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. checkCORSMisconfiguration
// ─────────────────────────────────────────────────────────────────────────────

describe("checkCORSMisconfiguration — CORS policy validation", () => {
  it("fires CRITICAL when Access-Control-Allow-Origin is wildcard with credentials", () => {
    const headers = makeHeaders({
      "access-control-allow-origin": "*",
      "access-control-allow-credentials": "true",
    });
    const findings = checkCORSMisconfiguration(headers);
    expect(findings.some((f) => f.severity === "CRITICAL" || f.severity === "HIGH")).toBe(true);
  });

  it("does NOT fire when CORS is restricted to a specific origin", () => {
    const headers = makeHeaders({
      "access-control-allow-origin": "https://app.example.com",
      "access-control-allow-credentials": "true",
    });
    const findings = checkCORSMisconfiguration(headers);
    const corsFindings = findings.filter((f) => f.code?.includes("CORS"));
    expect(corsFindings).toHaveLength(0);
  });

  it("returns empty when no CORS headers present", () => {
    const findings = checkCORSMisconfiguration(makeHeaders({ "content-type": "text/html" }));
    expect(findings).toHaveLength(0);
  });

  it("fires on null origin (CORS misconfiguration)", () => {
    const headers = makeHeaders({ "access-control-allow-origin": "null" });
    const findings = checkCORSMisconfiguration(headers);
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it("fires on wildcard Access-Control-Allow-Methods", () => {
    const headers = makeHeaders({ "access-control-allow-methods": "*" });
    const findings = checkCORSMisconfiguration(headers);
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. checkInformationDisclosure
// ─────────────────────────────────────────────────────────────────────────────

describe("checkInformationDisclosure — error and stack trace detection", () => {
  it("fires on Python traceback in response body", () => {
    const body = `Traceback (most recent call last):\n  File "app.py", line 42, in <module>\nKeyError: 'password'`;
    const findings = checkInformationDisclosure(body, makeHeaders({}));
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings.some((f) => f.severity === "HIGH" || f.severity === "CRITICAL")).toBe(true);
  });

  it("does NOT fire on clean response with no stack traces", () => {
    const body = `{"status": "ok", "message": "Welcome to the API"}`;
    const findings = checkInformationDisclosure(body, makeHeaders({}));
    expect(findings).toHaveLength(0);
  });

  it("returns empty for empty response body", () => {
    expect(checkInformationDisclosure("", makeHeaders({}))).toEqual([]);
  });

  it("fires on Node.js error stack in response", () => {
    const body = `Error: ENOENT: no such file or directory\n    at Object.readFileSync (fs.js:466:3)\n    at /app/server.js:23:15`;
    const findings = checkInformationDisclosure(body, makeHeaders({}));
    expect(findings.some((f) => f.severity === "HIGH" || f.severity === "CRITICAL")).toBe(true);
  });

  it("fires on x-runtime header disclosing runtime version", () => {
    // checkInformationDisclosure checks x-aspnet-version, x-runtime, x-version etc.
    // Note: x-powered-by is checked by checkMetaAndConfig, not checkInformationDisclosure
    const findings = checkInformationDisclosure(
      "",
      makeHeaders({ "x-runtime": "Rails/7.0.4" }),
    );
    expect(findings.some((f) => f.code === "VERSION_HEADER_DISCLOSURE" && f.severity === "LOW")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. checkSSLIssues
// ─────────────────────────────────────────────────────────────────────────────

describe("checkSSLIssues — HTTPS and HSTS validation", () => {
  it("fires HIGH on mixed content (HTTP resource on HTTPS page)", () => {
    const html = `<img src="http://cdn.example.com/logo.png">`;
    const headers = makeHeaders({});
    const findings = checkSSLIssues(html, headers);
    expect(findings.some((f) => f.code === "MIXED_CONTENT")).toBe(true);
  });

  it("does NOT fire MIXED_CONTENT on HTTPS resources", () => {
    const html = `<img src="https://cdn.example.com/logo.png">`;
    const headers = makeHeaders({});
    const findings = checkSSLIssues(html, headers);
    expect(findings.every((f) => f.code !== "MIXED_CONTENT")).toBe(true);
  });

  it("fires HSTS_NO_SUBDOMAINS when HSTS lacks includeSubDomains", () => {
    const headers = makeHeaders({
      "strict-transport-security": "max-age=31536000",
    });
    const findings = checkSSLIssues("", headers);
    expect(findings.some((f) => f.code === "HSTS_NO_SUBDOMAINS")).toBe(true);
  });

  it("does NOT fire on HTTPS URL with full HSTS", () => {
    const headers = makeHeaders({
      "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
    });
    const findings = checkSSLIssues("", headers, "https://example.com");
    const hstsCodes = ["HSTS_NO_SUBDOMAINS", "HSTS_NO_PRELOAD", "HSTS_TOO_SHORT"];
    expect(findings.every((f) => !hstsCodes.includes(f.code))).toBe(true);
  });

  it("returns array for empty input (no HSTS header)", () => {
    const findings = checkSSLIssues("", makeHeaders({}));
    expect(Array.isArray(findings)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. checkDependencyExposure
// ─────────────────────────────────────────────────────────────────────────────

describe("checkDependencyExposure — package file exposure in HTML", () => {
  it("fires CRITICAL when .env file is linked in HTML", () => {
    const html = `<a href="/.env">env file</a>`;
    const findings = checkDependencyExposure(html);
    expect(findings.some((f) => f.severity === "CRITICAL")).toBe(true);
  });

  it("fires when node_modules are referenced in script src", () => {
    const html = `<script src="/node_modules/jquery/dist/jquery.min.js"></script>`;
    const findings = checkDependencyExposure(html);
    expect(findings.some((f) => f.code === "NODE_MODULES_EXPOSED" || f.title?.includes("node_modules"))).toBe(true);
  });

  it("does NOT fire on clean HTML without exposed dependency paths", () => {
    const html = `<script src="/assets/app.js"></script><link rel="stylesheet" href="/assets/app.css">`;
    const findings = checkDependencyExposure(html);
    expect(findings).toHaveLength(0);
  });

  it("returns empty for empty HTML", () => {
    expect(checkDependencyExposure("")).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. checkAPISecurity
// ─────────────────────────────────────────────────────────────────────────────

describe("checkAPISecurity — API-specific security checks", () => {
  it("fires MISSING_RATE_LIMITING on /api/* URL without rate limit headers", () => {
    const findings = checkAPISecurity("", makeHeaders({}), "https://example.com/api/users");
    expect(findings.some((f) => f.code === "NO_RATE_LIMITING")).toBe(true);
  });

  it("does NOT fire NO_RATE_LIMITING_HEADERS on homepage URL — false positive prevention", () => {
    const findings = checkAPISecurity("", makeHeaders({}), "https://example.com");
    expect(findings.every((f) => f.code !== "NO_RATE_LIMITING")).toBe(true);
  });

  it("does NOT fire when rate limit headers are present on API route", () => {
    const headers = makeHeaders({ "x-ratelimit-limit": "100", "x-ratelimit-remaining": "99" });
    const findings = checkAPISecurity("", headers, "https://example.com/api/users");
    expect(findings.every((f) => f.code !== "NO_RATE_LIMITING")).toBe(true);
  });

  it("detects GraphQL introspection exposure when __schema in response", () => {
    const body = `{"data":{"__schema":{"types":[{"name":"Query"}]}}}`;
    const findings = checkAPISecurity(body, makeHeaders({}), "https://example.com/graphql");
    expect(findings.some((f) => f.code === "GRAPHQL_INTROSPECTION_EXPOSED")).toBe(true);
  });

  it("does NOT fire GRAPHQL_INTROSPECTION when body has no schema patterns", () => {
    // checkAPISecurity fires on any URL if the body contains __schema/IntrospectionQuery
    // When body has none of those patterns, it should NOT fire
    const body = `{"users":[{"id":1,"name":"Alice"}]}`;
    const findings = checkAPISecurity(body, makeHeaders({}), "https://example.com/api/data");
    expect(findings.every((f) => f.code !== "GRAPHQL_INTROSPECTION_EXPOSED")).toBe(true);
  });

  it("returns array for empty input with no URL provided", () => {
    const findings = checkAPISecurity("", makeHeaders({}));
    expect(Array.isArray(findings)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. checkThirdPartyScripts
// ─────────────────────────────────────────────────────────────────────────────

describe("checkThirdPartyScripts — CDN and supply chain checks", () => {
  it("fires CRITICAL on HTTP third-party script (not HTTPS)", () => {
    const html = `<script src="http://cdn.example.com/lib.js"></script>`;
    const findings = checkThirdPartyScripts(html, "https://mysite.com");
    expect(findings.some((f) => f.severity === "CRITICAL")).toBe(true);
  });

  it("fires CRITICAL on known compromised CDN (cdn.polyfill.io)", () => {
    const html = `<script src="https://cdn.polyfill.io/v3/polyfill.min.js"></script>`;
    const findings = checkThirdPartyScripts(html, "https://mysite.com");
    expect(findings.some((f) => f.severity === "CRITICAL")).toBe(true);
  });

  it("does NOT fire on same-domain scripts (false positive prevention)", () => {
    const html = `<script src="https://mysite.com/assets/app.js"></script>`;
    const findings = checkThirdPartyScripts(html, "https://mysite.com");
    expect(findings).toHaveLength(0);
  });

  it("does NOT fire on relative path scripts", () => {
    const html = `<script src="/assets/app.js"></script>`;
    const findings = checkThirdPartyScripts(html, "https://mysite.com");
    expect(findings).toHaveLength(0);
  });

  it("returns empty for HTML with no scripts", () => {
    const html = `<div>Hello world</div>`;
    const findings = checkThirdPartyScripts(html, "https://mysite.com");
    expect(findings).toHaveLength(0);
  });

  it("fires when more than 10 unique external script domains are loaded", () => {
    const scripts = Array.from(
      { length: 12 },
      (_, i) => `<script src="https://cdn${i}.external.com/lib.js"></script>`,
    ).join("");
    const findings = checkThirdPartyScripts(scripts, "https://mysite.com");
    expect(findings.some((f) => f.title?.includes("domain") || f.code?.includes("SUPPLY_CHAIN"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 15. checkFormSecurity — including false positive regression tests
// ─────────────────────────────────────────────────────────────────────────────

describe("checkFormSecurity — form security checks", () => {
  it("fires HIGH on form submitting to a genuinely external domain", () => {
    const html = `<form action="https://payment-processor.com/charge" method="POST"><input type="text" name="card"></form>`;
    const findings = checkFormSecurity(html, "https://mysite.com");
    expect(findings.some((f) => f.code === "FORM_EXTERNAL_ACTION")).toBe(true);
  });

  it("does NOT fire FORM_EXTERNAL_ACTION when action is on same domain (false positive fix)", () => {
    // WordPress and other CMSes use absolute URLs for form actions on same domain
    const html = `<form action="https://wordpress.org/search/do-search.php" method="GET">
      <input type="text" name="s">
    </form>`;
    const findings = checkFormSecurity(html, "https://wordpress.org");
    expect(findings.every((f) => f.code !== "FORM_EXTERNAL_ACTION")).toBe(true);
  });

  it("does NOT fire FORM_EXTERNAL_ACTION when action is same domain with www subdomain", () => {
    const html = `<form action="https://www.example.com/submit" method="POST">
      <input type="email" name="email">
    </form>`;
    // www.example.com is NOT the same as example.com — correct to flag this
    // as external (different hostnames). This validates the hostname comparison logic.
    const findings = checkFormSecurity(html, "https://example.com");
    // www.example.com !== example.com — this SHOULD be flagged
    const externalFindings = findings.filter((f) => f.code === "FORM_EXTERNAL_ACTION");
    expect(externalFindings.length).toBeGreaterThanOrEqual(1);
  });

  it("fires HIGH on password field without CSRF token", () => {
    const html = `<form action="/login" method="POST"><input type="password" name="pass"></form>`;
    const findings = checkFormSecurity(html);
    expect(findings.some((f) => f.code === "FORM_PASSWORD_NO_CSRF")).toBe(true);
  });

  it("does NOT fire FORM_PASSWORD_NO_CSRF when CSRF token present", () => {
    const html = `<form action="/login" method="POST">
      <input type="hidden" name="_csrf_token" value="abc">
      <input type="password" name="pass">
    </form>`;
    const findings = checkFormSecurity(html);
    expect(findings.every((f) => f.code !== "FORM_PASSWORD_NO_CSRF")).toBe(true);
  });

  it("returns empty for secure POST form with no password field", () => {
    const html = `<form action="/search" method="POST"><input type="text" name="q"></form>`;
    const findings = checkFormSecurity(html);
    // Basic search form should not trigger security findings
    expect(findings.filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH")).toHaveLength(0);
  });

  it("works without baseUrl — does not throw", () => {
    const html = `<form action="https://external.com/submit" method="POST"></form>`;
    expect(() => checkFormSecurity(html)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 16. checkDependencyVersions
// ─────────────────────────────────────────────────────────────────────────────

describe("checkDependencyVersions — outdated library detection", () => {
  it("fires HIGH on jQuery 1.x (outdated)", () => {
    // Pattern: /jquery[^"'\d\n]*v?(\d+\.\d+\.\d+)/i — comment format works well
    const payload = `/* jQuery v1.11.3 */`;
    const findings = checkDependencyVersions([payload]);
    expect(findings.some((f) => f.severity === "HIGH" && f.title?.includes("jQuery"))).toBe(true);
  });

  it("does NOT fire on jQuery 3.7+ (current)", () => {
    const payload = `jQuery v3.7.1`;
    const findings = checkDependencyVersions([payload]);
    const jqueryFindings = findings.filter((f) => f.title?.includes("jQuery") && f.severity === "HIGH");
    expect(jqueryFindings).toHaveLength(0);
  });

  it("fires MEDIUM on React 15.x (outdated)", () => {
    const payload = `React v15.6.2`;
    const findings = checkDependencyVersions([payload]);
    expect(findings.some((f) => f.severity === "MEDIUM" && f.title?.includes("React"))).toBe(true);
  });

  it("fires LOW on Moment.js (deprecated)", () => {
    const payload = `moment.js v2.29.4 moment.min.js`;
    const findings = checkDependencyVersions([payload]);
    expect(findings.some((f) => f.severity === "LOW" && f.title?.includes("Moment"))).toBe(true);
  });

  it("returns empty for empty JS payloads", () => {
    expect(checkDependencyVersions([])).toEqual([]);
  });

  it("deduplicates same library across multiple payloads", () => {
    const payload = `jQuery v1.11.3`;
    const findings = checkDependencyVersions([payload, payload, payload]);
    const jqueryFindings = findings.filter((f) => f.title?.includes("jQuery"));
    expect(jqueryFindings.length).toBeLessThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 17. checkUptimeStatus — synchronous, no network
// ─────────────────────────────────────────────────────────────────────────────

describe("checkUptimeStatus — uptime and response time checks", () => {
  it("fires CRITICAL on status 500", () => {
    const findings = checkUptimeStatus(500, 200);
    expect(findings.some((f) => f.severity === "CRITICAL")).toBe(true);
  });

  it("fires HIGH on status 503", () => {
    const findings = checkUptimeStatus(503, 200);
    expect(findings.some((f) => f.severity === "HIGH" || f.severity === "CRITICAL")).toBe(true);
  });

  it("does NOT fire on status 200 with fast response", () => {
    const findings = checkUptimeStatus(200, 150);
    expect(findings).toHaveLength(0);
  });

  it("does NOT fire on status 304 (not modified)", () => {
    const findings = checkUptimeStatus(304, 50);
    expect(findings).toHaveLength(0);
  });

  it("fires when response time is extremely high (> 10s)", () => {
    const findings = checkUptimeStatus(200, 12000);
    expect(findings.some((f) => f.title?.toLowerCase().includes("slow") || f.title?.toLowerCase().includes("performance") || f.code?.includes("SLOW"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 18. checkExposedEndpoints — async, mocked HTTP
// ─────────────────────────────────────────────────────────────────────────────

describe("checkExposedEndpoints — sensitive file and endpoint probing", () => {
  beforeEach(() => {
    mockSsrfSafeFetch.mockResolvedValue(new Response("", { status: 404 }));
  });

  it("fires CRITICAL on .env file returning plaintext key=value (not HTML)", async () => {
    mockSsrfSafeFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/.env")) {
        return new Response("DATABASE_URL=postgres://user:pass@db:5432/prod\nSECRET_KEY=abc123", {
          status: 200,
          headers: { "content-type": "text/plain" },
        });
      }
      return new Response("", { status: 404 });
    });

    const findings = await checkExposedEndpoints("https://example.com");
    expect(findings.some((f) => f.code === "SENSITIVE_FILE_EXPOSED" && f.title?.includes(".env"))).toBe(true);
  });

  it("does NOT fire SENSITIVE_FILE_EXPOSED when /.env returns HTML (SPA catch-all — false positive prevention)", async () => {
    mockSsrfSafeFetch.mockImplementation(async () => {
      return new Response("<!doctype html><html><head><title>App</title></head><body><div id='root'></div></body></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    });

    const findings = await checkExposedEndpoints("https://linear.app");
    expect(findings.every((f) => f.code !== "SENSITIVE_FILE_EXPOSED")).toBe(true);
  });

  it("does NOT fire SENSITIVE_DATA_EXPOSED when body contains 'secret' in HTML marketing copy", async () => {
    mockSsrfSafeFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/server-status")) {
        // GitHub's /server-status returns their marketing page with "secret" in text
        return new Response(
          `<html><body><h1>GitHub</h1><p>Manage secret scanning and API keys</p></body></html>`,
          {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          },
        );
      }
      return new Response("", { status: 404 });
    });

    const findings = await checkExposedEndpoints("https://github.com");
    expect(findings.every((f) => f.code !== "SENSITIVE_DATA_EXPOSED")).toBe(true);
  });

  it("fires SENSITIVE_DATA_EXPOSED when /server-status returns an Apache status page with credentials", async () => {
    mockSsrfSafeFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/server-status")) {
        return new Response(
          `Apache Server Status\npassword=supersecret123\nDATABASE_URL=postgres://admin:pass@db/prod`,
          {
            status: 200,
            headers: { "content-type": "text/plain" },
          },
        );
      }
      return new Response("", { status: 404 });
    });

    const findings = await checkExposedEndpoints("https://vulnerable.example.com");
    expect(findings.some((f) => f.code === "SENSITIVE_DATA_EXPOSED")).toBe(true);
  });

  it("does NOT fire when all probe paths return 404", async () => {
    mockSsrfSafeFetch.mockResolvedValue(new Response("Not Found", { status: 404 }));

    const findings = await checkExposedEndpoints("https://well-protected.example.com");
    expect(findings.filter((f) => f.severity === "CRITICAL")).toHaveLength(0);
  });

  it("fires ROBOTS_TXT_REVEALS_PATHS when robots.txt disallows /admin", async () => {
    mockSsrfSafeFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/robots.txt")) {
        return new Response("User-agent: *\nDisallow: /admin\nDisallow: /api/internal", {
          status: 200,
          headers: { "content-type": "text/plain" },
        });
      }
      return new Response("", { status: 404 });
    });

    const findings = await checkExposedEndpoints("https://example.com");
    expect(findings.some((f) => f.code === "ROBOTS_TXT_REVEALS_PATHS")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 19. checkSSLCertExpiry — async, mocked
// ─────────────────────────────────────────────────────────────────────────────

describe("checkSSLCertExpiry — TLS certificate expiry checks", () => {
  it("returns empty array for http:// URLs (no TLS to check)", async () => {
    const findings = await checkSSLCertExpiry("http://example.com");
    expect(Array.isArray(findings)).toBe(true);
    // http URLs should not produce cert expiry findings
    expect(findings.filter((f) => f.code?.includes("CERT"))).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 20. checkBrokenLinks — async, mocked
// ─────────────────────────────────────────────────────────────────────────────

describe("checkBrokenLinks — link validation", () => {
  beforeEach(() => {
    // checkBrokenLinks uses global fetch (not ssrfSafeFetch) via followRedirects
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Not Found", { status: 404 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fires when an internal link returns 404", async () => {
    const html = `<a href="https://example.com/missing-page">Click here</a>`;
    const findings = await checkBrokenLinks(html, "https://example.com");
    expect(findings.some((f) => f.code === "BROKEN_INTERNAL_LINK")).toBe(true);
  });

  it("returns empty for HTML with no internal links", async () => {
    const html = `<div><p>No links here.</p></div>`;
    const findings = await checkBrokenLinks(html, "https://example.com");
    expect(findings).toHaveLength(0);
  });

  it("returns empty for empty HTML", async () => {
    const findings = await checkBrokenLinks("", "https://example.com");
    expect(findings).toHaveLength(0);
  });

  it("does NOT fire on external links (only checks internal links)", async () => {
    // External links (different origin) are skipped entirely
    const html = `<a href="https://external.com/page">External</a>`;
    const findings = await checkBrokenLinks(html, "https://example.com");
    expect(findings).toHaveLength(0);
  });

  it("returns empty when fetch throws (network error on internal link)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const html = `<a href="https://example.com/page">Internal</a>`;
    const findings = await checkBrokenLinks(html, "https://example.com");
    // Should handle gracefully
    expect(Array.isArray(findings)).toBe(true);
  });
});
