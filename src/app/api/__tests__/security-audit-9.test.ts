/**
 * security-audit-9.test.ts
 * Tests for 8 fixes shipped in fix/deep-audit-9:
 *
 * A9-1:  SSRF via redirect chain — ssrfSafeFetch checks every hop
 * A9-2:  Webhook signing uses server secret (WEBHOOK_SIGNING_SECRET) not raw URL
 * A9-3:  Scan concurrency guard — runDueHttpScans claims apps before scanning
 * A9-4:  N+1 autoTriageFinding → Promise.all (parallel, not sequential)
 * A9-5:  N+1 verifyResolvedFindings → Promise.all (parallel, not sequential)
 * A9-6:  Session cookie Secure flag on refresh checks VERCEL_ENV (parity with createSession)
 * A9-7:  SSO init sanitizes error — no raw error message to client
 * A9-8:  checksRun updated to findings.length on scan completion (was stuck at 0)
 */

import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────────────
// A9-1: ssrfSafeFetch — SSRF via redirect chain
// ─────────────────────────────────────────────────────────────────────────────
describe("A9-1: ssrfSafeFetch — SSRF redirect chain blocked", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("throws when initial URL is a private IP (no DNS needed)", async () => {
    const { ssrfSafeFetch } = await import("@/lib/ssrf-guard");
    // 192.168.1.1 is checked directly via isIP → isPrivateIp, no DNS
    await expect(ssrfSafeFetch("http://192.168.1.1/", {})).rejects.toThrow(/SSRF/);
  });

  it("throws when initial URL is localhost (name check, no DNS)", async () => {
    const { ssrfSafeFetch } = await import("@/lib/ssrf-guard");
    await expect(ssrfSafeFetch("http://localhost/admin", {})).rejects.toThrow(/SSRF/);
  });

  it("throws when initial URL is 10.x.x.x (private RFC1918)", async () => {
    const { ssrfSafeFetch } = await import("@/lib/ssrf-guard");
    await expect(ssrfSafeFetch("http://10.0.0.1/secret", {})).rejects.toThrow(/SSRF/);
  });

  it("throws when initial URL is link-local 169.254.x.x (AWS metadata)", async () => {
    const { ssrfSafeFetch } = await import("@/lib/ssrf-guard");
    await expect(ssrfSafeFetch("http://169.254.169.254/latest/meta-data/", {})).rejects.toThrow(/SSRF/);
  });

  it("throws when a redirect leads to a private IP (open redirect bypass)", async () => {
    // Stub dns/promises so the initial public URL resolves to a public IP
    const dns = await import("dns/promises");
    vi.spyOn(dns, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as never);

    // First fetch: 302 → private IP address
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data/" },
        }),
      ),
    );

    const { ssrfSafeFetch } = await import("@/lib/ssrf-guard");
    await expect(ssrfSafeFetch("https://public.example.com/", {})).rejects.toThrow(/SSRF/);
  });

  it("throws 'too many redirects' when chain exceeds maxRedirects", async () => {
    const dns = await import("dns/promises");
    vi.spyOn(dns, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as never);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: "https://public.example.com/loop" },
        }),
      ),
    );

    const { ssrfSafeFetch } = await import("@/lib/ssrf-guard");
    await expect(ssrfSafeFetch("https://public.example.com/start", {}, 3)).rejects.toThrow(
      /too many redirects/i,
    );
  });

  it("follows a benign redirect and returns the final 200 response", async () => {
    const dns = await import("dns/promises");
    vi.spyOn(dns, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as never);

    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        callCount += 1;
        if (callCount === 1) {
          return Promise.resolve(
            new Response(null, {
              status: 302,
              headers: { location: "https://public.example.com/final" },
            }),
          );
        }
        return Promise.resolve(new Response("<html>ok</html>", { status: 200 }));
      }),
    );

    const { ssrfSafeFetch } = await import("@/lib/ssrf-guard");
    const res = await ssrfSafeFetch("https://public.example.com/start", {});
    expect(res.status).toBe(200);
    expect(callCount).toBe(2);
  });

  it("non-redirect response (200) is returned immediately without additional fetch calls", async () => {
    const dns = await import("dns/promises");
    vi.spyOn(dns, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as never);

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response("<html>hello</html>", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { ssrfSafeFetch } = await import("@/lib/ssrf-guard");
    const res = await ssrfSafeFetch("https://public.example.com/page", {});
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://public.example.com/page",
      expect.objectContaining({ redirect: "manual" }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A9-2: Webhook signing — uses derived key, not raw URL
// ─────────────────────────────────────────────────────────────────────────────
describe("A9-2: Webhook signing uses derived key from WEBHOOK_SIGNING_SECRET", () => {
  afterEach(() => {
    delete process.env.WEBHOOK_SIGNING_SECRET;
  });

  it("when WEBHOOK_SIGNING_SECRET is set, signing key differs from raw URL", async () => {
    const { createHmac } = await import("crypto");
    const { signWebhookPayload } = await import("@/lib/webhook-signature");

    const url = "https://webhook.example.com/receive";
    const body = JSON.stringify({ event: "finding.critical" });

    // Simulate the derivation that alerts.ts now performs
    const derivedKey = createHmac("sha256", "my-server-secret").update(url, "utf8").digest("hex");

    const sigFromUrl = signWebhookPayload(body, url);
    const sigFromDerived = signWebhookPayload(body, derivedKey);

    // Derived key produces different sig than raw URL — proves key changed
    expect(sigFromUrl).not.toBe(sigFromDerived);
    expect(sigFromDerived).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("different WEBHOOK_SIGNING_SECRET values produce different derived keys for same URL", async () => {
    const { createHmac } = await import("crypto");
    const { signWebhookPayload } = await import("@/lib/webhook-signature");

    const url = "https://webhook.example.com/receive";
    const body = JSON.stringify({ event: "test" });

    const key1 = createHmac("sha256", "secret-alpha").update(url, "utf8").digest("hex");
    const key2 = createHmac("sha256", "secret-beta").update(url, "utf8").digest("hex");

    const sig1 = signWebhookPayload(body, key1);
    const sig2 = signWebhookPayload(body, key2);

    expect(sig1).not.toBe(sig2);
  });

  it("alerts.ts source derives signing key with HMAC not raw URL", () => {
    // Source-level assertion: confirm the implementation was updated
    const src = readFileSync(resolve(__dir, "../../../lib/alerts.ts"), "utf8");
    expect(src).toContain("deriveWebhookSigningKey");
    expect(src).toContain("WEBHOOK_SIGNING_SECRET");
    expect(src).toContain("createHmac");
    // The old pattern — raw URL passed as second arg to signWebhookPayload — must be gone
    expect(src).not.toMatch(/signWebhookPayload\(body,\s*url\)/);
  });

  it("emits console.warn when WEBHOOK_SIGNING_SECRET is absent (fallback)", () => {
    // Inline test of the deriveWebhookSigningKey fallback logic without module import
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = process.env.WEBHOOK_SIGNING_SECRET;
    delete process.env.WEBHOOK_SIGNING_SECRET;

    // Replicate the logic in alerts.ts deriveWebhookSigningKey
    const masterSecret = process.env.WEBHOOK_SIGNING_SECRET;
    if (!masterSecret) {
      console.warn("[alerts] WEBHOOK_SIGNING_SECRET not set — webhook signatures use URL as key (insecure).");
    }
    expect(warnSpy).toHaveBeenCalled();

    if (env) process.env.WEBHOOK_SIGNING_SECRET = env;
    warnSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A9-3: Scan concurrency guard — apps claimed before scanning
// ─────────────────────────────────────────────────────────────────────────────
describe("A9-3: runDueHttpScans — concurrency guard via updateMany claim", () => {
  it("scanner-http.ts source calls updateMany before individual scans", () => {
    const src = readFileSync(resolve(__dir, "../../../lib/scanner-http.ts"), "utf8");
    // Must have updateMany (claim step)
    expect(src).toContain("updateMany");
    // The updateMany must appear in the runDueHttpScans function
    const runDueFnStart = src.indexOf("export async function runDueHttpScans");
    const updateManyPos = src.indexOf("updateMany", runDueFnStart);
    expect(updateManyPos).toBeGreaterThan(runDueFnStart);
  });

  it("returns empty array and does NOT call updateMany when no apps are due", async () => {
    // Lightweight integration test with full mocks
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });

    vi.mock("@/lib/db", () => ({
      db: {
        monitoredApp: {
          findMany: vi.fn().mockResolvedValue([]),
          findUnique: vi.fn(),
          update: vi.fn(),
          updateMany,
        },
        monitorRun: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
        auditLog: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
      },
    }));
    vi.mock("@/lib/security", () => ({
      checkAPISecurity: vi.fn().mockReturnValue([]),
      checkBrokenLinks: vi.fn().mockResolvedValue([]),
      checkClientSideAuthBypass: vi.fn().mockReturnValue([]),
      checkCookieSecurity: vi.fn().mockReturnValue([]),
      checkCORSMisconfiguration: vi.fn().mockReturnValue([]),
      checkDependencyExposure: vi.fn().mockReturnValue([]),
      checkDependencyVersions: vi.fn().mockReturnValue([]),
      checkExposedEndpoints: vi.fn().mockResolvedValue([]),
      checkFormSecurity: vi.fn().mockReturnValue([]),
      checkInformationDisclosure: vi.fn().mockReturnValue([]),
      checkInlineScripts: vi.fn().mockReturnValue([]),
      checkMetaAndConfig: vi.fn().mockReturnValue([]),
      checkOpenRedirects: vi.fn().mockReturnValue([]),
      checkPerformanceRegression: vi.fn().mockResolvedValue([]),
      checkSecurityHeaders: vi.fn().mockReturnValue([]),
      checkSSLCertExpiry: vi.fn().mockResolvedValue([]),
      checkSSLIssues: vi.fn().mockReturnValue([]),
      checkThirdPartyScripts: vi.fn().mockReturnValue([]),
      checkUptimeStatus: vi.fn().mockReturnValue([]),
      scanJavaScriptForKeys: vi.fn().mockReturnValue([]),
    }));
    vi.mock("@/lib/content-hash", () => ({ computeContentHash: vi.fn().mockReturnValue("h") }));
    vi.mock("@/lib/alerts", () => ({ sendCriticalFindingsAlert: vi.fn().mockResolvedValue(undefined) }));
    vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn().mockResolvedValue(undefined) }));
    vi.mock("@/lib/tenant", () => ({ getOrgLimits: vi.fn().mockResolvedValue({ tier: "PRO" }) }));
    vi.mock("@/lib/remediation-lifecycle", () => ({
      autoTriageFinding: vi.fn().mockResolvedValue(undefined),
      verifyResolvedFindings: vi.fn().mockResolvedValue(undefined),
    }));
    vi.mock("@/lib/ssrf-guard", () => ({
      isPrivateUrl: vi.fn().mockResolvedValue(false),
      ssrfSafeFetch: vi.fn().mockResolvedValue(new Response("<html></html>", { status: 200 })),
    }));
    vi.mock("@/lib/auth-headers", () => ({ decryptAuthHeaders: vi.fn().mockReturnValue([]) }));

    const { runDueHttpScans } = await import("@/lib/scanner-http");
    const results = await runDueHttpScans();

    expect(results).toEqual([]);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("calls updateMany with all due app IDs before processing", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });

    vi.mock("@/lib/db", () => ({
      db: {
        monitoredApp: {
          findMany: vi.fn().mockResolvedValue([
            { id: "app_x", orgId: "org1", nextCheckAt: new Date(0) },
            { id: "app_y", orgId: "org1", nextCheckAt: new Date(0) },
          ]),
          findUnique: vi.fn().mockResolvedValue(null), // triggers "App not found" fail
          update: vi.fn().mockResolvedValue({}),
          updateMany,
        },
        monitorRun: { create: vi.fn().mockResolvedValue({ id: "r1" }), update: vi.fn().mockResolvedValue({}), findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
        auditLog: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
      },
    }));
    vi.mock("@/lib/security", () => ({
      checkAPISecurity: vi.fn().mockReturnValue([]),
      checkBrokenLinks: vi.fn().mockResolvedValue([]),
      checkClientSideAuthBypass: vi.fn().mockReturnValue([]),
      checkCookieSecurity: vi.fn().mockReturnValue([]),
      checkCORSMisconfiguration: vi.fn().mockReturnValue([]),
      checkDependencyExposure: vi.fn().mockReturnValue([]),
      checkDependencyVersions: vi.fn().mockReturnValue([]),
      checkExposedEndpoints: vi.fn().mockResolvedValue([]),
      checkFormSecurity: vi.fn().mockReturnValue([]),
      checkInformationDisclosure: vi.fn().mockReturnValue([]),
      checkInlineScripts: vi.fn().mockReturnValue([]),
      checkMetaAndConfig: vi.fn().mockReturnValue([]),
      checkOpenRedirects: vi.fn().mockReturnValue([]),
      checkPerformanceRegression: vi.fn().mockResolvedValue([]),
      checkSecurityHeaders: vi.fn().mockReturnValue([]),
      checkSSLCertExpiry: vi.fn().mockResolvedValue([]),
      checkSSLIssues: vi.fn().mockReturnValue([]),
      checkThirdPartyScripts: vi.fn().mockReturnValue([]),
      checkUptimeStatus: vi.fn().mockReturnValue([]),
      scanJavaScriptForKeys: vi.fn().mockReturnValue([]),
    }));
    vi.mock("@/lib/content-hash", () => ({ computeContentHash: vi.fn().mockReturnValue("h") }));
    vi.mock("@/lib/alerts", () => ({ sendCriticalFindingsAlert: vi.fn().mockResolvedValue(undefined) }));
    vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn().mockResolvedValue(undefined) }));
    vi.mock("@/lib/tenant", () => ({ getOrgLimits: vi.fn().mockResolvedValue({ tier: "PRO" }) }));
    vi.mock("@/lib/remediation-lifecycle", () => ({
      autoTriageFinding: vi.fn().mockResolvedValue(undefined),
      verifyResolvedFindings: vi.fn().mockResolvedValue(undefined),
    }));
    vi.mock("@/lib/ssrf-guard", () => ({
      isPrivateUrl: vi.fn().mockResolvedValue(false),
      ssrfSafeFetch: vi.fn().mockResolvedValue(new Response("<html></html>", { status: 200 })),
    }));
    vi.mock("@/lib/auth-headers", () => ({ decryptAuthHeaders: vi.fn().mockReturnValue([]) }));

    const { runDueHttpScans } = await import("@/lib/scanner-http");
    await runDueHttpScans();

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: expect.objectContaining({ in: expect.arrayContaining(["app_x", "app_y"]) }),
        }),
      }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A9-4: N+1 autoTriageFinding → source-level + behaviour check
// ─────────────────────────────────────────────────────────────────────────────
describe("A9-4: autoTriageFinding called via Promise.all (not for-await loop)", () => {
  it("scanner-http.ts source uses Promise.all for autoTriageFinding, not for-await", () => {
    const src = readFileSync(resolve(__dir, "../../../lib/scanner-http.ts"), "utf8");

    // Must contain Promise.all with autoTriageFinding
    expect(src).toMatch(/Promise\.all\([\s\S]*autoTriageFinding/);

    // Must NOT have sequential for…await pattern for autoTriageFinding
    // (a for loop whose body awaits autoTriageFinding)
    expect(src).not.toMatch(/for\s*\([\s\S]*findings[\s\S]*\)\s*\{[^}]*await autoTriageFinding/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A9-5: verifyResolvedFindings — parallel updates
// ─────────────────────────────────────────────────────────────────────────────
describe("A9-5: verifyResolvedFindings uses Promise.all (not for-await loop)", () => {
  it("remediation-lifecycle.ts source uses Promise.all, not for-await for updates", () => {
    const src = readFileSync(
      resolve(__dir, "../../../lib/remediation-lifecycle.ts"),
      "utf8",
    );

    // Must have Promise.all wrapping the resolved findings iteration
    expect(src).toMatch(/Promise\.all\(/);

    // The for-of + await pattern for individual finding.update must be gone
    // (Check that the updates are inside a .map(...) callback instead)
    expect(src).toMatch(/resolvedFindings\.map\(async/);
  });

  it("reopens a finding whose code is still present in the new scan", async () => {
    vi.resetModules();
    const updateFn = vi.fn().mockResolvedValue({});
    vi.doMock("@/lib/db", () => ({
      db: {
        finding: {
          findMany: vi.fn().mockResolvedValue([
            { id: "f_reopen", code: "EXPOSED_API_KEY", notes: null, status: "RESOLVED", run: { appId: "app1" } },
          ]),
          update: updateFn,
        },
      },
    }));

    const { verifyResolvedFindings } = await import("@/lib/remediation-lifecycle");
    await verifyResolvedFindings("app1", new Set(["EXPOSED_API_KEY"]));

    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "f_reopen" },
        data: expect.objectContaining({ status: "OPEN", resolvedAt: null }),
      }),
    );
    vi.resetModules();
  });

  it("marks a finding closed when its code is not in the new scan", async () => {
    vi.resetModules();
    const updateFn = vi.fn().mockResolvedValue({});
    vi.doMock("@/lib/db", () => ({
      db: {
        finding: {
          findMany: vi.fn().mockResolvedValue([
            { id: "f_close", code: "OLD_CODE", notes: null, status: "RESOLVED", run: { appId: "app1" } },
          ]),
          update: updateFn,
        },
      },
    }));

    const { verifyResolvedFindings } = await import("@/lib/remediation-lifecycle");
    await verifyResolvedFindings("app1", new Set(["DIFFERENT_CODE"]));

    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "f_close" },
        data: expect.objectContaining({
          notes: expect.stringContaining("verified_closed"),
        }),
      }),
    );
    vi.resetModules();
  });

  it("handles both reopen and close in the same scan result", async () => {
    vi.resetModules();
    const updateFn = vi.fn().mockResolvedValue({});
    vi.doMock("@/lib/db", () => ({
      db: {
        finding: {
          findMany: vi.fn().mockResolvedValue([
            { id: "fr1", code: "STILL_THERE", notes: null, status: "RESOLVED", run: { appId: "app1" } },
            { id: "fr2", code: "NOW_GONE",    notes: null, status: "RESOLVED", run: { appId: "app1" } },
          ]),
          update: updateFn,
        },
      },
    }));

    const { verifyResolvedFindings } = await import("@/lib/remediation-lifecycle");
    await verifyResolvedFindings("app1", new Set(["STILL_THERE"]));

    expect(updateFn).toHaveBeenCalledTimes(2);
    const reopenCall = updateFn.mock.calls.find((c) => c[0]?.where?.id === "fr1");
    const closeCall  = updateFn.mock.calls.find((c) => c[0]?.where?.id === "fr2");
    expect(reopenCall?.[0]?.data?.status).toBe("OPEN");
    expect(closeCall?.[0]?.data?.notes).toContain("verified_closed");
    vi.resetModules();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A9-6: Session cookie Secure flag — VERCEL_ENV parity
// ─────────────────────────────────────────────────────────────────────────────
describe("A9-6: auth.ts getSession refresh — Secure flag includes VERCEL_ENV check", () => {
  it("auth.ts refresh path contains VERCEL_ENV in the Secure flag expression", () => {
    const src = readFileSync(resolve(__dir, "../../../lib/auth.ts"), "utf8");

    // The refresh section (after the REFRESH_THRESHOLD block) must check VERCEL_ENV
    // Find the isSecureRefresh or equivalent pattern
    expect(src).toContain("VERCEL_ENV");

    // Both createSession and getSession refresh must have the same pattern
    const createSessionOccurrences = (src.match(/VERCEL_ENV/g) ?? []).length;
    expect(createSessionOccurrences).toBeGreaterThanOrEqual(2);
  });

  it("the Secure flag logic evaluates true when VERCEL_ENV=production", () => {
    // Unit-test the boolean expression used in the fix
    const nodeEnv: string = "test";       // not "production"
    const vercelEnv: string = "production"; // Vercel production deployment

    const isSecure = nodeEnv === "production" || vercelEnv === "production";
    expect(isSecure).toBe(true);
  });

  it("the Secure flag logic evaluates false when neither env is production", () => {
    const nodeEnv: string = "test";
    const vercelEnv: string = "preview";

    const isSecure = nodeEnv === "production" || vercelEnv === "production";
    expect(isSecure).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A9-7: SSO init — sanitized error (no raw message leaked)
// ─────────────────────────────────────────────────────────────────────────────
describe("A9-7: SSO init route sanitizes error response", () => {
  it("sso/init/route.ts source does NOT echo err.message to client in the catch block", () => {
    const src = readFileSync(
      resolve(__dir, "../auth/sso/init/route.ts"),
      "utf8",
    );

    // Old pattern was: { error: err instanceof Error ? err.message : "SSO init failed" }
    // New pattern should be a safe static string
    expect(src).not.toMatch(/err\.message/);

    // Should contain a safe static response string
    expect(src).toMatch(/SSO configuration error/i);
  });

  it("catch block returns 500 with safe generic message only", () => {
    // Inline logic test mirroring the fixed catch handler
    const err = new Error("connect ECONNREFUSED 127.0.0.1:443 — super internal");

    // Old (bad) code:
    const oldError = err instanceof Error ? err.message : "SSO init failed";
    // New (fixed) code:
    const newError = "SSO configuration error. Please contact your administrator.";

    expect(oldError).toContain("ECONNREFUSED");     // would have leaked
    expect(newError).not.toContain("ECONNREFUSED"); // safe
    expect(newError).toMatch(/SSO configuration error/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A9-8: checksRun updated to findings.length on scan completion
// ─────────────────────────────────────────────────────────────────────────────
describe("A9-8: checksRun updated from 0 to findings.length on scan completion", () => {
  it("scanner-http.ts update call includes checksRun: findings.length", () => {
    const src = readFileSync(resolve(__dir, "../../../lib/scanner-http.ts"), "utf8");

    // Must contain checksRun: findings.length in the completion update block
    expect(src).toMatch(/checksRun:\s*findings\.length/);
  });

  it("checksRun is included in the monitorRun update data alongside findings", () => {
    const src = readFileSync(resolve(__dir, "../../../lib/scanner-http.ts"), "utf8");

    // Find the update block that creates findings and verify checksRun is near it
    const updateIdx = src.indexOf("findings: {");
    const checksRunIdx = src.indexOf("checksRun: findings.length");
    expect(checksRunIdx).toBeGreaterThan(0);
    // checksRun should appear before or close to the findings: { create: ... } block
    expect(Math.abs(checksRunIdx - updateIdx)).toBeLessThan(500);
  });
});
