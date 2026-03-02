/**
 * security-audit-24.test.ts
 *
 * Tests for Audit-24 security fixes:
 *  1. API key deletion — role check (MEMBER/VIEWER must get 403)
 *  2. Agent scan POST — rate limiting
 *  3. Weekly report — cron path removed (no cross-tenant data leakage)
 *  4. Alerts test — rate limiting added
 *  5. Alerts test — internal error messages not leaked to client
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));

// ─── DB mocks ─────────────────────────────────────────────────────────────────
const apiKeyFindFirst = vi.fn();
const apiKeyDelete = vi.fn();
const alertConfigFindFirst = vi.fn();
const monitoredAppFindFirst = vi.fn();
const monitoredAppFindMany = vi.fn();
const monitoredAppCreate = vi.fn();
const monitoredAppUpdate = vi.fn();
const monitorRunCreate = vi.fn();
const findingFindMany = vi.fn();
const auditLogCreate = vi.fn();
const auditLogCreateMany = vi.fn();
const organizationFindMany = vi.fn();
const subscriptionFindUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    apiKey: {
      findFirst: apiKeyFindFirst,
      delete: apiKeyDelete,
    },
    alertConfig: {
      findFirst: alertConfigFindFirst,
    },
    monitoredApp: {
      findFirst: monitoredAppFindFirst,
      findMany: monitoredAppFindMany,
      create: monitoredAppCreate,
      update: monitoredAppUpdate,
    },
    monitorRun: {
      create: monitorRunCreate,
    },
    finding: {
      findMany: findingFindMany,
    },
    auditLog: {
      create: auditLogCreate,
      createMany: auditLogCreateMany,
    },
    organization: {
      findMany: organizationFindMany,
    },
    subscription: {
      findUnique: subscriptionFindUnique,
    },
  },
}));

// ─── Auth mocks ───────────────────────────────────────────────────────────────
const getSession = vi.fn();
const requireRole = vi.fn();

vi.mock("@/lib/auth", () => ({ getSession, requireRole }));

// ─── Rate limit mocks ─────────────────────────────────────────────────────────
const checkRateLimit = vi.fn();
const getClientIp = vi.fn().mockReturnValue("1.2.3.4");

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit, getClientIp }));

// ─── Tenant mocks ─────────────────────────────────────────────────────────────
const logAudit = vi.fn();
const getOrgLimits = vi.fn();

vi.mock("@/lib/tenant", () => ({ logAudit, getOrgLimits }));

// ─── Alerts mock ──────────────────────────────────────────────────────────────
const sendTestNotification = vi.fn();
const sendCriticalFindingsAlert = vi.fn();

vi.mock("@/lib/alerts", () => ({ sendTestNotification, sendCriticalFindingsAlert }));

// ─── Scanner mock ─────────────────────────────────────────────────────────────
vi.mock("@/lib/scanner-http", () => ({
  runHttpScanForApp: vi.fn().mockResolvedValue({ runId: "run-1", appId: "app-1", status: "HEALTHY", findingsCount: 0 }),
}));

// ─── Observability mock ───────────────────────────────────────────────────────
vi.mock("@/lib/observability", () => ({ logApiError: vi.fn() }));
vi.mock("@/lib/endpoint-discovery", () => ({ discoverEndpoints: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/scanner-auth", () => ({ runAuthScan: vi.fn().mockResolvedValue([]) }));

// ─── Session stubs ────────────────────────────────────────────────────────────
const OWNER_SESSION = {
  id: "u-owner",
  email: "owner@example.com",
  name: "Owner",
  role: "OWNER" as const,
  orgId: "org-1",
  orgName: "TestOrg",
  orgSlug: "testorg",
};

const ADMIN_SESSION = { ...OWNER_SESSION, id: "u-admin", role: "ADMIN" as const };
const MEMBER_SESSION = { ...OWNER_SESSION, id: "u-member", role: "MEMBER" as const };
const VIEWER_SESSION = { ...OWNER_SESSION, id: "u-viewer", role: "VIEWER" as const };

beforeAll(() => {
  process.env.JWT_SECRET = "test-jwt-secret-audit-24";
  process.env.CRON_SECRET = "super-secret-cron-value";
});

beforeEach(() => {
  vi.clearAllMocks();
  // Default: rate limit allows all
  checkRateLimit.mockResolvedValue({ allowed: true });
  logAudit.mockResolvedValue(undefined);
  getOrgLimits.mockResolvedValue({ tier: "PRO", maxApps: 10, maxUsers: 10, status: "ACTIVE" });
  sendTestNotification.mockResolvedValue(undefined);
  sendCriticalFindingsAlert.mockResolvedValue(undefined);
  auditLogCreate.mockResolvedValue({});
  auditLogCreateMany.mockResolvedValue({});
  monitoredAppUpdate.mockResolvedValue({});
});

function makeReq(body: unknown, method = "POST", headers: Record<string, string> = {}) {
  return new Request("http://localhost", {
    method,
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "1.2.3.4",
      ...headers,
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. API Key Deletion — Role Check
// ═════════════════════════════════════════════════════════════════════════════
describe("A24-1: API key deletion role check", () => {
  it("source: keys/[id]/route.ts includes role check for OWNER/ADMIN", () => {
    const src = readFileSync(resolve(__dir, "../keys/[id]/route.ts"), "utf8");
    expect(src).toMatch(/OWNER.*ADMIN|ADMIN.*OWNER/);
    expect(src).toContain("includes(session.role)");
  });

  it("returns 403 when MEMBER tries to delete an API key", async () => {
    getSession.mockResolvedValue(MEMBER_SESSION);

    const { DELETE } = await import("@/app/api/keys/[id]/route");
    const res = await DELETE(
      makeReq(null, "DELETE"),
      { params: Promise.resolve({ id: "key-1" }) },
    );

    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/admin/i);
  });

  it("returns 403 when VIEWER tries to delete an API key", async () => {
    getSession.mockResolvedValue(VIEWER_SESSION);

    const { DELETE } = await import("@/app/api/keys/[id]/route");
    const res = await DELETE(
      makeReq(null, "DELETE"),
      { params: Promise.resolve({ id: "key-1" }) },
    );

    expect(res.status).toBe(403);
  });

  it("allows OWNER to delete a key", async () => {
    getSession.mockResolvedValue(OWNER_SESSION);
    apiKeyFindFirst.mockResolvedValue({
      id: "key-1",
      orgId: "org-1",
      name: "My Key",
    });
    apiKeyDelete.mockResolvedValue({});

    const { DELETE } = await import("@/app/api/keys/[id]/route");
    const res = await DELETE(
      makeReq(null, "DELETE"),
      { params: Promise.resolve({ id: "key-1" }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("allows ADMIN to delete a key", async () => {
    getSession.mockResolvedValue(ADMIN_SESSION);
    apiKeyFindFirst.mockResolvedValue({
      id: "key-1",
      orgId: "org-1",
      name: "My Key",
    });
    apiKeyDelete.mockResolvedValue({});

    const { DELETE } = await import("@/app/api/keys/[id]/route");
    const res = await DELETE(
      makeReq(null, "DELETE"),
      { params: Promise.resolve({ id: "key-1" }) },
    );

    expect(res.status).toBe(200);
  });

  it("returns 401 for unauthenticated request", async () => {
    getSession.mockResolvedValue(null);

    const { DELETE } = await import("@/app/api/keys/[id]/route");
    const res = await DELETE(
      makeReq(null, "DELETE"),
      { params: Promise.resolve({ id: "key-1" }) },
    );

    expect(res.status).toBe(401);
  });

  it("returns 404 when key not found (org mismatch)", async () => {
    getSession.mockResolvedValue(OWNER_SESSION);
    apiKeyFindFirst.mockResolvedValue(null); // key not in org

    const { DELETE } = await import("@/app/api/keys/[id]/route");
    const res = await DELETE(
      makeReq(null, "DELETE"),
      { params: Promise.resolve({ id: "key-other-org" }) },
    );

    expect(res.status).toBe(404);
    // Verify DB was queried with orgId scoping
    expect(apiKeyFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orgId: OWNER_SESSION.orgId }) }),
    );
  });

  it("MEMBER cannot delete key even if they know the ID", async () => {
    getSession.mockResolvedValue(MEMBER_SESSION);
    // Even if the key exists and belongs to the org, role check fires first
    apiKeyFindFirst.mockResolvedValue({ id: "key-1", orgId: "org-1", name: "Target Key" });

    const { DELETE } = await import("@/app/api/keys/[id]/route");
    const res = await DELETE(
      makeReq(null, "DELETE"),
      { params: Promise.resolve({ id: "key-1" }) },
    );

    expect(res.status).toBe(403);
    // apiKeyDelete must NOT have been called
    expect(apiKeyDelete).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Agent Scan POST — Rate Limiting
// ═════════════════════════════════════════════════════════════════════════════
describe("A24-2: Agent scan POST rate limiting", () => {
  const VALID_AGENT_TOKEN = "sa_validagentkey12345678901234567890";

  function makeAgentScanReq(body: unknown) {
    return new Request("http://localhost/api/agent/scan", {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${VALID_AGENT_TOKEN}`,
      },
    });
  }

  const MOCK_APP = {
    id: "app-1",
    orgId: "org-1",
    name: "My App",
    url: "https://example.com",
    agentEnabled: true,
    agentKeyHash: "abc123",
  };

  it("source: agent/scan/route.ts imports checkRateLimit", () => {
    const src = readFileSync(resolve(__dir, "../agent/scan/route.ts"), "utf8");
    expect(src).toContain("checkRateLimit");
  });

  it("source: agent/scan/route.ts calls checkRateLimit with per-app key", () => {
    const src = readFileSync(resolve(__dir, "../agent/scan/route.ts"), "utf8");
    expect(src).toContain("agent-scan:");
  });

  it("returns 429 when rate limit is exceeded for agent scan POST", async () => {
    monitoredAppFindFirst.mockResolvedValue(MOCK_APP);
    subscriptionFindUnique.mockResolvedValue({ tier: "PRO", status: "ACTIVE" });
    checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });

    const { POST } = await import("@/app/api/agent/scan/route");
    const res = await POST(makeAgentScanReq({ findings: [], responseTimeMs: 100 }));

    expect(res.status).toBe(429);
    const body = await res.json() as { error: string };
    expect(body.error).toBeTruthy();
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });

  it("returns 401 when agent key is invalid (rate limit not hit)", async () => {
    monitoredAppFindFirst.mockResolvedValue(null);
    checkRateLimit.mockResolvedValue({ allowed: true });

    const { POST } = await import("@/app/api/agent/scan/route");
    const res = await POST(makeAgentScanReq({ findings: [] }));

    expect(res.status).toBe(401);
  });

  it("rate limit key is scoped per app (not per org)", () => {
    // Source inspection: rate limit key should use app.id, not orgId
    const src = readFileSync(resolve(__dir, "../agent/scan/route.ts"), "utf8");
    // The key should reference app.id (which is the result of resolveAppFromBearer)
    expect(src).toContain("agent-scan:");
    // Verify it uses app.id scope (not org-level)
    expect(src).toMatch(/agent-scan.*app\.id/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Weekly Report — cron path removed (no cross-tenant data leakage)
// ═════════════════════════════════════════════════════════════════════════════
describe("A24-3: Weekly report — cron path removed", () => {
  it("source: reports/weekly/route.ts does NOT contain isCron variable", () => {
    const src = readFileSync(resolve(__dir, "../reports/weekly/route.ts"), "utf8");
    expect(src).not.toContain("isCron");
  });

  it("source: reports/weekly/route.ts does NOT reference process.env.CRON_SECRET at runtime", () => {
    const src = readFileSync(resolve(__dir, "../reports/weekly/route.ts"), "utf8");
    // The removed cron path used `process.env.CRON_SECRET` for comparison —
    // that runtime reference must be gone (mentions in comments are fine).
    expect(src).not.toContain("process.env.CRON_SECRET");
  });

  it("source: reports/weekly/route.ts does NOT return all-orgs data (no findMany on organization)", () => {
    const src = readFileSync(resolve(__dir, "../reports/weekly/route.ts"), "utf8");
    // The cron path used db.organization.findMany — it should be gone
    expect(src).not.toContain("organization.findMany");
    expect(src).not.toContain("db.organization");
  });

  it("returns 401 when unauthenticated (session-only path)", async () => {
    getSession.mockResolvedValue(null);

    const { GET } = await import("@/app/api/reports/weekly/route");
    const res = await GET();

    expect(res.status).toBe(401);
  });

  it("returns 403 when org is on FREE tier", async () => {
    getSession.mockResolvedValue(OWNER_SESSION);
    getOrgLimits.mockResolvedValue({ tier: "FREE" });

    const { GET } = await import("@/app/api/reports/weekly/route");
    const res = await GET();

    expect(res.status).toBe(403);
  });

  it("returns 200 with only the authenticated org's data (not all orgs)", async () => {
    getSession.mockResolvedValue(OWNER_SESSION);
    getOrgLimits.mockResolvedValue({ tier: "PRO" });
    monitoredAppFindMany.mockResolvedValue([
      {
        name: "My App",
        ownerEmail: "owner@example.com",
        status: "HEALTHY",
        lastCheckedAt: new Date(),
        monitorRuns: [],
      },
    ]);

    const { GET } = await import("@/app/api/reports/weekly/route");
    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json() as { report: unknown[] };
    // Should return report (array), not reports (nested per-org array)
    expect(body).toHaveProperty("report");
    expect(Array.isArray(body.report)).toBe(true);
    expect(body).not.toHaveProperty("reports");

    // monitoredApp.findMany should have been called with orgId scoping
    expect(monitoredAppFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ orgId: OWNER_SESSION.orgId }),
      }),
    );
    // organization.findMany must NOT have been called
    expect(organizationFindMany).not.toHaveBeenCalled();
  });

  it("sending Authorization: Bearer <CRON_SECRET> with a valid session does NOT return all-org data", async () => {
    // This simulates the attack: a logged-in user who knows the CRON_SECRET value
    // sends it in the Authorization header hoping to trigger the old cron path that
    // returned all-org data.  The cron path has been removed entirely — the handler
    // no longer accepts a request parameter, so the Authorization header cannot
    // even reach route logic.  We set CRON_SECRET in env to confirm the route
    // never reads it and always returns per-org scoped data.
    process.env.CRON_SECRET = "test-cron-secret-value";
    getSession.mockResolvedValue(OWNER_SESSION);
    getOrgLimits.mockResolvedValue({ tier: "PRO" });
    monitoredAppFindMany.mockResolvedValue([]);

    const { GET } = await import("@/app/api/reports/weekly/route");
    // Pass the Authorization header to fully simulate the attack vector:
    // even with the cron secret present, the route must return per-org data only.
    const attackReq = new Request("http://localhost/api/reports/weekly", {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const res = await GET(attackReq);

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    // Must return per-org format ("report"), NOT all-org format ("reports")
    expect(body).toHaveProperty("report");
    expect(body).not.toHaveProperty("reports");
    // organization.findMany must NOT have been called
    expect(organizationFindMany).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limit exceeded", async () => {
    getSession.mockResolvedValue(OWNER_SESSION);
    getOrgLimits.mockResolvedValue({ tier: "PRO" });
    checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });

    const { GET } = await import("@/app/api/reports/weekly/route");
    const res = await GET();

    expect(res.status).toBe(429);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Alerts Test — Rate Limiting
// ═════════════════════════════════════════════════════════════════════════════
describe("A24-4: Alerts test endpoint — rate limiting", () => {
  it("source: alerts/test/route.ts imports checkRateLimit", () => {
    const src = readFileSync(resolve(__dir, "../alerts/test/route.ts"), "utf8");
    expect(src).toContain("checkRateLimit");
  });

  it("source: alerts/test/route.ts calls checkRateLimit with per-org key", () => {
    const src = readFileSync(resolve(__dir, "../alerts/test/route.ts"), "utf8");
    expect(src).toContain("alerts-test:");
  });

  it("returns 429 when rate limit is exceeded", async () => {
    getSession.mockResolvedValue(OWNER_SESSION);
    checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });

    const { POST } = await import("@/app/api/alerts/test/route");
    const res = await POST(makeReq({ configId: "cfg-1" }));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
  });

  it("returns 401 for unauthenticated request", async () => {
    getSession.mockResolvedValue(null);

    const { POST } = await import("@/app/api/alerts/test/route");
    const res = await POST(makeReq({ configId: "cfg-1" }));

    expect(res.status).toBe(401);
  });

  it("returns 404 when config not found in org", async () => {
    getSession.mockResolvedValue(OWNER_SESSION);
    alertConfigFindFirst.mockResolvedValue(null);

    const { POST } = await import("@/app/api/alerts/test/route");
    const res = await POST(makeReq({ configId: "cfg-999" }));

    expect(res.status).toBe(404);
  });

  it("returns 200 when config found and notification sent", async () => {
    getSession.mockResolvedValue(OWNER_SESSION);
    alertConfigFindFirst.mockResolvedValue({ id: "cfg-1", orgId: "org-1" });
    sendTestNotification.mockResolvedValue(undefined);

    const { POST } = await import("@/app/api/alerts/test/route");
    const res = await POST(makeReq({ configId: "cfg-1" }));

    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. Alerts Test — Error Message Not Leaked
// ═════════════════════════════════════════════════════════════════════════════
describe("A24-5: Alerts test — internal error messages not leaked", () => {
  const INTERNAL_DETAIL = "ECONNREFUSED 10.0.0.1:443 (internal webhook host)";

  it("returns a generic error message when sendTestNotification throws", async () => {
    getSession.mockResolvedValue(OWNER_SESSION);
    alertConfigFindFirst.mockResolvedValue({ id: "cfg-1", orgId: "org-1" });
    sendTestNotification.mockRejectedValue(new Error(INTERNAL_DETAIL));

    const { POST } = await import("@/app/api/alerts/test/route");
    const res = await POST(makeReq({ configId: "cfg-1" }));

    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    // Must NOT echo the raw internal error detail
    expect(body.error).not.toContain(INTERNAL_DETAIL);
    expect(body.error).not.toContain("ECONNREFUSED");
    expect(body.error).not.toContain("10.0.0.1");
    // Must return a generic user-facing message
    expect(body.error).toBeTruthy();
    expect(typeof body.error).toBe("string");
  });

  it("source: alerts/test/route.ts does NOT echo error.message to client", () => {
    const src = readFileSync(resolve(__dir, "../alerts/test/route.ts"), "utf8");
    // The old pattern was: `error: error instanceof Error ? error.message : "..."`
    // This must be gone
    expect(src).not.toContain("error.message");
    // Must have console.error for server-side logging
    expect(src).toContain("console.error");
  });

  it("source: alerts/test/route.ts returns a static generic error string", () => {
    const src = readFileSync(resolve(__dir, "../alerts/test/route.ts"), "utf8");
    // Should contain a fixed generic error string, not a dynamic one
    expect(src).toContain("Failed to send test notification");
  });
});
