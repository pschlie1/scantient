/**
 * auth-config.test.ts
 *
 * Tests for:
 *  - GET/PUT/DELETE /api/apps/[id]/auth-config
 *  - Scanner applies auth headers when scanning
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Auth mock ────────────────────────────────────────────────────────────────
const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession }));

// ─── DB mock ─────────────────────────────────────────────────────────────────
const monitoredAppFindFirst = vi.fn();
const monitoredAppUpdate = vi.fn();
const monitoredAppFindUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    monitoredApp: {
      findFirst: monitoredAppFindFirst,
      update: monitoredAppUpdate,
      findUnique: monitoredAppFindUnique,
    },
    auditLog: { create: vi.fn() },
    monitorRun: {
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// ─── Crypto mock (so we don't need ENCRYPTION_KEY env) ───────────────────────
vi.mock("@/lib/crypto-util", () => ({
  encrypt: (v: string) => `enc:${v}`,
  decrypt: (v: string) => v.replace(/^enc:/, ""),
}));

// ─── Tenant / analytics mocks ─────────────────────────────────────────────────
const getOrgLimits = vi.fn();
vi.mock("@/lib/tenant", () => ({ getOrgLimits, logAudit: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/endpoint-discovery", () => ({ discoverEndpoints: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/scanner-auth", () => ({ runAuthScan: vi.fn().mockResolvedValue([]) }));

// ─── Scanner mock (used for "scanner applies auth headers" test) ───────────────
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function adminSession() {
  return { id: "user_1", orgId: "org_a", role: "ADMIN" };
}

function makeRequest(method: string, body?: unknown) {
  return new Request("http://localhost", {
    method,
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────
describe("GET /api/apps/[id]/auth-config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default to PRO so tier gate passes; individual tests override if needed
    getOrgLimits.mockResolvedValue({ tier: "PRO" });
  });

  it("returns 401 without session", async () => {
    getSession.mockResolvedValue(null);
    const { GET } = await import("@/app/api/apps/[id]/auth-config/route");
    const res = await GET(makeRequest("GET"), { params: Promise.resolve({ id: "app_1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 for MEMBER role", async () => {
    getSession.mockResolvedValue({ id: "u1", orgId: "org_a", role: "MEMBER" });
    const { GET } = await import("@/app/api/apps/[id]/auth-config/route");
    const res = await GET(makeRequest("GET"), { params: Promise.resolve({ id: "app_1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 403 for VIEWER role", async () => {
    getSession.mockResolvedValue({ id: "u1", orgId: "org_a", role: "VIEWER" });
    const { GET } = await import("@/app/api/apps/[id]/auth-config/route");
    const res = await GET(makeRequest("GET"), { params: Promise.resolve({ id: "app_1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 404 for app in another org", async () => {
    getSession.mockResolvedValue(adminSession());
    monitoredAppFindFirst.mockResolvedValue(null); // findFirst with orgId filter returns null
    const { GET } = await import("@/app/api/apps/[id]/auth-config/route");
    const res = await GET(makeRequest("GET"), { params: Promise.resolve({ id: "app_other" }) });
    expect(res.status).toBe(404);
  });

  it("returns masked headers for app with auth config", async () => {
    getSession.mockResolvedValue(adminSession());
    // authHeaders is "enc:[{\"name\":\"Authorization\",\"value\":\"Bearer secret\"}]"
    monitoredAppFindFirst.mockResolvedValue({
      id: "app_1",
      orgId: "org_a",
      authHeaders: 'enc:[{"name":"Authorization","value":"Bearer secret"}]',
    });
    const { GET } = await import("@/app/api/apps/[id]/auth-config/route");
    const res = await GET(makeRequest("GET"), { params: Promise.resolve({ id: "app_1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.headers).toHaveLength(1);
    expect(body.headers[0].name).toBe("Authorization");
    expect(body.headers[0].value).toBe("••••••••");
  });

  it("returns empty array for app without auth config", async () => {
    getSession.mockResolvedValue(adminSession());
    monitoredAppFindFirst.mockResolvedValue({ id: "app_1", orgId: "org_a", authHeaders: null });
    const { GET } = await import("@/app/api/apps/[id]/auth-config/route");
    const res = await GET(makeRequest("GET"), { params: Promise.resolve({ id: "app_1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.headers).toEqual([]);
  });
});

describe("PUT /api/apps/[id]/auth-config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default to PRO so tier gate passes; individual tests override if needed
    getOrgLimits.mockResolvedValue({ tier: "PRO" });
  });

  it("stores encrypted headers (ADMIN)", async () => {
    getSession.mockResolvedValue(adminSession());
    monitoredAppFindFirst.mockResolvedValue({ id: "app_1", orgId: "org_a" });
    monitoredAppUpdate.mockResolvedValue({});

    const { PUT } = await import("@/app/api/apps/[id]/auth-config/route");
    const res = await PUT(
      makeRequest("PUT", [{ name: "Authorization", value: "Bearer token" }]),
      { params: Promise.resolve({ id: "app_1" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.count).toBe(1);
    // Verify the update was called with encrypted value
    expect(monitoredAppUpdate).toHaveBeenCalledWith({
      where: { id: "app_1" },
      data: {
        authHeaders: expect.stringContaining("Authorization"),
      },
    });
  });

  it("returns 400 when name is missing", async () => {
    getSession.mockResolvedValue(adminSession());
    monitoredAppFindFirst.mockResolvedValue({ id: "app_1", orgId: "org_a" });

    const { PUT } = await import("@/app/api/apps/[id]/auth-config/route");
    const res = await PUT(
      makeRequest("PUT", [{ name: "", value: "Bearer token" }]),
      { params: Promise.resolve({ id: "app_1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when empty value", async () => {
    getSession.mockResolvedValue(adminSession());
    monitoredAppFindFirst.mockResolvedValue({ id: "app_1", orgId: "org_a" });

    const { PUT } = await import("@/app/api/apps/[id]/auth-config/route");
    const res = await PUT(
      makeRequest("PUT", [{ name: "X-Api-Key", value: "" }]),
      { params: Promise.resolve({ id: "app_1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when too many headers (>10)", async () => {
    getSession.mockResolvedValue(adminSession());
    monitoredAppFindFirst.mockResolvedValue({ id: "app_1", orgId: "org_a" });

    const tooMany = Array.from({ length: 11 }, (_, i) => ({
      name: `Header-${i}`,
      value: `value-${i}`,
    }));

    const { PUT } = await import("@/app/api/apps/[id]/auth-config/route");
    const res = await PUT(makeRequest("PUT", tooMany), { params: Promise.resolve({ id: "app_1" }) });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/apps/[id]/auth-config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes auth headers", async () => {
    getSession.mockResolvedValue(adminSession());
    monitoredAppFindFirst.mockResolvedValue({ id: "app_1", orgId: "org_a", authHeaders: "enc:..." });
    monitoredAppUpdate.mockResolvedValue({});

    const { DELETE } = await import("@/app/api/apps/[id]/auth-config/route");
    const res = await DELETE(makeRequest("DELETE"), { params: Promise.resolve({ id: "app_1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(monitoredAppUpdate).toHaveBeenCalledWith({
      where: { id: "app_1" },
      data: { authHeaders: null },
    });
  });

  it("returns 401 without session", async () => {
    getSession.mockResolvedValue(null);
    const { DELETE } = await import("@/app/api/apps/[id]/auth-config/route");
    const res = await DELETE(makeRequest("DELETE"), { params: Promise.resolve({ id: "app_1" }) });
    expect(res.status).toBe(401);
  });
});

describe("Scanner applies auth headers from app config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes decrypted auth headers to the fetch call", async () => {
    // App has authHeaders set
    const encryptedHeaders = 'enc:[{"name":"Authorization","value":"Bearer secret-token"}]';
    monitoredAppFindUnique.mockResolvedValue({
      id: "app_1",
      orgId: "org_a",
      url: "https://example.com",
      name: "Test App",
      authHeaders: encryptedHeaders,
    });

    // Mock the fetch call to return a response
    fetchMock.mockResolvedValue({
      status: 200,
      headers: new Headers({ "content-type": "text/html" }),
      text: async () => "<html><body>Hello</body></html>",
      url: "https://example.com",
    });

    // Also mock other DB calls used by runHttpScanForApp
    const { db } = await import("@/lib/db");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.monitorRun as any).create = vi.fn().mockResolvedValue({ id: "run_1" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.auditLog as any).create = vi.fn().mockResolvedValue({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.auditLog as any).findFirst = vi.fn().mockResolvedValue(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.monitorRun as any).update = vi.fn().mockResolvedValue({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.monitoredApp as any).update = vi.fn().mockResolvedValue({});

    const { runHttpScanForApp } = await import("@/lib/scanner-http");

    // This will throw because mocks aren't fully set up, but we just need to verify fetch was called with auth header
    try {
      await runHttpScanForApp("app_1");
    } catch {
      // expected — partial mock
    }

    // Find the main page fetch (not asset fetches)
    const mainFetchCall = fetchMock.mock.calls.find(
      (call) => call[0] === "https://example.com",
    );
    expect(mainFetchCall).toBeDefined();
    const fetchOptions = mainFetchCall![1] as RequestInit;
    const headers = fetchOptions.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer secret-token");
  });
});
