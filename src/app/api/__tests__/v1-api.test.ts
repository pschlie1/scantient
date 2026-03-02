/**
 * v1-api.test.ts
 * Tests for the public API v1 routes (API key auth via authenticateApiKey)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- API auth mock ---
const authenticateApiKey = vi.fn();
vi.mock("@/lib/api-auth", () => ({ authenticateApiKey }));

// --- DB mocks ---
const monitoredAppFindMany = vi.fn();
const monitoredAppFindFirst = vi.fn();
const findingCount = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    monitoredApp: {
      findMany: monitoredAppFindMany,
      findFirst: monitoredAppFindFirst,
    },
    finding: { count: findingCount },
  },
}));

// --- Scanner mock ---
const runHttpScanForApp = vi.fn();
vi.mock("@/lib/scanner-http", () => ({ runHttpScanForApp }));

// --- Rate limit mock (for /v1/scan) ---
const checkRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit }));

// --- Tenant mock (getOrgLimits used by rate-limited scan routes) ---
const getOrgLimits = vi.fn();
vi.mock("@/lib/tenant", () => ({ getOrgLimits }));
vi.mock("@/lib/endpoint-discovery", () => ({ discoverEndpoints: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/scanner-auth", () => ({ runAuthScan: vi.fn().mockResolvedValue([]) }));

beforeEach(() => {
  vi.clearAllMocks();
  authenticateApiKey.mockResolvedValue("org_a");
  checkRateLimit.mockResolvedValue({ allowed: true });
  getOrgLimits.mockResolvedValue({ tier: "PRO", maxApps: 15, maxUsers: 10 });
});

function getReq(extraHeaders: Record<string, string> = {}) {
  return new Request("http://localhost", {
    method: "GET",
    headers: { "Authorization": "Bearer vs_test_key", ...extraHeaders },
  });
}

function postReq(body: unknown) {
  return new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "Authorization": "Bearer vs_test_key" },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/apps
// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/v1/apps", () => {
  it("returns 401 without valid API key", async () => {
    authenticateApiKey.mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/v1/apps/route");
    const res = await GET(new Request("http://localhost"));
    expect(res.status).toBe(401);
  });

  it("returns 200 with valid key and app list", async () => {
    monitoredAppFindMany.mockResolvedValueOnce([
      { id: "app_1", name: "App One", url: "https://example.com", status: "HEALTHY" },
    ]);
    const { GET } = await import("@/app/api/v1/apps/route");
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.apps).toHaveLength(1);
    expect(json.apps[0].id).toBe("app_1");
  });

  it("returns empty app list when org has no apps", async () => {
    monitoredAppFindMany.mockResolvedValueOnce([]);
    const { GET } = await import("@/app/api/v1/apps/route");
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.apps).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/dashboard
// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/v1/dashboard", () => {
  it("returns 401 without valid API key", async () => {
    authenticateApiKey.mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/v1/dashboard/route");
    const res = await GET(new Request("http://localhost"));
    expect(res.status).toBe(401);
  });

  it("returns 200 with valid key and dashboard summary", async () => {
    monitoredAppFindMany.mockResolvedValueOnce([
      { id: "a1", name: "App", status: "HEALTHY", lastCheckedAt: null, avgResponseMs: 120 },
      { id: "a2", name: "App2", status: "CRITICAL", lastCheckedAt: null, avgResponseMs: 500 },
    ]);
    findingCount.mockResolvedValueOnce(3);

    const { GET } = await import("@/app/api/v1/dashboard/route");
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.summary).toMatchObject({
      totalApps: 2,
      healthy: 1,
      critical: 1,
      openCriticalFindings: 3,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/scan
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/v1/scan", () => {
  it("returns 401 without valid API key", async () => {
    authenticateApiKey.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/v1/scan/route");
    const res = await POST(postReq({}));
    expect(res.status).toBe(401);
  });

  it("returns 400 on missing appId and url", async () => {
    const { POST } = await import("@/app/api/v1/scan/route");
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
  });

  it("returns 404 when app not found in org", async () => {
    monitoredAppFindFirst.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/v1/scan/route");
    const res = await POST(postReq({ appId: "nonexistent_app" }));
    expect(res.status).toBe(404);
  });

  it("returns 200 on valid appId and calls runHttpScanForApp", async () => {
    monitoredAppFindFirst.mockResolvedValueOnce({ id: "app_1", orgId: "org_a" });
    runHttpScanForApp.mockResolvedValueOnce({
      runId: "run_1",
      appId: "app_1",
      status: "HEALTHY",
      findingsCount: 0,
      responseTimeMs: 300,
    });

    const { POST } = await import("@/app/api/v1/scan/route");
    const res = await POST(postReq({ appId: "app_1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.scanId).toBe("run_1");
    expect(json.status).toBe("HEALTHY");
    expect(runHttpScanForApp).toHaveBeenCalledWith("app_1", { source: "api" });
  });

  it("returns 400 when neither appId nor url provided (empty strings invalid)", async () => {
    const { POST } = await import("@/app/api/v1/scan/route");
    const res = await POST(postReq({ appId: "" }));
    expect(res.status).toBe(400);
  });
});
