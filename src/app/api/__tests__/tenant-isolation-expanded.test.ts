import { describe, expect, it, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("tenant isolation expansion - auth and org boundaries", () => {
  it("metrics route returns 401 without session", async () => {
    vi.doMock("@/lib/auth", () => ({ getSession: vi.fn().mockResolvedValue(null) }));
    const { GET } = await import("@/app/api/metrics/route");

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("reports evidence route returns 401 without session", async () => {
    vi.doMock("@/lib/auth", () => ({ getSession: vi.fn().mockResolvedValue(null) }));
    const { GET } = await import("@/app/api/reports/evidence/route");

    const res = await GET(new Request("http://localhost/api/reports/evidence") as never);
    expect(res.status).toBe(401);
  });

  it("team invite returns 403 for viewer role", async () => {
    vi.doMock("@/lib/auth", () => ({
      getSession: vi.fn().mockResolvedValue({ id: "u_1", orgId: "org_a", role: "VIEWER" }),
      hashPassword: vi.fn(),
    }));
    vi.doMock("@/lib/db", () => ({ db: { user: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn() } } }));
    vi.doMock("@/lib/tenant", () => ({ canAddUser: vi.fn(), logAudit: vi.fn() }));

    const { POST } = await import("@/app/api/team/route");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "x@example.com", role: "MEMBER" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("keys list scopes query to caller org", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "k_a", name: "Org A key", keyPrefix: "vs_abc" }]);

    vi.doMock("@/lib/auth", () => ({ getSession: vi.fn().mockResolvedValue({ id: "u_1", orgId: "org_a", role: "ADMIN" }) }));
    vi.doMock("@/lib/db", () => ({ db: { apiKey: { findMany } } }));

    const { GET } = await import("@/app/api/keys/route");
    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: "org_a" } }),
    );
    expect(JSON.stringify(data)).not.toContain("org_b");
  });

  it("alerts test endpoint returns 404 for cross-tenant config id", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);

    vi.doMock("@/lib/auth", () => ({ getSession: vi.fn().mockResolvedValue({ id: "u_1", orgId: "org_a", role: "ADMIN" }) }));
    vi.doMock("@/lib/db", () => ({ db: { alertConfig: { findFirst } } }));
    vi.doMock("@/lib/alerts", () => ({ sendTestNotification: vi.fn() }));

    const { POST } = await import("@/app/api/alerts/test/route");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ configId: "cfg_b" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    expect(findFirst).toHaveBeenCalledWith({ where: { id: "cfg_b", orgId: "org_a" } });
  });

  it("alerts delete endpoint returns 404 for cross-tenant config id", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);

    vi.doMock("@/lib/auth", () => ({ getSession: vi.fn().mockResolvedValue({ id: "u_1", orgId: "org_a", role: "ADMIN" }) }));
    vi.doMock("@/lib/db", () => ({ db: { alertConfig: { findFirst, delete: vi.fn(), update: vi.fn() } } }));

    const { DELETE } = await import("@/app/api/alerts/[id]/route");
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ id: "cfg_b" }),
    });

    expect(res.status).toBe(404);
    expect(findFirst).toHaveBeenCalledWith({ where: { id: "cfg_b", orgId: "org_a" } });
  });

  it("mcp returns 401 without API key", async () => {
    vi.doMock("@/lib/api-auth", () => ({ authenticateApiKey: vi.fn().mockResolvedValue(null) }));

    const { POST } = await import("@/app/api/mcp/route");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("mcp tool call does not leak cross-tenant app data", async () => {
    const monitoredAppFindFirst = vi.fn().mockResolvedValue(null);

    vi.doMock("@/lib/api-auth", () => ({ authenticateApiKey: vi.fn().mockResolvedValue("org_a") }));
    vi.doMock("@/lib/db", () => ({
      db: {
        monitoredApp: { findFirst: monitoredAppFindFirst, findMany: vi.fn() },
        monitorRun: { findFirst: vi.fn() },
        finding: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
      },
    }));
    vi.doMock("@/lib/scanner-http", () => ({ runHttpScanForApp: vi.fn() }));
    vi.doMock("@/lib/observability", () => ({ logApiError: vi.fn() }));

    const { POST } = await import("@/app/api/mcp/route");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer vs_key" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "get_app_status", arguments: { appId: "app_b" } },
      }),
    });

    const res = await POST(req);
    const payload = await res.json();
    const text = payload?.result?.content?.[0]?.text as string;

    expect(res.status).toBe(200);
    expect(monitoredAppFindFirst).toHaveBeenCalledWith({ where: { id: "app_b", orgId: "org_a" } });
    expect(text).toContain("App not found or access denied");
    expect(text).not.toContain("https://org-b.example");
  });
});
