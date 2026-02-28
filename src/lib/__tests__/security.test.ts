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
  it("detects missing rate limiting headers", () => {
    const findings = checkAPISecurity("<html></html>", new Headers());
    expect(findings.some((f) => f.code === "NO_RATE_LIMITING")).toBe(true);
  });

  it("no rate limit finding when header present", () => {
    const headers = new Headers({ "x-ratelimit-limit": "100" });
    const findings = checkAPISecurity("<html></html>", headers);
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
