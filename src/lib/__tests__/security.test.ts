import { describe, expect, it } from "vitest";
import {
  checkClientSideAuthBypass,
  checkInlineScripts,
  checkMetaAndConfig,
  checkSecurityHeaders,
  scanJavaScriptForKeys,
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
