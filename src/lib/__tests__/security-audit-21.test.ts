/**
 * Audit 21: JS asset fetching must preserve SSRF protections.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const monitoredAppFindUnique = vi.fn();
const monitoredAppUpdate = vi.fn();
const monitorRunCreate = vi.fn();
const monitorRunFindUnique = vi.fn();
const auditLogFindFirst = vi.fn();
const auditLogCreate = vi.fn();
const txMonitorRunUpdate = vi.fn();
const txMonitorRunFindMany = vi.fn();
const txMonitoredAppUpdate = vi.fn();
const dbTransaction = vi.fn();

const ssrfSafeFetch = vi.fn();
const isPrivateUrl = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: dbTransaction,
    monitoredApp: {
      findUnique: monitoredAppFindUnique,
      update: monitoredAppUpdate,
    },
    monitorRun: {
      create: monitorRunCreate,
      findUnique: monitorRunFindUnique,
    },
    auditLog: {
      findFirst: auditLogFindFirst,
      create: auditLogCreate,
    },
  },
}));

vi.mock("@/lib/ssrf-guard", () => ({
  isPrivateUrl,
  ssrfSafeFetch,
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
  checkInlineScriptCount: vi.fn().mockReturnValue([]),
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

vi.mock("@/lib/content-hash", () => ({ computeContentHash: vi.fn().mockReturnValue("hash") }));
vi.mock("@/lib/alerts", () => ({ sendCriticalFindingsAlert: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/tenant", () => ({ getOrgLimits: vi.fn().mockResolvedValue({ tier: "FREE", status: "ACTIVE" }) }));
vi.mock("@/lib/remediation-lifecycle", () => ({
  autoTriageFinding: vi.fn().mockResolvedValue(undefined),
  verifyResolvedFindings: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/ai-policy-scanner", () => ({ checkAITools: vi.fn().mockReturnValue([]) }));
vi.mock("@/lib/endpoint-discovery", () => ({ discoverEndpoints: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/scanner-auth", () => ({ runAuthScan: vi.fn().mockResolvedValue([]) }));

beforeEach(() => {
  vi.clearAllMocks();

  monitoredAppFindUnique.mockResolvedValue({
    id: "app_1",
    orgId: "org_1",
    url: "https://example.com",
    authHeaders: null,
  });
  monitorRunCreate.mockResolvedValue({ id: "run_1" });
  monitorRunFindUnique.mockResolvedValue({ id: "run_1", findings: [] });
  monitoredAppUpdate.mockResolvedValue({});
  auditLogFindFirst.mockResolvedValue(null);
  auditLogCreate.mockResolvedValue({});
  txMonitorRunUpdate.mockResolvedValue({});
  txMonitorRunFindMany.mockResolvedValue([{ status: "HEALTHY", responseTimeMs: 100 }]);
  txMonitoredAppUpdate.mockResolvedValue({});

  dbTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb({
    monitorRun: {
      update: txMonitorRunUpdate,
      findMany: txMonitorRunFindMany,
    },
    monitoredApp: {
      update: txMonitoredAppUpdate,
    },
  }));
});

describe("security audit 21 - scanner asset SSRF hardening", () => {
  it("uses ssrfSafeFetch for JS assets and skips private/internal script URLs", async () => {
    const html = `
      <html><body>
        <script src="/public.js"></script>
        <script src="http://169.254.169.254/latest/meta-data"></script>
      </body></html>
    `;

    isPrivateUrl.mockImplementation(async (url: string) => url.includes("169.254.169.254"));
    ssrfSafeFetch
      .mockResolvedValueOnce(new Response(html, { status: 200, headers: { "content-type": "text/html" } }))
      .mockResolvedValueOnce(new Response("console.log('ok')", { status: 200 }));

    const { runHttpScanForApp } = await import("@/lib/scanner-http");
    await runHttpScanForApp("app_1", { source: "manual" });

    const fetchedUrls = ssrfSafeFetch.mock.calls.map((c) => c[0]);
    expect(fetchedUrls).toContain("https://example.com");
    expect(fetchedUrls).toContain("https://example.com/public.js");
    expect(fetchedUrls).not.toContain("http://169.254.169.254/latest/meta-data");
  });

  it("ignores non-http(s) script URLs", async () => {
    const html = `<html><body><script src="data:text/javascript,alert(1)"></script></body></html>`;
    isPrivateUrl.mockResolvedValue(false);
    ssrfSafeFetch.mockResolvedValueOnce(new Response(html, { status: 200, headers: { "content-type": "text/html" } }));

    const { runHttpScanForApp } = await import("@/lib/scanner-http");
    await runHttpScanForApp("app_1", { source: "manual" });

    expect(ssrfSafeFetch).toHaveBeenCalledTimes(1);
    expect(ssrfSafeFetch).toHaveBeenCalledWith(
      "https://example.com",
      expect.any(Object),
      5,
    );
  });
});
