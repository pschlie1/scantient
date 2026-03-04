/**
 * scanner-http-atomic.test.ts
 * Audit 18: Verify that runDueHttpScans() uses a single $transaction to
 * atomically claim due apps — preventing the TOCTOU race where two concurrent
 * cron invocations both read the same due apps before either bumps nextCheckAt.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Transaction-internal mock fns ─────────────────────────────────────────────
const txFindMany = vi.fn();
const txUpdateMany = vi.fn();
const dbTransaction = vi.fn();

// ── Other DB methods used in runHttpScanForApp ────────────────────────────────
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
    $transaction: dbTransaction,
    monitoredApp: {
      findUnique: monitoredAppFindUnique,
      update: monitoredAppUpdate,
      updateMany: monitoredAppUpdateMany,
    },
    monitorRun: { create: monitorRunCreate, update: monitorRunUpdate },
    auditLog: {
      findFirst: auditLogFindFirst,
      create: auditLogCreate,
      createMany: auditLogCreateMany,
    },
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
}));

vi.mock("@/lib/ssrf-guard", () => ({
  isPrivateUrl: vi.fn().mockResolvedValue(false),
  ssrfSafeFetch: vi.fn().mockResolvedValue(
    new Response("<html><head></head><body></body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }),
  ),
}));

vi.mock("@/lib/content-hash", () => ({ computeContentHash: vi.fn().mockReturnValue("abc123") }));
vi.mock("@/lib/alerts", () => ({ sendCriticalFindingsAlert: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/tenant", () => ({ getOrgLimits: vi.fn().mockResolvedValue({ tier: "FREE" }) }));
vi.mock("@/lib/remediation-lifecycle", () => ({
  autoTriageFinding: vi.fn().mockResolvedValue(undefined),
  verifyResolvedFindings: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/auth-headers", () => ({ decryptAuthHeaders: vi.fn().mockReturnValue({}) }));
vi.mock("@/lib/observability", () => ({ logOperationalWarning: vi.fn() }));
vi.mock("@/lib/ai-policy-scanner", () => ({ checkAITools: vi.fn().mockReturnValue([]) }));
vi.mock("@/lib/endpoint-discovery", () => ({ discoverEndpoints: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/scanner-auth", () => ({ runAuthScan: vi.fn().mockResolvedValue([]) }));

beforeEach(() => {
  vi.clearAllMocks();

  // Default: transaction callback is executed with a tx proxy containing
  // txFindMany / txUpdateMany so we can inspect the calls.
  dbTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      monitoredApp: {
        findMany: txFindMany,
        updateMany: txUpdateMany,
      },
    };
    return cb(tx);
  });

  txFindMany.mockResolvedValue([]);
  txUpdateMany.mockResolvedValue({ count: 0 });
  monitoredAppFindUnique.mockResolvedValue(null);
  monitoredAppUpdate.mockResolvedValue({});
  monitoredAppUpdateMany.mockResolvedValue({ count: 0 });
  monitorRunCreate.mockResolvedValue({ id: "run-1" });
  monitorRunUpdate.mockResolvedValue({});
  auditLogFindFirst.mockResolvedValue(null);
  auditLogCreate.mockResolvedValue({});
  auditLogCreateMany.mockResolvedValue({ count: 0 });
});

describe("runDueHttpScans — atomic claim via $transaction (Audit 18)", () => {
  it("calls db.$transaction to claim due apps atomically", async () => {
    const { runDueHttpScans } = await import("@/lib/scanner-http");
    await runDueHttpScans(10);
    expect(dbTransaction).toHaveBeenCalledOnce();
  });

  it("calls tx.monitoredApp.findMany inside the transaction", async () => {
    const { runDueHttpScans } = await import("@/lib/scanner-http");
    await runDueHttpScans(10);
    expect(txFindMany).toHaveBeenCalledOnce();
    const [query] = txFindMany.mock.calls[0];
    expect(query).toMatchObject({
      where: { OR: expect.any(Array) },
      take: 10,
    });
  });

  it("returns empty array without calling updateMany when no apps are due", async () => {
    txFindMany.mockResolvedValueOnce([]);
    const { runDueHttpScans } = await import("@/lib/scanner-http");
    const result = await runDueHttpScans(10);
    expect(result).toEqual([]);
    expect(txUpdateMany).not.toHaveBeenCalled();
  });

  it("calls tx.monitoredApp.updateMany with the IDs returned by findMany", async () => {
    const apps = [
      { id: "app-a", orgId: "org-1", name: "App A", url: "https://a.example.com", nextCheckAt: null },
      { id: "app-b", orgId: "org-1", name: "App B", url: "https://b.example.com", nextCheckAt: null },
    ];
    txFindMany.mockResolvedValueOnce(apps);
    txUpdateMany.mockResolvedValueOnce({ count: 2 });

    // runHttpScanForApp will try to fetch app details — return null so scans fail gracefully
    monitoredAppFindUnique.mockResolvedValue(null);

    const { runDueHttpScans } = await import("@/lib/scanner-http");
    await runDueHttpScans(10);

    expect(txUpdateMany).toHaveBeenCalledOnce();
    const [updateArgs] = txUpdateMany.mock.calls[0];
    expect(updateArgs.where.id.in).toEqual(["app-a", "app-b"]);
    // nextCheckAt should be bumped forward (≥ now)
    expect(updateArgs.data.nextCheckAt).toBeInstanceOf(Date);
    expect(updateArgs.data.nextCheckAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("does NOT call the outer db.monitoredApp.findMany (no TOCTOU path)", async () => {
    // The top-level db.monitoredApp.findMany must not be called — only tx.monitoredApp.findMany
    const dbFindMany = vi.fn();
    // Patch the db mock to expose a top-level findMany that should remain uncalled
    const { db } = await import("@/lib/db");
    (db as unknown as { monitoredApp: { findMany: ReturnType<typeof vi.fn> } }).monitoredApp.findMany = dbFindMany;

    txFindMany.mockResolvedValueOnce([]);
    const { runDueHttpScans } = await import("@/lib/scanner-http");
    await runDueHttpScans(10);

    expect(dbFindMany).not.toHaveBeenCalled();
    expect(txFindMany).toHaveBeenCalledOnce();
  });
});
