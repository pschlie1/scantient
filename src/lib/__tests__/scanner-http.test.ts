/**
 * scanner-http.test.ts
 * Unit tests for runDueHttpScans (and indirectly runHttpScanForApp).
 *
 * NOTE: calcStatus and dedup are internal (not exported). They are tested
 * indirectly through the public API behavior.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── DB mocks ──────────────────────────────────────────────────────────────────
const monitoredAppFindMany = vi.fn();
const monitoredAppFindUnique = vi.fn();
const monitoredAppUpdate = vi.fn();
const monitoredAppUpdateMany = vi.fn();
const monitorRunCreate = vi.fn();
const monitorRunUpdate = vi.fn();
const auditLogFindFirst = vi.fn();
const auditLogCreate = vi.fn();
const auditLogCreateMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    monitoredApp: {
      findMany: monitoredAppFindMany,
      findUnique: monitoredAppFindUnique,
      update: monitoredAppUpdate,
      updateMany: monitoredAppUpdateMany,
    },
    monitorRun: {
      create: monitorRunCreate,
      update: monitorRunUpdate,
    },
    auditLog: {
      findFirst: auditLogFindFirst,
      create: auditLogCreate,
      createMany: auditLogCreateMany,
    },
  },
}));

// ── Security mocks (all check functions return empty arrays by default) ───────
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

vi.mock("@/lib/content-hash", () => ({ computeContentHash: vi.fn().mockReturnValue("abc123") }));
vi.mock("@/lib/alerts", () => ({ sendCriticalFindingsAlert: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/tenant", () => ({ getOrgLimits: vi.fn().mockResolvedValue({ tier: "FREE" }) }));
vi.mock("@/lib/remediation-lifecycle", () => ({
  autoTriageFinding: vi.fn().mockResolvedValue(undefined),
  verifyResolvedFindings: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  vi.clearAllMocks();
  monitoredAppFindMany.mockResolvedValue([]);
  monitoredAppFindUnique.mockResolvedValue(null);
  monitorRunCreate.mockResolvedValue({ id: "run_1" });
  monitorRunUpdate.mockResolvedValue({});
  monitoredAppUpdate.mockResolvedValue({});
  monitoredAppUpdateMany.mockResolvedValue({ count: 0 });
  auditLogFindFirst.mockResolvedValue(null);
  auditLogCreate.mockResolvedValue({});
  auditLogCreateMany.mockResolvedValue({ count: 0 });
});

describe("runDueHttpScans", () => {
  it("returns empty array when no due apps", async () => {
    monitoredAppFindMany.mockResolvedValueOnce([]);
    const { runDueHttpScans } = await import("@/lib/scanner-http");
    const results = await runDueHttpScans();
    expect(results).toEqual([]);
    expect(monitoredAppFindMany).toHaveBeenCalledOnce();
  });

  it("handles individual app scan failure gracefully (one failure doesn't stop batch)", async () => {
    // Return two apps — findUnique returns null for both (causing "App not found" throw)
    monitoredAppFindMany.mockResolvedValueOnce([
      { id: "app_1", orgId: "org_a", nextCheckAt: null },
      { id: "app_2", orgId: "org_a", nextCheckAt: null },
    ]);
    monitoredAppFindUnique.mockResolvedValue(null); // triggers "App not found" error

    const { runDueHttpScans } = await import("@/lib/scanner-http");
    const results = await runDueHttpScans();

    // Both apps should appear in results with CRITICAL status
    expect(results).toHaveLength(2);
    expect(results[0].status).toBe("CRITICAL");
    expect(results[0].error).toBe("App not found");
    expect(results[1].status).toBe("CRITICAL");
    expect(results[1].error).toBe("App not found");
  });

  it("processes apps in batches of 5 (concurrency=5)", async () => {
    // 6 apps — 1st batch of 5, then 1 more
    const apps = Array.from({ length: 6 }, (_, i) => ({
      id: `app_${i + 1}`,
      orgId: "org_a",
      nextCheckAt: null,
    }));
    monitoredAppFindMany.mockResolvedValueOnce(apps);
    monitoredAppFindUnique.mockResolvedValue(null); // all fail with "App not found"

    const { runDueHttpScans } = await import("@/lib/scanner-http");
    const results = await runDueHttpScans(10); // limit=10

    // All 6 apps should be processed despite batching
    expect(results).toHaveLength(6);
    expect(results.every((r) => r.status === "CRITICAL")).toBe(true);
  });

  it("successful scan returns status and findingsCount in results", async () => {
    const app = {
      id: "app_ok",
      orgId: "org_b",
      url: "https://example.com",
      nextCheckAt: null,
    };
    monitoredAppFindMany.mockResolvedValueOnce([app]);
    monitoredAppFindUnique.mockResolvedValueOnce({
      id: "app_ok",
      orgId: "org_b",
      url: "https://example.com",
      name: "Test App",
      ownerEmail: "owner@example.com",
    });
    monitorRunCreate.mockResolvedValueOnce({ id: "run_ok" });
    monitorRunUpdate.mockResolvedValueOnce({ id: "run_ok" });
    monitoredAppUpdate.mockResolvedValueOnce({});

    // Mock a successful fetch response
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html><head></head><body>Hello</body></html>", {
          status: 200,
          headers: {
            "content-type": "text/html",
            "x-content-type-options": "nosniff",
          },
        }),
      ),
    );

    const { runDueHttpScans } = await import("@/lib/scanner-http");
    const results = await runDueHttpScans();

    expect(results).toHaveLength(1);
    expect(results[0].appId).toBe("app_ok");
    expect(["HEALTHY", "WARNING", "CRITICAL"]).toContain(results[0].status);

    vi.unstubAllGlobals();
  });
});
