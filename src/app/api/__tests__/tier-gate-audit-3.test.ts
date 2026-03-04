/**
 * tier-gate-audit-3.test.ts
 *
 * Tests for audit-3 tier-gate fixes:
 *  NC-1: authenticateApiKeyHeader tier check (CI scan header auth)
 *  NC-2: customer.subscription.updated tier sync
 *  NH-1: MCP trigger_scan rate limit
 *  NH-2: Internal endpoints role and tier gates
 *  NM-1: /api/ops/kpis tier gate
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ─── Auth mocks ───────────────────────────────────────────────────────────────
const getSession = vi.fn();
const requireRole = vi.fn();

vi.mock("@/lib/auth", () => ({ getSession, requireRole }));

// ─── Tenant mocks ─────────────────────────────────────────────────────────────
const getOrgLimits = vi.fn();

vi.mock("@/lib/tenant", () => ({ getOrgLimits }));

// ─── DB mocks ─────────────────────────────────────────────────────────────────
const apiKeyFindFirst = vi.fn();
const apiKeyUpdate = vi.fn();
const subscriptionFindUnique = vi.fn();
const subscriptionFindFirst = vi.fn();
const subscriptionUpdate = vi.fn();
const auditLogCreate = vi.fn();
const monitoredAppFindFirst = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    apiKey: {
      findFirst: apiKeyFindFirst,
      update: apiKeyUpdate,
    },
    subscription: {
      findUnique: subscriptionFindUnique,
      findFirst: subscriptionFindFirst,
      update: subscriptionUpdate,
    },
    auditLog: {
      create: auditLogCreate,
    },
    monitoredApp: {
      findFirst: monitoredAppFindFirst,
    },
  },
}));

// ─── Rate limit mock ──────────────────────────────────────────────────────────
const checkRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit }));

// ─── Scanner mock ─────────────────────────────────────────────────────────────
const runHttpScanForApp = vi.fn();
vi.mock("@/lib/scanner-http", () => ({ runHttpScanForApp }));

// ─── Ops metrics mock ─────────────────────────────────────────────────────────
const getOrgOpsKpis = vi.fn();
vi.mock("@/lib/ops-metrics", () => ({ getOrgOpsKpis }));

// ─── Wave3 reporting mocks ────────────────────────────────────────────────────
const getChangeAuditReport = vi.fn();
const getGtmBaseline = vi.fn();
const getIncidentEvidenceExport = vi.fn();
const parseRange = vi.fn();

vi.mock("@/lib/wave3-reporting", () => ({
  getChangeAuditReport,
  getGtmBaseline,
  getIncidentEvidenceExport,
  parseRange,
}));

// ─── Stripe mock ──────────────────────────────────────────────────────────────
const constructEvent = vi.fn();

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    webhooks: { constructEvent },
  }),
  PLANS: {
    STARTER: { priceId: "price_starter", maxApps: 5, maxUsers: 2 },
    PRO: { priceId: "price_pro", maxApps: 15, maxUsers: 10 },
    ENTERPRISE: { priceId: "price_enterprise", maxApps: 100, maxUsers: 50 },
    ENTERPRISE_PLUS: { priceId: "price_enterprise_plus", maxApps: 999, maxUsers: 999 },
  },
}));

// ─── Observability mock ───────────────────────────────────────────────────────
vi.mock("@/lib/observability", () => ({
  logApiError: vi.fn(),
  logOperationalWarning: vi.fn(),
}));

// ─── Crypto passthrough (node:crypto needed for api-auth hash) ────────────────
vi.mock("@/lib/endpoint-discovery", () => ({ discoverEndpoints: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/scanner-auth", () => ({ runAuthScan: vi.fn().mockResolvedValue([]) }));
vi.mock("node:crypto", async (importOriginal) => {
vi.mock("@/lib/endpoint-discovery", () => ({ discoverEndpoints: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/scanner-auth", () => ({ runAuthScan: vi.fn().mockResolvedValue([]) }));
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, default: actual };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeApiKey(orgId = "org-pro") {
  return {
    id: "key-1",
    orgId,
    keyHash: "hash",
    keyPrefix: "vs_test",
    expiresAt: null,
    lastUsedAt: null,
  };
}

function adminSession(orgId = "org-pro") {
  return { id: "user-1", orgId, role: "ADMIN", email: "admin@test.com" };
}

// ─────────────────────────────────────────────────────────────────────────────
// NC-1: authenticateApiKeyHeader — tier check
// ─────────────────────────────────────────────────────────────────────────────
describe("NC-1: authenticateApiKeyHeader — tier check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiKeyFindFirst.mockResolvedValue(makeApiKey("org-free"));
    apiKeyUpdate.mockResolvedValue({});
    auditLogCreate.mockResolvedValue({});
  });

  it("returns null for FREE org API key", async () => {
    subscriptionFindUnique.mockResolvedValue({ tier: "FREE" });
    const { authenticateApiKeyHeader } = await import("@/lib/api-auth");
    const req = new Request("http://localhost", {
      headers: { "x-api-key": "vs_testkey" },
    });
    const result = await authenticateApiKeyHeader(req);
    expect(result).toBeNull();
  });

  it("returns null for STARTER org API key", async () => {
    subscriptionFindUnique.mockResolvedValue({ tier: "STARTER" });
    apiKeyFindFirst.mockResolvedValue(makeApiKey("org-starter"));
    const { authenticateApiKeyHeader } = await import("@/lib/api-auth");
    const req = new Request("http://localhost", {
      headers: { "x-api-key": "vs_testkey" },
    });
    const result = await authenticateApiKeyHeader(req);
    expect(result).toBeNull();
  });

  it("returns null when no subscription record exists (defaults to FREE)", async () => {
    subscriptionFindUnique.mockResolvedValue(null);
    const { authenticateApiKeyHeader } = await import("@/lib/api-auth");
    const req = new Request("http://localhost", {
      headers: { "x-api-key": "vs_testkey" },
    });
    const result = await authenticateApiKeyHeader(req);
    expect(result).toBeNull();
  });

  it("returns orgId for PRO org API key", async () => {
    subscriptionFindUnique.mockResolvedValue({ tier: "PRO" });
    apiKeyFindFirst.mockResolvedValue(makeApiKey("org-pro"));
    const { authenticateApiKeyHeader } = await import("@/lib/api-auth");
    const req = new Request("http://localhost", {
      headers: { "x-api-key": "vs_testkey" },
    });
    const result = await authenticateApiKeyHeader(req);
    expect(result).toBe("org-pro");
  });

  it("returns orgId for ENTERPRISE org API key", async () => {
    subscriptionFindUnique.mockResolvedValue({ tier: "ENTERPRISE" });
    apiKeyFindFirst.mockResolvedValue(makeApiKey("org-ent"));
    const { authenticateApiKeyHeader } = await import("@/lib/api-auth");
    const req = new Request("http://localhost", {
      headers: { "x-api-key": "vs_testkey" },
    });
    const result = await authenticateApiKeyHeader(req);
    expect(result).toBe("org-ent");
  });

  it("returns orgId for ENTERPRISE_PLUS org API key", async () => {
    subscriptionFindUnique.mockResolvedValue({ tier: "ENTERPRISE_PLUS" });
    apiKeyFindFirst.mockResolvedValue(makeApiKey("org-ep"));
    const { authenticateApiKeyHeader } = await import("@/lib/api-auth");
    const req = new Request("http://localhost", {
      headers: { "x-api-key": "vs_testkey" },
    });
    const result = await authenticateApiKeyHeader(req);
    expect(result).toBe("org-ep");
  });

  it("returns null when no API key header is present", async () => {
    const { authenticateApiKeyHeader } = await import("@/lib/api-auth");
    const req = new Request("http://localhost");
    const result = await authenticateApiKeyHeader(req);
    expect(result).toBeNull();
  });

  it("returns null when API key prefix is wrong", async () => {
    const { authenticateApiKeyHeader } = await import("@/lib/api-auth");
    const req = new Request("http://localhost", {
      headers: { "x-api-key": "invalid_key" },
    });
    const result = await authenticateApiKeyHeader(req);
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NC-2: customer.subscription.updated — tier sync
// ─────────────────────────────────────────────────────────────────────────────
describe("NC-2: customer.subscription.updated — tier sync", () => {
  const WEBHOOK_SECRET = "whsec_test";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    subscriptionFindFirst.mockResolvedValue({ id: "sub-db-1" });
    subscriptionUpdate.mockResolvedValue({});
  });

  function makeWebhookReq(eventType: string, subObj: Record<string, unknown>) {
    const event = { type: eventType, data: { object: subObj } };
    constructEvent.mockReturnValue(event);
    return new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers: {
        "stripe-signature": "sig_test",
        "content-type": "application/json",
      },
      body: JSON.stringify(event),
    });
  }

  it("updates tier when subscription updated with known price ID (ENTERPRISE)", async () => {
    const req = makeWebhookReq("customer.subscription.updated", {
      id: "sub_stripe_123",
      status: "active",
      cancel_at_period_end: false,
      items: { data: [{ price: { id: "price_enterprise" } }] },
    });

    const { POST } = await import("@/app/api/stripe/webhook/route");
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(subscriptionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tier: "ENTERPRISE",
          maxApps: 100,
          maxUsers: 50,
          stripePriceId: "price_enterprise",
          status: "ACTIVE",
          cancelAtPeriodEnd: false,
        }),
      }),
    );
  });

  it("updates tier when subscription updated with PRO price ID", async () => {
    const req = makeWebhookReq("customer.subscription.updated", {
      id: "sub_stripe_pro",
      status: "active",
      cancel_at_period_end: false,
      items: { data: [{ price: { id: "price_pro" } }] },
    });

    const { POST } = await import("@/app/api/stripe/webhook/route");
    await POST(req);

    expect(subscriptionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tier: "PRO",
          maxApps: 15,
          maxUsers: 10,
          stripePriceId: "price_pro",
        }),
      }),
    );
  });

  it("does not update tier when subscription updated with unknown price ID", async () => {
    const req = makeWebhookReq("customer.subscription.updated", {
      id: "sub_stripe_123",
      status: "active",
      cancel_at_period_end: false,
      items: { data: [{ price: { id: "price_unknown_xyz" } }] },
    });

    const { POST } = await import("@/app/api/stripe/webhook/route");
    const res = await POST(req);
    expect(res.status).toBe(200);

    // status and cancelAtPeriodEnd updated, tier/maxApps/maxUsers NOT included
    expect(subscriptionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "ACTIVE",
          cancelAtPeriodEnd: false,
        }),
      }),
    );
    expect(subscriptionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          tier: expect.anything(),
        }),
      }),
    );
  });

  it("does not update tier when no items in subscription update", async () => {
    const req = makeWebhookReq("customer.subscription.updated", {
      id: "sub_stripe_123",
      status: "past_due",
      cancel_at_period_end: true,
    });

    const { POST } = await import("@/app/api/stripe/webhook/route");
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(subscriptionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PAST_DUE",
          cancelAtPeriodEnd: true,
        }),
      }),
    );
    expect(subscriptionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          tier: expect.anything(),
        }),
      }),
    );
  });

  it("skips update when no matching subscription in DB", async () => {
    subscriptionFindFirst.mockResolvedValue(null);
    const req = makeWebhookReq("customer.subscription.updated", {
      id: "sub_not_found",
      status: "active",
      cancel_at_period_end: false,
    });

    const { POST } = await import("@/app/api/stripe/webhook/route");
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(subscriptionUpdate).not.toHaveBeenCalled();
  });

  it("updates to ENTERPRISE_PLUS tier correctly", async () => {
    const req = makeWebhookReq("customer.subscription.updated", {
      id: "sub_ep",
      status: "active",
      cancel_at_period_end: false,
      items: { data: [{ price: { id: "price_enterprise_plus" } }] },
    });

    const { POST } = await import("@/app/api/stripe/webhook/route");
    await POST(req);

    expect(subscriptionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tier: "ENTERPRISE_PLUS",
          maxApps: 999,
          maxUsers: 999,
        }),
      }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NH-1: MCP trigger_scan — rate limit
// ─────────────────────────────────────────────────────────────────────────────
describe("NH-1: MCP trigger_scan — rate limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiKeyFindFirst.mockResolvedValue(makeApiKey("org-pro"));
    apiKeyUpdate.mockResolvedValue({});
    subscriptionFindUnique.mockResolvedValue({ tier: "PRO" });
    auditLogCreate.mockResolvedValue({});
    monitoredAppFindFirst.mockResolvedValue({
      id: "app-1",
      orgId: "org-pro",
      name: "Test App",
      url: "https://test.com",
    });
    getOrgLimits.mockResolvedValue({ tier: "PRO", maxApps: 15, maxUsers: 10 });
    runHttpScanForApp.mockResolvedValue({
      appId: "app-1",
      status: "completed",
      findingsCount: 0,
      responseTimeMs: 100,
    });
    checkRateLimit.mockResolvedValue({ allowed: true });
  });

  function makeMcpReq(toolArgs: Record<string, unknown>) {
    return new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": "Bearer vs_testkey",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "trigger_scan", arguments: toolArgs },
      }),
    });
  }

  it("returns rate limit error when rate limit is exceeded", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 3600 });

    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(makeMcpReq({ appId: "app-1" }));
    expect(res.status).toBe(200);

    const json = await res.json();
    const content = JSON.parse(json.result.content[0].text) as { error: string };
    expect(content.error).toContain("Rate limit exceeded");
    expect(runHttpScanForApp).not.toHaveBeenCalled();
  });

  it("proceeds with scan when rate limit allows", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    const res = await POST(makeMcpReq({ appId: "app-1" }));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.result).toBeDefined();
    expect(runHttpScanForApp).toHaveBeenCalledWith("app-1");
  });

  it("uses correct rate limit key scoped to org", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    await POST(makeMcpReq({ appId: "app-1" }));

    expect(checkRateLimit).toHaveBeenCalledWith(
      "mcp-scan:org-pro",
      expect.objectContaining({ maxAttempts: 50, windowMs: 86400000 }),
    );
  });

  it("applies 200/day limit for ENTERPRISE tier", async () => {
    getOrgLimits.mockResolvedValue({ tier: "ENTERPRISE", maxApps: 100, maxUsers: 50 });

    const { POST } = await import("@/app/api/mcp/route");
    await POST(makeMcpReq({ appId: "app-1" }));

    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ maxAttempts: 200 }),
    );
  });

  it("applies 10/day limit for STARTER tier", async () => {
    getOrgLimits.mockResolvedValue({ tier: "STARTER", maxApps: 5, maxUsers: 2 });

    const { POST } = await import("@/app/api/mcp/route");
    await POST(makeMcpReq({ appId: "app-1" }));

    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ maxAttempts: 10 }),
    );
  });

  it("applies 3/day fallback limit for FREE tier", async () => {
    getOrgLimits.mockResolvedValue({ tier: "FREE", maxApps: 2, maxUsers: 1 });

    const { POST } = await import("@/app/api/mcp/route");
    await POST(makeMcpReq({ appId: "app-1" }));

    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ maxAttempts: 3 }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NH-2: internal/changes/report — PRO+ tier, ADMIN/OWNER only
// ─────────────────────────────────────────────────────────────────────────────
describe("NH-2: GET /api/internal/changes/report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue(adminSession("org-pro"));
    getOrgLimits.mockResolvedValue({ tier: "PRO" });
    parseRange.mockReturnValue({ from: new Date(), to: new Date() });
    getChangeAuditReport.mockResolvedValue({ changes: [] });
  });

  function makeReq() {
    return new NextRequest("http://localhost/api/internal/changes/report");
  }

  it("returns 403 when requireRole throws (non-admin/owner)", async () => {
    requireRole.mockRejectedValue(new Error("Forbidden"));

    const { GET } = await import("@/app/api/internal/changes/report/route");
    const res = await GET(makeReq());
    expect(res.status).toBe(403);
  });

  it("returns 403 for FREE tier", async () => {
    getOrgLimits.mockResolvedValue({ tier: "FREE" });

    const { GET } = await import("@/app/api/internal/changes/report/route");
    const res = await GET(makeReq());
    expect(res.status).toBe(403);
  });

  it("returns 403 for STARTER tier", async () => {
    getOrgLimits.mockResolvedValue({ tier: "STARTER" });

    const { GET } = await import("@/app/api/internal/changes/report/route");
    const res = await GET(makeReq());
    expect(res.status).toBe(403);
  });

  it("returns 200 for PRO tier admin", async () => {
    const { GET } = await import("@/app/api/internal/changes/report/route");
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
  });

  it("returns 200 for ENTERPRISE tier admin", async () => {
    getOrgLimits.mockResolvedValue({ tier: "ENTERPRISE" });

    const { GET } = await import("@/app/api/internal/changes/report/route");
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
  });

  it("returns 200 for ENTERPRISE_PLUS tier admin", async () => {
    getOrgLimits.mockResolvedValue({ tier: "ENTERPRISE_PLUS" });

    const { GET } = await import("@/app/api/internal/changes/report/route");
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
  });
});

describe("NH-2: GET /api/internal/gtm/baseline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue(adminSession("org-pro"));
    getOrgLimits.mockResolvedValue({ tier: "PRO" });
    parseRange.mockReturnValue({ from: new Date(), to: new Date() });
    getGtmBaseline.mockResolvedValue({ baseline: [] });
  });

  function makeReq() {
    return new NextRequest("http://localhost/api/internal/gtm/baseline");
  }

  it("returns 403 when requireRole throws", async () => {
    requireRole.mockRejectedValue(new Error("Forbidden"));

    const { GET } = await import("@/app/api/internal/gtm/baseline/route");
    const res = await GET(makeReq());
    expect(res.status).toBe(403);
  });

  it("returns 403 for FREE tier", async () => {
    getOrgLimits.mockResolvedValue({ tier: "FREE" });

    const { GET } = await import("@/app/api/internal/gtm/baseline/route");
    const res = await GET(makeReq());
    expect(res.status).toBe(403);
  });

  it("returns 403 for STARTER tier", async () => {
    getOrgLimits.mockResolvedValue({ tier: "STARTER" });

    const { GET } = await import("@/app/api/internal/gtm/baseline/route");
    const res = await GET(makeReq());
    expect(res.status).toBe(403);
  });

  it("returns 200 for PRO tier admin", async () => {
    const { GET } = await import("@/app/api/internal/gtm/baseline/route");
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
  });

  it("returns 200 for ENTERPRISE tier admin", async () => {
    getOrgLimits.mockResolvedValue({ tier: "ENTERPRISE" });

    const { GET } = await import("@/app/api/internal/gtm/baseline/route");
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
  });
});

describe("NH-2: GET /api/internal/incidents/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue(adminSession("org-ent"));
    getOrgLimits.mockResolvedValue({ tier: "ENTERPRISE" });
    parseRange.mockReturnValue({ from: new Date(), to: new Date() });
    getIncidentEvidenceExport.mockResolvedValue({ incidents: [] });
  });

  function makeReq() {
    return new NextRequest("http://localhost/api/internal/incidents/export");
  }

  it("returns 403 when requireRole throws (non-admin/owner)", async () => {
    requireRole.mockRejectedValue(new Error("Forbidden"));

    const { GET } = await import("@/app/api/internal/incidents/export/route");
    const res = await GET(makeReq());
    expect(res.status).toBe(403);
  });

  it("returns 403 for FREE tier", async () => {
    getOrgLimits.mockResolvedValue({ tier: "FREE" });

    const { GET } = await import("@/app/api/internal/incidents/export/route");
    const res = await GET(makeReq());
    expect(res.status).toBe(403);
  });

  it("returns 403 for STARTER tier", async () => {
    getOrgLimits.mockResolvedValue({ tier: "STARTER" });

    const { GET } = await import("@/app/api/internal/incidents/export/route");
    const res = await GET(makeReq());
    expect(res.status).toBe(403);
  });

  it("returns 403 for PRO tier (requires ENTERPRISE+)", async () => {
    getOrgLimits.mockResolvedValue({ tier: "PRO" });

    const { GET } = await import("@/app/api/internal/incidents/export/route");
    const res = await GET(makeReq());
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("Enterprise");
  });

  it("returns 200 for ENTERPRISE tier admin", async () => {
    const { GET } = await import("@/app/api/internal/incidents/export/route");
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
  });

  it("returns 200 for ENTERPRISE_PLUS tier admin", async () => {
    getOrgLimits.mockResolvedValue({ tier: "ENTERPRISE_PLUS" });

    const { GET } = await import("@/app/api/internal/incidents/export/route");
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NM-1: GET /api/ops/kpis — tier gate
// ─────────────────────────────────────────────────────────────────────────────
describe("NM-1: GET /api/ops/kpis — tier gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ id: "user-1", orgId: "org-starter", role: "ADMIN" });
    getOrgLimits.mockResolvedValue({ tier: "STARTER" });
    getOrgOpsKpis.mockResolvedValue({ p50: 100, p95: 200, uptime: 99.9 });
  });

  it("returns 401 when session is missing", async () => {
    getSession.mockResolvedValue(null);

    const { GET } = await import("@/app/api/ops/kpis/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for FREE tier", async () => {
    getOrgLimits.mockResolvedValue({ tier: "FREE" });

    const { GET } = await import("@/app/api/ops/kpis/route");
    const res = await GET();
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("Starter");
  });

  it("returns 403 for EXPIRED tier", async () => {
    getOrgLimits.mockResolvedValue({ tier: "EXPIRED" });

    const { GET } = await import("@/app/api/ops/kpis/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 200 for STARTER tier", async () => {
    const { GET } = await import("@/app/api/ops/kpis/route");
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("returns 200 for PRO tier", async () => {
    getOrgLimits.mockResolvedValue({ tier: "PRO" });

    const { GET } = await import("@/app/api/ops/kpis/route");
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("returns 200 for ENTERPRISE tier", async () => {
    getOrgLimits.mockResolvedValue({ tier: "ENTERPRISE" });

    const { GET } = await import("@/app/api/ops/kpis/route");
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("returns 200 for ENTERPRISE_PLUS tier", async () => {
    getOrgLimits.mockResolvedValue({ tier: "ENTERPRISE_PLUS" });

    const { GET } = await import("@/app/api/ops/kpis/route");
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("returns kpis payload for allowed tier", async () => {
    const { GET } = await import("@/app/api/ops/kpis/route");
    const res = await GET();
    const json = await res.json();
    expect(json.kpis).toBeDefined();
    expect(json.kpis.uptime).toBe(99.9);
  });
});
