import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const monitoredAppFindFirst = vi.fn();
const apiKeyFindFirst = vi.fn();
const findingFindFirst = vi.fn();

vi.mock("@/lib/auth", () => ({ getSession }));
vi.mock("@/lib/db", () => ({
  db: {
    monitoredApp: {
      findFirst: monitoredAppFindFirst,
      delete: vi.fn(),
      update: vi.fn(),
    },
    apiKey: {
      findFirst: apiKeyFindFirst,
      delete: vi.fn(),
    },
    finding: {
      findFirst: findingFindFirst,
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));
vi.mock("@/lib/tenant", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/scanner-http", () => ({ runHttpScanForApp: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/endpoint-discovery", () => ({ discoverEndpoints: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/scanner-auth", () => ({ runAuthScan: vi.fn().mockResolvedValue([]) }));

describe("tenant isolation - negative access checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ id: "user_1", orgId: "org_a", role: "ADMIN" });
  });

  it("returns 404 when accessing app from another org", async () => {
    monitoredAppFindFirst.mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/apps/[id]/route");

    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "app_b" }) });
    expect(res.status).toBe(404);
  });

  it("returns 404 when deleting API key from another org", async () => {
    apiKeyFindFirst.mockResolvedValueOnce(null);
    const { DELETE } = await import("@/app/api/keys/[id]/route");

    const res = await DELETE(new Request("http://localhost"), { params: Promise.resolve({ id: "key_b" }) });
    expect(res.status).toBe(404);
  });

  it("returns 404 when updating finding from another org", async () => {
    findingFindFirst.mockResolvedValueOnce(null);
    const { PATCH } = await import("@/app/api/findings/[id]/route");

    const req = new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ status: "RESOLVED" }),
      headers: { "content-type": "application/json" },
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "finding_b" }) });
    expect(res.status).toBe(404);
  });

  it("returns 404 when triggering scan for app in another org", async () => {
    monitoredAppFindFirst.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/scan/[id]/route");

    const res = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "app_b" }),
    });

    expect(res.status).toBe(404);
  });
});
