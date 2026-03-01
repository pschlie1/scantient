/**
 * ci-scan-app-limit.test.ts
 *
 * Tests that the CI scan auto-create path enforces the org app limit (CB-4).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const apiFindFirst = vi.fn();
const apiUpdate = vi.fn();
const auditCreate = vi.fn();
const findApp = vi.fn();
const countApps = vi.fn();
const createApp = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    apiKey: {
      findFirst: apiFindFirst,
      update: apiUpdate,
    },
    auditLog: {
      create: auditCreate,
    },
    monitoredApp: {
      findFirst: findApp,
      count: countApps,
      create: createApp,
    },
    finding: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

const getOrgLimits = vi.fn();
vi.mock("@/lib/tenant", () => ({ getOrgLimits }));

vi.mock("@/lib/scanner-http", () => ({
  runHttpScanForApp: vi.fn().mockResolvedValue({ findings: [] }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(url = "https://example.com") {
  return new Request("http://localhost/api/public/ci-scan", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": "vs_testkey",
    },
    body: JSON.stringify({ url }),
  });
}

function makeApiKey(orgId = "org-1") {
  return {
    id: "key-1",
    orgId,
    rateLimit: null,
    lastUsedAt: null,
    expiresAt: null,
    keyHash: "abc123",
    keyPrefix: "vs_test",
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  apiFindFirst.mockResolvedValue(makeApiKey());
  apiUpdate.mockResolvedValue({ id: "key-1" });
  auditCreate.mockResolvedValue({ id: "audit-1" });
  findApp.mockResolvedValue(null); // app not found → will try to create
  countApps.mockResolvedValue(0);
  createApp.mockResolvedValue({
    id: "app-1",
    url: "https://example.com",
    orgId: "org-1",
    name: "example.com",
  });
  getOrgLimits.mockResolvedValue({ maxApps: 2, maxUsers: 1, tier: "FREE" });
});

describe("POST /api/public/ci-scan — app limit enforcement (CB-4)", () => {
  it("returns 403 when org is at app limit", async () => {
    countApps.mockResolvedValue(2); // at limit (maxApps: 2)
    getOrgLimits.mockResolvedValue({ maxApps: 2, maxUsers: 1, tier: "FREE" });

    const { POST } = await import("@/app/api/public/ci-scan/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);

    const json = await res.json();
    expect(json.error).toContain("App limit reached");
  });

  it("returns 403 when org exceeds app limit", async () => {
    countApps.mockResolvedValue(5); // over limit
    getOrgLimits.mockResolvedValue({ maxApps: 2, maxUsers: 1, tier: "FREE" });

    const { POST } = await import("@/app/api/public/ci-scan/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
  });

  it("does NOT create app when org is at limit", async () => {
    countApps.mockResolvedValue(2);
    getOrgLimits.mockResolvedValue({ maxApps: 2, maxUsers: 1, tier: "FREE" });

    const { POST } = await import("@/app/api/public/ci-scan/route");
    await POST(makeRequest());
    expect(createApp).not.toHaveBeenCalled();
  });

  it("allows creation when under the limit", async () => {
    countApps.mockResolvedValue(1); // under limit
    getOrgLimits.mockResolvedValue({ maxApps: 5, maxUsers: 2, tier: "STARTER" });

    const { POST } = await import("@/app/api/public/ci-scan/route");
    const res = await POST(makeRequest());
    // Should proceed past limit check (may fail later for other reasons but not 403)
    expect(res.status).not.toBe(403);
    expect(createApp).toHaveBeenCalled();
  });

  it("skips limit check when app already exists (no auto-create needed)", async () => {
    findApp.mockResolvedValue({
      id: "app-existing",
      url: "https://example.com",
      orgId: "org-1",
    });
    countApps.mockResolvedValue(100); // way over limit, but irrelevant

    const { POST } = await import("@/app/api/public/ci-scan/route");
    const res = await POST(makeRequest());
    // When app exists, no new app is created so limit is irrelevant
    expect(createApp).not.toHaveBeenCalled();
    expect(res.status).not.toBe(403);
  });

  it("ENTERPRISE_PLUS: allows creation with 999 maxApps limit", async () => {
    countApps.mockResolvedValue(500); // large org, but under 999
    getOrgLimits.mockResolvedValue({
      maxApps: 999,
      maxUsers: 999,
      tier: "ENTERPRISE_PLUS",
    });

    const { POST } = await import("@/app/api/public/ci-scan/route");
    const res = await POST(makeRequest());
    expect(res.status).not.toBe(403);
    expect(createApp).toHaveBeenCalled();
  });
});
