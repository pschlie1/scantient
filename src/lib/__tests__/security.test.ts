import { describe, expect, it } from "vitest";
import {
  checkClientSideAuthBypass,
  checkInlineScripts,
  checkMetaAndConfig,
  checkSecurityHeaders,
  scanJavaScriptForKeys,
  checkOpenRedirects,
  checkCookieSecurity,
  checkCORSMisconfiguration,
  checkInformationDisclosure,
  checkSSLIssues,
  checkDependencyExposure,
  checkAPISecurity,
} from "@/lib/security";

describe("checkSecurityHeaders", () => {
  it("detects all missing required headers", () => {
    const headers = new Headers({ "content-type": "text/html" });
    const findings = checkSecurityHeaders(headers);
    expect(findings.length).toBeGreaterThanOrEqual(3);
    expect(findings.some((f) => f.code.includes("CONTENT_SECURITY_POLICY"))).toBe(true);
    expect(findings.some((f) => f.code.includes("X_FRAME_OPTIONS"))).toBe(true);
    expect(findings.some((f) => f.code.includes("STRICT_TRANSPORT_SECURITY"))).toBe(true);
  });

  it("returns no findings when all headers present", () => {
    const headers = new Headers({
      "content-security-policy": "default-src 'self'",
      "x-frame-options": "DENY",
      "strict-transport-security": "max-age=31536000",
      "x-content-type-options": "nosniff",
      "permissions-policy": "camera=()",
      "referrer-policy": "strict-origin-when-cross-origin",
    });
    const findings = checkSecurityHeaders(headers);
    expect(findings.length).toBe(0);
  });

  it("detects overly permissive CORS", () => {
    const headers = new Headers({
      "content-security-policy": "default-src 'self'",
      "x-frame-options": "DENY",
      "strict-transport-security": "max-age=31536000",
      "x-content-type-options": "nosniff",
      "permissions-policy": "camera=()",
      "referrer-policy": "no-referrer",
      "access-control-allow-origin": "*",
    });
    const findings = checkSecurityHeaders(headers);
    expect(findings.some((f) => f.code === "PERMISSIVE_CORS")).toBe(true);
  });
});

describe("scanJavaScriptForKeys", () => {
  it("detects OpenAI secret key", () => {
    const findings = scanJavaScriptForKeys(["const key='sk-abcdefghijklmnopqrstuvwxyz123456';"]);
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe("CRITICAL");
  });

  it("detects GitHub PAT", () => {
    const findings = scanJavaScriptForKeys(["const gh='ghp_abcdefghijklmnopqrstuvwxyz0123456789';"]);
    expect(findings.length).toBe(1);
  });

  it("detects Stripe live secret key", () => {
    // Use clearly fake test token that matches pattern
    const fakeToken = "sk_live_" + "x".repeat(24);
    const findings = scanJavaScriptForKeys([`const s='${fakeToken}';`]);
    expect(findings.length).toBe(1);
  });

  it("does not flag safe public keys", () => {
    const findings = scanJavaScriptForKeys(["const pk='pk_test_abcdefghijklmnopqrstuvwxyz123456';"]);
    expect(findings.length).toBe(0);
  });

  it("deduplicates same key across assets", () => {
    const payload = "const key='sk-abcdefghijklmnopqrstuvwxyz123456';";
    const findings = scanJavaScriptForKeys([payload, payload]);
    expect(findings.length).toBe(1);
  });

  // ── audit-14: New key pattern coverage ──────────────────────────────────

  it("detects AWS AKIA access key ID (exactly 20-char AKIA prefix + 16 uppercase alphanums)", () => {
    // AKIA + 16 uppercase letters/digits = valid AWS access key ID format
    const fakeAkiaKey = "AKIA" + "A1B2C3D4E5F6G7H8"; // 4 + 16 = 20 chars
    const findings = scanJavaScriptForKeys([`const awsKey='${fakeAkiaKey}';`]);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings.some((f) => f.code === "EXPOSED_API_KEY")).toBe(true);
  });

  it("detects Stripe sk_test_ secret key (should not be in client bundle)", () => {
    const fakeToken = "sk_test_" + "a".repeat(24); // sk_test_ + 24 chars
    const findings = scanJavaScriptForKeys([`const stripe='${fakeToken}';`]);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings.some((f) => f.code === "EXPOSED_API_KEY")).toBe(true);
  });

  it("detects GitHub fine-grained PAT (github_pat_ prefix)", () => {
    // github_pat_ + 22+ alphanumeric/underscore chars
    const fakePat = "github_pat_" + "abcdefghijklmnopqrstuvwx";
    const findings = scanJavaScriptForKeys([`const token='${fakePat}';`]);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings.some((f) => f.code === "EXPOSED_API_KEY")).toBe(true);
  });

  // ── audit-14: False positive tests ──────────────────────────────────────

  it("does NOT flag Stripe publishable key pk_test_ (safe to expose)", () => {
    const findings = scanJavaScriptForKeys([`const pk='pk_test_${"x".repeat(24)}';`]);
    expect(findings.length).toBe(0);
  });

  it("does NOT flag Stripe publishable key pk_live_ (safe to expose)", () => {
    const findings = scanJavaScriptForKeys([`const pk='pk_live_${"x".repeat(24)}';`]);
    expect(findings.length).toBe(0);
  });

  it("does NOT flag a random all-caps string as an AWS AKIA key", () => {
    // Must match AKIA + exactly 16 uppercase alphanumeric chars — a shorter or
    // lowercase match should NOT trigger
    const findings = scanJavaScriptForKeys([`const x='AKIA_SHORT';`]);
    expect(findings.length).toBe(0);
  });

  it("does NOT flag a short sk_ string that is under the minimum length", () => {
    // sk-xxx (too short — minimum is sk- + 20 chars)
    const findings = scanJavaScriptForKeys([`const x='sk-abc123';`]);
    expect(findings.length).toBe(0);
  });
});

describe("checkClientSideAuthBypass", () => {
  it("detects localStorage isAdmin pattern", () => {
    const html = `<script>if(localStorage.getItem('isAdmin')==='true'){showAdmin()}</script>`;
    const findings = checkClientSideAuthBypass(html);
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it("detects role check in client code", () => {
    const html = `<script>if(user.role === 'admin') { show(); }</script>`;
    const findings = checkClientSideAuthBypass(html);
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty for clean HTML", () => {
    const html = `<html><body>Hello</body></html>`;
    const findings = checkClientSideAuthBypass(html);
    expect(findings.length).toBe(0);
  });
});

describe("checkInlineScripts", () => {
  it("detects secrets in inline script tags", () => {
    const html = `<script>const key = 'sk-abcdefghijklmnopqrstuvwxyz123456';</script>`;
    const findings = checkInlineScripts(html);
    expect(findings.some((f) => f.code === "EXPOSED_API_KEY")).toBe(true);
  });

  it("detects dangerouslySetInnerHTML", () => {
    const html = `<div dangerouslySetInnerHTML={{__html: content}}></div>`;
    const findings = checkInlineScripts(html);
    expect(findings.some((f) => f.code === "DANGEROUS_INNER_HTML")).toBe(true);
  });

  it("does NOT flag dangerouslySetInnerHTML appearing as plain text in page content (false positive prevention)", () => {
    // Simulates __NEXT_DATA__ or marketing copy that mentions the term as a string.
    // Should NOT fire — bare mentions without an assignment context are safe.
    const html = `<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"desc":"Scans for dangerouslySetInnerHTML usage in LLM-generated code"}}}</script>`;
    const findings = checkInlineScripts(html);
    expect(findings.some((f) => f.code === "DANGEROUS_INNER_HTML")).toBe(false);
  });

  it("detects dangerouslySetInnerHTML in compiled inline script (object property assignment)", () => {
    // Simulates compiled React code in an inline chunk with actual usage.
    const html = `<script>var r=React.createElement("div",{dangerouslySetInnerHTML:{__html:e}})</script>`;
    const findings = checkInlineScripts(html);
    expect(findings.some((f) => f.code === "DANGEROUS_INNER_HTML")).toBe(true);
  });
});

describe("checkMetaAndConfig", () => {
  it("detects source maps in production", () => {
    const html = `<script src="app.js"></script>//# sourceMappingURL=app.js.map`;
    const findings = checkMetaAndConfig(html, new Headers());
    expect(findings.some((f) => f.code === "SOURCE_MAP_EXPOSED")).toBe(true);
  });

  it("detects server info disclosure", () => {
    const headers = new Headers({ server: "Apache/2.4", "x-powered-by": "Express" });
    const findings = checkMetaAndConfig("<html></html>", headers);
    expect(findings.some((f) => f.code === "SERVER_INFO_DISCLOSURE")).toBe(true);
  });
});

// ────────────────────────────────────────────
// 6. Open Redirect Detection
// ────────────────────────────────────────────

describe("checkOpenRedirects", () => {
  it("detects redirect parameter with external URL", () => {
    const html = `<a href="/login?redirect=https://evil.com/phish">Login</a>`;
    const findings = checkOpenRedirects(html);
    expect(findings.some((f) => f.code === "OPEN_REDIRECT")).toBe(true);
  });

  it("detects URL-encoded redirect parameter", () => {
    const html = `<a href="/auth?url=https%3A%2F%2Fevil.com">Go</a>`;
    const findings = checkOpenRedirects(html);
    expect(findings.some((f) => f.code === "OPEN_REDIRECT")).toBe(true);
  });

  it("detects JS-based open redirect", () => {
    const html = `<script>window.location = searchParams</script>`;
    const findings = checkOpenRedirects(html);
    expect(findings.some((f) => f.code === "OPEN_REDIRECT_JS")).toBe(true);
  });

  it("returns empty for safe HTML", () => {
    const html = `<a href="/dashboard">Go</a>`;
    const findings = checkOpenRedirects(html);
    expect(findings.length).toBe(0);
  });
});

// ────────────────────────────────────────────
// 7. Cookie Security
// ────────────────────────────────────────────

describe("checkCookieSecurity", () => {
  it("detects missing Secure, HttpOnly, SameSite flags", () => {
    const headers = new Headers();
    headers.set("set-cookie", "session=abc123; Path=/");
    const findings = checkCookieSecurity(headers);
    expect(findings.some((f) => f.code === "COOKIE_MISSING_SECURE")).toBe(true);
    expect(findings.some((f) => f.code === "COOKIE_MISSING_HTTPONLY")).toBe(true);
    expect(findings.some((f) => f.code === "COOKIE_MISSING_SAMESITE")).toBe(true);
  });

  it("returns no findings for secure cookie", () => {
    const headers = new Headers();
    headers.set("set-cookie", "session=abc123; Path=/; Secure; HttpOnly; SameSite=Strict");
    const findings = checkCookieSecurity(headers);
    expect(findings.length).toBe(0);
  });

  it("returns empty when no set-cookie header", () => {
    const findings = checkCookieSecurity(new Headers());
    expect(findings.length).toBe(0);
  });
});

// ────────────────────────────────────────────
// 8. CORS Misconfiguration
// ────────────────────────────────────────────

describe("checkCORSMisconfiguration", () => {
  it("detects wildcard origin with credentials", () => {
    const headers = new Headers({
      "access-control-allow-origin": "*",
      "access-control-allow-credentials": "true",
    });
    const findings = checkCORSMisconfiguration(headers);
    expect(findings.some((f) => f.code === "CORS_WILDCARD_CREDENTIALS")).toBe(true);
    expect(findings[0].severity).toBe("CRITICAL");
  });

  it("detects null origin", () => {
    const headers = new Headers({ "access-control-allow-origin": "null" });
    const findings = checkCORSMisconfiguration(headers);
    expect(findings.some((f) => f.code === "CORS_NULL_ORIGIN")).toBe(true);
  });

  it("detects wildcard methods", () => {
    const headers = new Headers({ "access-control-allow-methods": "*" });
    const findings = checkCORSMisconfiguration(headers);
    expect(findings.some((f) => f.code === "CORS_WILDCARD_METHODS")).toBe(true);
  });

  it("detects wildcard headers", () => {
    const headers = new Headers({ "access-control-allow-headers": "*" });
    const findings = checkCORSMisconfiguration(headers);
    expect(findings.some((f) => f.code === "CORS_WILDCARD_HEADERS")).toBe(true);
  });

  it("returns empty for restrictive CORS", () => {
    const headers = new Headers({
      "access-control-allow-origin": "https://myapp.com",
      "access-control-allow-methods": "GET, POST",
    });
    const findings = checkCORSMisconfiguration(headers);
    expect(findings.length).toBe(0);
  });
});

// ────────────────────────────────────────────
// 9. Information Disclosure
// ────────────────────────────────────────────

describe("checkInformationDisclosure", () => {
  it("detects stack traces in response", () => {
    const html = `<pre>Error: something failed\n    at Module._compile (/app/server.js:42:15)</pre>`;
    const findings = checkInformationDisclosure(html, new Headers());
    expect(findings.some((f) => f.code === "STACK_TRACE_EXPOSED")).toBe(true);
  });

  it("detects Python tracebacks", () => {
    const html = `<pre>Traceback (most recent call last):\n  File "app.py", line 10</pre>`;
    const findings = checkInformationDisclosure(html, new Headers());
    expect(findings.some((f) => f.code === "STACK_TRACE_EXPOSED")).toBe(true);
  });

  it("detects debug page references", () => {
    const html = `<a href="/__debug">Debug</a>`;
    const findings = checkInformationDisclosure(html, new Headers());
    expect(findings.some((f) => f.code === "DEBUG_PAGE_EXPOSED")).toBe(true);
  });

  it("detects version headers", () => {
    const headers = new Headers({ "x-aspnet-version": "4.0.30319" });
    const findings = checkInformationDisclosure("<html></html>", headers);
    expect(findings.some((f) => f.code === "VERSION_HEADER_DISCLOSURE")).toBe(true);
  });

  it("returns empty for clean response", () => {
    const findings = checkInformationDisclosure("<html><body>Hello</body></html>", new Headers());
    expect(findings.length).toBe(0);
  });
});

// ────────────────────────────────────────────
// 10. SSL/TLS Issues
// ────────────────────────────────────────────

describe("checkSSLIssues", () => {
  it("detects mixed content", () => {
    const html = `<img src="http://cdn.example.com/image.png">`;
    const findings = checkSSLIssues(html, new Headers());
    expect(findings.some((f) => f.code === "MIXED_CONTENT")).toBe(true);
  });

  it("ignores localhost mixed content", () => {
    const html = `<img src="http://localhost:3000/image.png">`;
    const findings = checkSSLIssues(html, new Headers());
    expect(findings.some((f) => f.code === "MIXED_CONTENT")).toBe(false);
  });

  it("detects HSTS without includeSubDomains", () => {
    const headers = new Headers({ "strict-transport-security": "max-age=31536000" });
    const findings = checkSSLIssues("<html></html>", headers);
    expect(findings.some((f) => f.code === "HSTS_NO_SUBDOMAINS")).toBe(true);
  });

  it("detects HSTS without preload", () => {
    const headers = new Headers({ "strict-transport-security": "max-age=31536000; includeSubDomains" });
    const findings = checkSSLIssues("<html></html>", headers);
    expect(findings.some((f) => f.code === "HSTS_NO_PRELOAD")).toBe(true);
  });

  it("detects non-HTTPS URL", () => {
    const findings = checkSSLIssues("<html></html>", new Headers(), "http://example.com");
    expect(findings.some((f) => f.code === "NO_HTTPS")).toBe(true);
  });

  it("does not flag localhost HTTP", () => {
    const findings = checkSSLIssues("<html></html>", new Headers(), "http://localhost:3000");
    expect(findings.some((f) => f.code === "NO_HTTPS")).toBe(false);
  });

  it("returns empty for full HSTS", () => {
    const headers = new Headers({ "strict-transport-security": "max-age=31536000; includeSubDomains; preload" });
    const findings = checkSSLIssues("<html></html>", headers);
    expect(findings.length).toBe(0);
  });
});

// ────────────────────────────────────────────
// 11. Dependency Exposure
// ────────────────────────────────────────────

describe("checkDependencyExposure", () => {
  it("detects linked package.json", () => {
    const html = `<a href="package.json">Download</a>`;
    const findings = checkDependencyExposure(html);
    expect(findings.some((f) => f.code === "DEPENDENCY_FILE_EXPOSED")).toBe(true);
  });

  it("detects .env file exposure as CRITICAL", () => {
    const html = `<a href=".env">Config</a>`;
    const findings = checkDependencyExposure(html);
    expect(findings.some((f) => f.code === "DEPENDENCY_FILE_EXPOSED" && f.severity === "CRITICAL")).toBe(true);
  });

  it("detects node_modules references", () => {
    const html = `<script src="node_modules/lodash/lodash.js"></script>`;
    const findings = checkDependencyExposure(html);
    expect(findings.some((f) => f.code === "NODE_MODULES_EXPOSED")).toBe(true);
  });

  it("returns empty for clean HTML", () => {
    const findings = checkDependencyExposure("<html><body>Hello</body></html>");
    expect(findings.length).toBe(0);
  });
});

// ────────────────────────────────────────────
// 12. API Security
// ────────────────────────────────────────────

describe("checkAPISecurity", () => {
  it("detects missing rate limiting headers on /api/ routes", () => {
    const findings = checkAPISecurity("<html></html>", new Headers(), "https://example.com/api/users");
    expect(findings.some((f) => f.code === "NO_RATE_LIMITING")).toBe(true);
  });

  it("skips rate limit check for non-API URLs (no false positives on homepage)", () => {
    const findings = checkAPISecurity("<html></html>", new Headers(), "https://example.com/");
    expect(findings.some((f) => f.code === "NO_RATE_LIMITING")).toBe(false);
  });

  it("skips rate limit check when no URL provided", () => {
    const findings = checkAPISecurity("<html></html>", new Headers());
    expect(findings.some((f) => f.code === "NO_RATE_LIMITING")).toBe(false);
  });

  it("no rate limit finding when header present on API route", () => {
    const headers = new Headers({ "x-ratelimit-limit": "100" });
    const findings = checkAPISecurity("<html></html>", headers, "https://example.com/api/users");
    expect(findings.some((f) => f.code === "NO_RATE_LIMITING")).toBe(false);
  });

  it("detects GraphQL introspection", () => {
    const html = `<script>{"data":{"__schema":{"types":[]}}}</script>`;
    const findings = checkAPISecurity(html, new Headers());
    expect(findings.some((f) => f.code === "GRAPHQL_INTROSPECTION_EXPOSED")).toBe(true);
  });

  it("detects exposed Swagger UI", () => {
    const html = `<div id="swagger-ui"></div>`;
    const findings = checkAPISecurity(html, new Headers());
    expect(findings.some((f) => f.code === "API_DOCS_EXPOSED")).toBe(true);
  });

  it("returns minimal findings for secure setup", () => {
    const headers = new Headers({ "x-ratelimit-limit": "100" });
    const findings = checkAPISecurity("<html><body>App</body></html>", headers);
    expect(findings.length).toBe(0);
  });
});

// ────────────────────────────────────────────
// 15. Third-party script risk scoring
// ────────────────────────────────────────────

import {
  checkThirdPartyScripts,
  checkFormSecurity,
  checkDependencyVersions,
  checkPerformanceRegression,
} from "@/lib/security";

describe("checkThirdPartyScripts", () => {
  it("detects HTTP third-party script as CRITICAL", () => {
    const html = `<script src="http://cdn.example.com/lib.js"></script>`;
    const findings = checkThirdPartyScripts(html, "https://myapp.com");
    expect(findings.some((f) => f.code === "THIRD_PARTY_SCRIPT_HTTP")).toBe(true);
    expect(findings.find((f) => f.code === "THIRD_PARTY_SCRIPT_HTTP")?.severity).toBe("CRITICAL");
  });

  it("detects known compromised CDN as CRITICAL", () => {
    const html = `<script src="https://polyfill.io/v3/polyfill.min.js"></script>`;
    const findings = checkThirdPartyScripts(html, "https://myapp.com");
    expect(findings.some((f) => f.code === "THIRD_PARTY_SCRIPT_COMPROMISED_CDN")).toBe(true);
    expect(findings.find((f) => f.code === "THIRD_PARTY_SCRIPT_COMPROMISED_CDN")?.severity).toBe("CRITICAL");
  });

  it("detects cdn.polyfill.io as compromised CDN", () => {
    const html = `<script src="https://cdn.polyfill.io/v3/polyfill.min.js"></script>`;
    const findings = checkThirdPartyScripts(html, "https://myapp.com");
    expect(findings.some((f) => f.code === "THIRD_PARTY_SCRIPT_COMPROMISED_CDN")).toBe(true);
  });

  it("detects data: URI script as HIGH", () => {
    const html = `<script src="data:text/javascript,alert(1)"></script>`;
    const findings = checkThirdPartyScripts(html, "https://myapp.com");
    expect(findings.some((f) => f.code === "THIRD_PARTY_SCRIPT_DATA_URI")).toBe(true);
    expect(findings.find((f) => f.code === "THIRD_PARTY_SCRIPT_DATA_URI")?.severity).toBe("HIGH");
  });

  it("does not flag same-domain scripts", () => {
    const html = `<script src="https://myapp.com/bundle.js"></script>`;
    const findings = checkThirdPartyScripts(html, "https://myapp.com");
    expect(findings.length).toBe(0);
  });

  it("does not flag relative path scripts", () => {
    const html = `<script src="/static/bundle.js"></script>`;
    const findings = checkThirdPartyScripts(html, "https://myapp.com");
    expect(findings.length).toBe(0);
  });

  it("flags high domain count when more than 10 external domains", () => {
    const domains = Array.from({ length: 11 }, (_, i) => `cdn${i}.example.com`);
    const scripts = domains.map((d) => `<script src="https://${d}/lib.js"></script>`).join("\n");
    const findings = checkThirdPartyScripts(scripts, "https://myapp.com");
    expect(findings.some((f) => f.code === "THIRD_PARTY_SCRIPT_HIGH_COUNT")).toBe(true);
    expect(findings.find((f) => f.code === "THIRD_PARTY_SCRIPT_HIGH_COUNT")?.severity).toBe("MEDIUM");
  });
});

// ────────────────────────────────────────────
// 16. Form security analysis
// ────────────────────────────────────────────

describe("checkFormSecurity", () => {
  it("detects GET method on API endpoint form as MEDIUM", () => {
    const html = `<form method="GET" action="/api/search"><input type="text" name="q"></form>`;
    const findings = checkFormSecurity(html);
    expect(findings.some((f) => f.code === "FORM_GET_API_ENDPOINT")).toBe(true);
    expect(findings.find((f) => f.code === "FORM_GET_API_ENDPOINT")?.severity).toBe("MEDIUM");
  });

  it("detects password field without CSRF token as HIGH", () => {
    const html = `<form method="POST" action="/login"><input type="password" name="pass"></form>`;
    const findings = checkFormSecurity(html);
    expect(findings.some((f) => f.code === "FORM_PASSWORD_NO_CSRF")).toBe(true);
    expect(findings.find((f) => f.code === "FORM_PASSWORD_NO_CSRF")?.severity).toBe("HIGH");
  });

  it("does not flag password field when CSRF token present", () => {
    const html = `<form method="POST" action="/login"><input type="hidden" name="csrf" value="tok"><input type="password" name="pass"></form>`;
    const findings = checkFormSecurity(html);
    expect(findings.some((f) => f.code === "FORM_PASSWORD_NO_CSRF")).toBe(false);
  });

  it("detects form submitting to external domain as HIGH", () => {
    const html = `<form method="POST" action="https://evil.com/collect"><input type="text"></form>`;
    const findings = checkFormSecurity(html);
    expect(findings.some((f) => f.code === "FORM_EXTERNAL_ACTION")).toBe(true);
    expect(findings.find((f) => f.code === "FORM_EXTERNAL_ACTION")?.severity).toBe("HIGH");
  });

  it("returns empty for secure form", () => {
    const html = `<form method="POST" action="/submit"><input type="text" name="data"><input type="hidden" name="_token" value="abc"></form>`;
    const findings = checkFormSecurity(html);
    expect(findings.length).toBe(0);
  });

  it("returns empty for form with no password and POST method", () => {
    const html = `<form method="POST" action="/search"><input type="text" name="q"></form>`;
    const findings = checkFormSecurity(html);
    expect(findings.length).toBe(0);
  });
});

// ────────────────────────────────────────────
// 20. Dependency version risk
// ────────────────────────────────────────────

describe("checkDependencyVersions", () => {
  it("detects outdated jQuery 1.x as HIGH", () => {
    const findings = checkDependencyVersions(["/* jQuery v1.9.1 */", "/* end */", ""]);
    expect(findings.some((f) => f.code === "DEP_JQUERY_OUTDATED")).toBe(true);
    expect(findings.find((f) => f.code === "DEP_JQUERY_OUTDATED")?.severity).toBe("HIGH");
  });

  it("detects outdated jQuery 3.4.x as HIGH", () => {
    const findings = checkDependencyVersions(["/* jquery v3.4.1 */", ""]);
    expect(findings.some((f) => f.code === "DEP_JQUERY_OUTDATED")).toBe(true);
  });

  it("does not flag jQuery 3.5.0", () => {
    const findings = checkDependencyVersions(["/* jquery v3.5.0 */", ""]);
    expect(findings.some((f) => f.code === "DEP_JQUERY_OUTDATED")).toBe(false);
  });

  it("detects outdated React 15.x as MEDIUM", () => {
    const findings = checkDependencyVersions(["react v15.6.2", ""]);
    expect(findings.some((f) => f.code === "DEP_REACT_OUTDATED")).toBe(true);
    expect(findings.find((f) => f.code === "DEP_REACT_OUTDATED")?.severity).toBe("MEDIUM");
  });

  it("detects outdated Angular 11.x as MEDIUM", () => {
    const findings = checkDependencyVersions(["angular v11.2", ""]);
    expect(findings.some((f) => f.code === "DEP_ANGULAR_OUTDATED")).toBe(true);
  });

  it("detects outdated Lodash as MEDIUM", () => {
    const findings = checkDependencyVersions(["lodash v4.16.0", ""]);
    expect(findings.some((f) => f.code === "DEP_LODASH_OUTDATED")).toBe(true);
    expect(findings.find((f) => f.code === "DEP_LODASH_OUTDATED")?.severity).toBe("MEDIUM");
  });

  it("does not flag current lodash 4.17.21", () => {
    const findings = checkDependencyVersions(["lodash v4.17.21", ""]);
    expect(findings.some((f) => f.code === "DEP_LODASH_OUTDATED")).toBe(false);
  });

  it("detects Bootstrap 3.x as LOW", () => {
    const findings = checkDependencyVersions(["bootstrap v3.4.1", ""]);
    expect(findings.some((f) => f.code === "DEP_BOOTSTRAP_OUTDATED")).toBe(true);
    expect(findings.find((f) => f.code === "DEP_BOOTSTRAP_OUTDATED")?.severity).toBe("LOW");
  });

  it("detects Moment.js as LOW", () => {
    const findings = checkDependencyVersions(["moment v2.29.4", ""]);
    expect(findings.some((f) => f.code === "DEP_MOMENTJS_DETECTED")).toBe(true);
    expect(findings.find((f) => f.code === "DEP_MOMENTJS_DETECTED")?.severity).toBe("LOW");
  });

  it("returns empty for no known libraries", () => {
    const findings = checkDependencyVersions(["const x = 1 + 1;", ""]);
    expect(findings.length).toBe(0);
  });

  it("deduplicates same library across multiple payloads", () => {
    const payload = "/* jquery v1.9.1 */";
    const findings = checkDependencyVersions([payload, payload]);
    const jqueryFindings = findings.filter((f) => f.code === "DEP_JQUERY_OUTDATED");
    expect(jqueryFindings.length).toBe(1);
  });
});

// ────────────────────────────────────────────
// 18. Performance regression (no-db fallback)
// ────────────────────────────────────────────

describe("checkPerformanceRegression", () => {
  it("returns empty array when db is unavailable", async () => {
    // In CI, DATABASE_URL is not set, so db queries throw. The function catches silently.
    const findings = await checkPerformanceRegression("non-existent-app-id", 5000);
    expect(Array.isArray(findings)).toBe(true);
  });
});
