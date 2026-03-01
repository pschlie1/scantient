/**
 * security-audit-8.test.ts
 * Tests for 14 fixes shipped in fix/security-audit-8:
 *
 * A8-1:  Invite password min 8→12 (parity with signup)
 * A8-2:  Login per-email rate limit (blocks brute-force via IP rotation)
 * A8-3:  v1/scan/[id] adds tier-based rate limit (was zero)
 * A8-4:  v1/scan uses tier-based 24h bucket instead of flat 10/hr
 * A8-5:  CI scan (public/ci-scan) adds rate limit
 * A8-6:  agent/pending adds 60/hr rate limit (prevents DB hammering)
 * A8-7:  compliance/score caps findMany at 2000
 * A8-8:  dashboard caps findings per run (take:50 + select)
 * A8-9:  v1/apps caps findMany at 200
 * A8-10: v1/dashboard caps findMany at 200
 * A8-11: MCP list_apps caps at 200
 * A8-12: MCP get_remediation_metrics caps findings at 5000
 * A8-13: reports/weekly caps apps+runs+findings
 * A8-14: reports/evidence validates date range (max 1 year, to > from)
 *
 * NOTE (audit-10 fix): All vi.mock calls must be at module level to work with
 * Vitest's hoisting. The previous version used vi.mock inside beforeAll() which
 * broke when Vitest hoisted calls before the closure variables were defined.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── @/lib/db — comprehensive mock covering all describe blocks ───────────────
const inviteFindUnique = vi.fn();
const inviteDelete = vi.fn();
const userFindFirst = vi.fn();
const userCreate = vi.fn();
const monitoredAppFindFirst = vi.fn();
const monitoredAppFindMany = vi.fn();
const monitoredAppCount = vi.fn();
const monitoredAppUpdate = vi.fn();
const monitoredAppCreate = vi.fn();
const monitorRunFindFirst = vi.fn();
const monitorRunFindMany = vi.fn();
const findingFindMany = vi.fn();
const findingCount = vi.fn();
const findingUpdate = vi.fn();
const subscriptionFindUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    invite: { findUnique: inviteFindUnique, delete: inviteDelete },
    user: { findFirst: userFindFirst, create: userCreate },
    monitoredApp: {
      findFirst: monitoredAppFindFirst,
      findMany: monitoredAppFindMany,
      count: monitoredAppCount,
      update: monitoredAppUpdate,
      create: monitoredAppCreate,
    },
    monitorRun: { findFirst: monitorRunFindFirst, findMany: monitorRunFindMany },
    finding: { findMany: findingFindMany, count: findingCount, update: findingUpdate },
    subscription: { findUnique: subscriptionFindUnique },
  },
}));

// ─── @/lib/auth ───────────────────────────────────────────────────────────────
const hashPassword = vi.fn();
const verifyPassword = vi.fn();
const createSession = vi.fn();
const getSession = vi.fn();

vi.mock("@/lib/auth", () => ({ hashPassword, verifyPassword, createSession, getSession }));

// ─── @/lib/tenant ─────────────────────────────────────────────────────────────
const canAddUser = vi.fn();
const canAddApp = vi.fn();
const getOrgLimits = vi.fn();
const logAudit = vi.fn();

vi.mock("@/lib/tenant", () => ({ canAddUser, canAddApp, getOrgLimits, logAudit }));

// ─── @/lib/rate-limit ─────────────────────────────────────────────────────────
const checkRateLimit = vi.fn();
const getClientIp = vi.fn();

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit, getClientIp }));

// ─── @/lib/api-auth ───────────────────────────────────────────────────────────
const authenticateApiKey = vi.fn();
const authenticateApiKeyHeader = vi.fn();

vi.mock("@/lib/api-auth", () => ({ authenticateApiKey, authenticateApiKeyHeader }));

// ─── @/lib/scanner-http ───────────────────────────────────────────────────────
const runHttpScanForApp = vi.fn();
vi.mock("@/lib/scanner-http", () => ({ runHttpScanForApp }));

// ─── @/lib/observability ─────────────────────────────────────────────────────
const logApiError = vi.fn();
vi.mock("@/lib/observability", () => ({ logApiError }));

// ─── @/lib/compliance-score ──────────────────────────────────────────────────
const calculateComplianceScore = vi.fn();
vi.mock("@/lib/compliance-score", () => ({ calculateComplianceScore }));

// ─── @/lib/pdf-report ────────────────────────────────────────────────────────
const generateEvidencePack = vi.fn();
const generateComplianceReport = vi.fn();
vi.mock("@/lib/pdf-report", () => ({ generateEvidencePack, generateComplianceReport }));

// ─── next/headers (cookies) ───────────────────────────────────────────────────
const cookiesSet = vi.fn();
const cookiesGet = vi.fn();
const cookiesDelete = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ set: cookiesSet, get: cookiesGet, delete: cookiesDelete }),
}));

// ─── ssrf-guard ───────────────────────────────────────────────────────────────
vi.mock("@/lib/ssrf-guard", () => ({
  isPrivateUrl: vi.fn().mockResolvedValue(false),
  isPrivateIp: vi.fn().mockReturnValue(false),
  ssrfSafeFetch: vi.fn(),
}));

// ─── Global beforeEach: reset all mocks ──────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  // Safe defaults
  hashPassword.mockResolvedValue("hashed");
  createSession.mockResolvedValue({ id: "u1", email: "user@example.com", orgId: "org1", role: "MEMBER", orgName: "Test", orgSlug: "test" });
  verifyPassword.mockResolvedValue(false);
  getSession.mockResolvedValue({ id: "u1", email: "user@example.com", orgId: "org1", role: "OWNER", orgName: "Test", orgSlug: "test" });
  checkRateLimit.mockResolvedValue({ allowed: true });
  getClientIp.mockReturnValue("1.2.3.4");
  authenticateApiKey.mockResolvedValue("org1");
  authenticateApiKeyHeader.mockResolvedValue("org1");
  getOrgLimits.mockResolvedValue({ tier: "PRO", maxApps: 15, maxUsers: 10 });
  canAddUser.mockResolvedValue({ allowed: true });
  canAddApp.mockResolvedValue({ allowed: true });
  logAudit.mockResolvedValue(undefined);
  logApiError.mockResolvedValue(undefined);
  calculateComplianceScore.mockReturnValue({ soc2: 80 });
  generateEvidencePack.mockResolvedValue(Buffer.from("pdf"));
  generateComplianceReport.mockResolvedValue(Buffer.from("pdf"));
  userFindFirst.mockResolvedValue(null);
  userCreate.mockResolvedValue({ id: "u1" });
  monitoredAppFindFirst.mockResolvedValue(null);
  monitoredAppFindMany.mockResolvedValue([]);
  monitoredAppCount.mockResolvedValue(0);
  monitoredAppUpdate.mockResolvedValue({});
  monitoredAppCreate.mockResolvedValue({ id: "app1" });
  monitorRunFindFirst.mockResolvedValue(null);
  monitorRunFindMany.mockResolvedValue([]);
  findingFindMany.mockResolvedValue([]);
  findingCount.mockResolvedValue(0);
  findingUpdate.mockResolvedValue({});
  subscriptionFindUnique.mockResolvedValue({ tier: "PRO" });
  runHttpScanForApp.mockResolvedValue({ runId: "r1", appId: "app1", status: "HEALTHY", findingsCount: 0, responseTimeMs: 100 });
  inviteFindUnique.mockResolvedValue(null);
  inviteDelete.mockResolvedValue({});
});

// ─────────────────────────────────────────────────────────────────────────────
// A8-1: Invite password min 8 → 12
// ─────────────────────────────────────────────────────────────────────────────
describe("A8-1: Invite /api/auth/invite/[token] — password min 12", () => {
  const FUTURE = new Date(Date.now() + 86_400_000);

  function makeReq(body: unknown) {
    return new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("returns 400 when password is fewer than 12 characters", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      token: "tok", email: "a@b.com", role: "MEMBER", orgId: "org1",
      expiresAt: FUTURE, org: { name: "Org", id: "org1" },
    });
    const { POST } = await import("@/app/api/auth/invite/[token]/route");
    const res = await POST(
      makeReq({ name: "Alice", password: "short" }),
      { params: Promise.resolve({ token: "tok" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is exactly 11 characters (just under limit)", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      token: "tok", email: "a@b.com", role: "MEMBER", orgId: "org1",
      expiresAt: FUTURE, org: { name: "Org", id: "org1" },
    });
    const { POST } = await import("@/app/api/auth/invite/[token]/route");
    const res = await POST(
      makeReq({ name: "Alice", password: "11charpass1" }),
      { params: Promise.resolve({ token: "tok" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 201 when password is exactly 12 characters", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      token: "tok12", email: "a@b.com", role: "MEMBER", orgId: "org1",
      expiresAt: FUTURE, org: { name: "Org", id: "org1" },
    });
    userFindFirst.mockResolvedValueOnce(null);
    userCreate.mockResolvedValueOnce({ id: "u2" });
    inviteDelete.mockResolvedValueOnce({});
    createSession.mockResolvedValueOnce({ id: "u2" });

    const { POST } = await import("@/app/api/auth/invite/[token]/route");
    const res = await POST(
      makeReq({ name: "Alice", password: "12charpasswd" }),
      { params: Promise.resolve({ token: "tok12" }) },
    );
    expect(res.status).toBe(201);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A8-2: Login per-email rate limit
// ─────────────────────────────────────────────────────────────────────────────
describe("A8-2: POST /api/auth/login — per-email rate limit", () => {
  function makeReq(body: unknown) {
    return new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("blocks login when per-IP rate limit exceeded", async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 900 });
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(makeReq({ email: "user@corp.com", password: "correctpassword" }));
    expect(res.status).toBe(429);
  });

  it("blocks login when per-email rate limit exceeded (second call blocked)", async () => {
    checkRateLimit
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 3600 });

    userFindFirst.mockResolvedValueOnce({
      id: "u1", email: "target@corp.com", passwordHash: "hash",
      emailVerified: true, org: { id: "org1" },
    });

    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(makeReq({ email: "target@corp.com", password: "wrongpassword" }));
    expect(res.status).toBe(429);
  });

  it("checks per-email with lowercase email key", async () => {
    userFindFirst.mockResolvedValueOnce(null);

    const { POST } = await import("@/app/api/auth/login/route");
    await POST(makeReq({ email: "User@Corp.COM", password: "wrongpass" }));

    const secondCall = checkRateLimit.mock.calls[1];
    if (secondCall) {
      expect(secondCall[0]).toBe("login-email:user@corp.com");
    }
  });

  it("allows login when both rate limits pass and credentials valid", async () => {
    userFindFirst.mockResolvedValueOnce({
      id: "u1", email: "ok@corp.com", passwordHash: "hash",
      emailVerified: true, org: { id: "org1" },
    });
    verifyPassword.mockResolvedValueOnce(true);
    createSession.mockResolvedValueOnce({ id: "u1", email: "ok@corp.com" });

    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(makeReq({ email: "ok@corp.com", password: "correctpassword" }));
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A8-3: v1/scan/[id] — tier-based rate limit added
// ─────────────────────────────────────────────────────────────────────────────
describe("A8-3: POST /api/v1/scan/[id] — tier-based rate limit", () => {
  function postReq() {
    return new Request("http://localhost", {
      method: "POST",
      headers: { Authorization: "Bearer vs_key" },
    });
  }

  it("returns 401 without valid API key", async () => {
    authenticateApiKey.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/v1/scan/[id]/route");
    const res = await POST(postReq(), { params: Promise.resolve({ id: "app1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 429 when tier rate limit exceeded", async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 3600 });
    const { POST } = await import("@/app/api/v1/scan/[id]/route");
    const res = await POST(postReq(), { params: Promise.resolve({ id: "app1" }) });
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toMatch(/Scan limit reached/);
  });

  it("returns 404 when app not found", async () => {
    monitoredAppFindFirst.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/v1/scan/[id]/route");
    const res = await POST(postReq(), { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("uses manual-scan bucket shared with UI (prevents bypass)", async () => {
    monitoredAppFindFirst.mockResolvedValueOnce({ id: "app1", orgId: "org1" });
    runHttpScanForApp.mockResolvedValueOnce({ runId: "run1", appId: "app1", status: "HEALTHY", findingsCount: 0 });

    const { POST } = await import("@/app/api/v1/scan/[id]/route");
    await POST(postReq(), { params: Promise.resolve({ id: "app1" }) });

    expect(checkRateLimit).toHaveBeenCalledWith(
      "manual-scan:org1",
      expect.objectContaining({ maxAttempts: 50, windowMs: 86400000 }),
    );
  });

  it("uses FREE limits (3/day) when org is FREE tier", async () => {
    getOrgLimits.mockResolvedValueOnce({ tier: "FREE", maxApps: 2, maxUsers: 1 });
    monitoredAppFindFirst.mockResolvedValueOnce({ id: "app1", orgId: "org1" });
    runHttpScanForApp.mockResolvedValueOnce({ runId: "r1", appId: "app1", status: "HEALTHY", findingsCount: 0 });

    const { POST } = await import("@/app/api/v1/scan/[id]/route");
    await POST(postReq(), { params: Promise.resolve({ id: "app1" }) });

    expect(checkRateLimit).toHaveBeenCalledWith(
      "manual-scan:org1",
      expect.objectContaining({ maxAttempts: 3 }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A8-4: v1/scan — replaced flat 10/hr with tier-based 24h bucket
// ─────────────────────────────────────────────────────────────────────────────
describe("A8-4: POST /api/v1/scan — tier-based 24h rate limit", () => {
  function postReq(body: unknown) {
    return new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", Authorization: "Bearer vs_key" },
    });
  }

  beforeEach(() => {
    authenticateApiKey.mockResolvedValue("org_v1");
    getOrgLimits.mockResolvedValue({ tier: "STARTER", maxApps: 5, maxUsers: 2 });
  });

  it("uses manual-scan bucket (not old api-scan bucket)", async () => {
    monitoredAppFindFirst.mockResolvedValueOnce({ id: "a1", orgId: "org_v1" });
    runHttpScanForApp.mockResolvedValueOnce({ runId: "r1", appId: "a1", status: "HEALTHY", findingsCount: 0, responseTimeMs: 100 });

    const { POST } = await import("@/app/api/v1/scan/route");
    await POST(postReq({ appId: "a1" }));

    expect(checkRateLimit).toHaveBeenCalledWith(
      "manual-scan:org_v1",
      expect.objectContaining({ windowMs: 86400000 }),
    );
    const bucketNames = checkRateLimit.mock.calls.map((c) => c[0]);
    expect(bucketNames).not.toContain("api-scan:org_v1");
  });

  it("returns 429 with tier-based error message", async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 3600 });

    const { POST } = await import("@/app/api/v1/scan/route");
    const res = await POST(postReq({ appId: "a1" }));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toMatch(/STARTER/);
  });

  it("uses ENTERPRISE limits (200/day) for enterprise orgs", async () => {
    getOrgLimits.mockResolvedValueOnce({ tier: "ENTERPRISE", maxApps: 100, maxUsers: 50 });
    monitoredAppFindFirst.mockResolvedValueOnce({ id: "a1", orgId: "org_v1" });
    runHttpScanForApp.mockResolvedValueOnce({ runId: "r1", appId: "a1", status: "HEALTHY", findingsCount: 0, responseTimeMs: 100 });

    const { POST } = await import("@/app/api/v1/scan/route");
    await POST(postReq({ appId: "a1" }));

    expect(checkRateLimit).toHaveBeenCalledWith(
      "manual-scan:org_v1",
      expect.objectContaining({ maxAttempts: 200 }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A8-5: CI scan rate limit
// ─────────────────────────────────────────────────────────────────────────────
describe("A8-5: POST /api/public/ci-scan — rate limit enforced", () => {
  function postReq(body: unknown) {
    return new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", "x-api-key": "vs_key" },
    });
  }

  beforeEach(() => {
    authenticateApiKeyHeader.mockResolvedValue("org_ci");
    getOrgLimits.mockResolvedValue({ tier: "PRO", maxApps: 15, maxUsers: 10 });
  });

  it("returns 401 without valid API key", async () => {
    authenticateApiKeyHeader.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/public/ci-scan/route");
    const res = await POST(postReq({ url: "https://app.example.com" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limit exceeded", async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 3600 });
    const { POST } = await import("@/app/api/public/ci-scan/route");
    const res = await POST(postReq({ url: "https://app.example.com" }));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toMatch(/CI scan limit reached/);
  });

  it("uses manual-scan shared bucket", async () => {
    monitoredAppFindFirst.mockResolvedValueOnce({ id: "app1", orgId: "org_ci" });
    runHttpScanForApp.mockResolvedValueOnce({ runId: "r1", appId: "app1", status: "HEALTHY", findingsCount: 0 });
    findingFindMany.mockResolvedValueOnce([]);

    const { POST } = await import("@/app/api/public/ci-scan/route");
    await POST(postReq({ url: "https://app.example.com" }));

    expect(checkRateLimit).toHaveBeenCalledWith(
      "manual-scan:org_ci",
      expect.objectContaining({ maxAttempts: 50, windowMs: 86400000 }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A8-6: agent/pending — polling rate limit
// ─────────────────────────────────────────────────────────────────────────────
describe("A8-6: GET /api/agent/pending — polling rate limit", () => {
  function makeReq() {
    return new Request("http://localhost", {
      headers: { Authorization: "Bearer sa_valid_key" },
    });
  }

  beforeEach(() => {
    subscriptionFindUnique.mockResolvedValue({ tier: "PRO" });
    getOrgLimits.mockResolvedValue({ tier: "PRO", maxApps: 15, maxUsers: 10 });
  });

  it("returns 429 when polling rate limit exceeded", async () => {
    monitoredAppFindFirst.mockResolvedValueOnce({ id: "app1", orgId: "org1", agentEnabled: true });
    checkRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 60 });

    const { GET } = await import("@/app/api/agent/pending/route");
    const res = await GET(makeReq());
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toMatch(/too frequently/i);
  });

  it("uses per-app rate limit bucket", async () => {
    monitoredAppFindFirst.mockResolvedValueOnce({ id: "app_xyz", orgId: "org1", agentEnabled: true });
    monitoredAppUpdate.mockResolvedValueOnce({});

    const { GET } = await import("@/app/api/agent/pending/route");
    await GET(makeReq());

    expect(checkRateLimit).toHaveBeenCalledWith(
      "agent-pending:app_xyz",
      expect.objectContaining({ maxAttempts: 60, windowMs: 3600000 }),
    );
  });

  it("allows polling when within rate limit", async () => {
    monitoredAppFindFirst.mockResolvedValueOnce({ id: "app1", orgId: "org1", agentEnabled: true });
    monitoredAppUpdate.mockResolvedValueOnce({});

    const { GET } = await import("@/app/api/agent/pending/route");
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.scanRequested).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A8-7: compliance/score — take:2000 cap
// ─────────────────────────────────────────────────────────────────────────────
describe("A8-7: GET /api/compliance/score — findings capped at 2000", () => {
  it("calls findMany with take:2000", async () => {
    const { GET } = await import("@/app/api/compliance/score/route");
    await GET();

    expect(findingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 2000 }),
    );
  });

  it("returns 403 for FREE tier", async () => {
    getOrgLimits.mockResolvedValueOnce({ tier: "FREE" });
    const { GET } = await import("@/app/api/compliance/score/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A8-8: dashboard — findings per run capped with take + select
// ─────────────────────────────────────────────────────────────────────────────
describe("A8-8: GET /api/dashboard — findings per run bounded", () => {
  it("includes take:50 on nested findings", async () => {
    monitoredAppCount.mockResolvedValue(3);
    findingCount.mockResolvedValue(2);
    monitorRunFindMany.mockResolvedValue([]);

    const { GET } = await import("@/app/api/dashboard/route");
    await GET();

    const call = monitorRunFindMany.mock.calls[0]?.[0];
    expect(call?.include?.findings?.take).toBe(50);
  });

  it("includes select on nested findings (not full include: true)", async () => {
    monitoredAppCount.mockResolvedValue(3);
    findingCount.mockResolvedValue(2);
    monitorRunFindMany.mockResolvedValue([]);

    const { GET } = await import("@/app/api/dashboard/route");
    await GET();

    const call = monitorRunFindMany.mock.calls[0]?.[0];
    expect(call?.include?.findings?.select).toBeDefined();
    expect(typeof call?.include?.findings).not.toBe("boolean");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A8-9: v1/apps — take:200 cap
// ─────────────────────────────────────────────────────────────────────────────
describe("A8-9: GET /api/v1/apps — capped at 200", () => {
  it("calls findMany with take:200", async () => {
    const { GET } = await import("@/app/api/v1/apps/route");
    await GET(new Request("http://localhost", { headers: { Authorization: "Bearer vs_key" } }));

    expect(monitoredAppFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A8-10: v1/dashboard — take:200 cap
// ─────────────────────────────────────────────────────────────────────────────
describe("A8-10: GET /api/v1/dashboard — capped at 200", () => {
  it("calls findMany with take:200", async () => {
    const { GET } = await import("@/app/api/v1/dashboard/route");
    await GET(new Request("http://localhost", { headers: { Authorization: "Bearer vs_key" } }));

    expect(monitoredAppFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A8-11: MCP list_apps — take:200 cap
// ─────────────────────────────────────────────────────────────────────────────
describe("A8-11: POST /api/mcp — list_apps capped at 200", () => {
  function mcpReq(method: string, params?: Record<string, unknown>) {
    return new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      headers: { "content-type": "application/json", Authorization: "Bearer vs_key" },
    });
  }

  it("list_apps uses take:200", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    await POST(mcpReq("tools/call", { name: "list_apps", arguments: {} }));

    expect(monitoredAppFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A8-12: MCP get_remediation_metrics — take:5000 cap
// ─────────────────────────────────────────────────────────────────────────────
describe("A8-12: POST /api/mcp — get_remediation_metrics capped at 5000", () => {
  function mcpReq(method: string, params?: Record<string, unknown>) {
    return new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      headers: { "content-type": "application/json", Authorization: "Bearer vs_key" },
    });
  }

  beforeEach(() => {
    monitoredAppFindMany.mockResolvedValue([{ id: "a1" }, { id: "a2" }]);
  });

  it("get_remediation_metrics caps findings at 5000", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    await POST(mcpReq("tools/call", { name: "get_remediation_metrics", arguments: {} }));

    const findingCall = findingFindMany.mock.calls.find((c) => c[0]?.take === 5000);
    expect(findingCall).toBeDefined();
  });

  it("get_remediation_metrics caps apps at 200", async () => {
    const { POST } = await import("@/app/api/mcp/route");
    await POST(mcpReq("tools/call", { name: "get_remediation_metrics", arguments: {} }));

    const appsCall = monitoredAppFindMany.mock.calls.find((c) => c[0]?.take === 200);
    expect(appsCall).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A8-13: reports/weekly — bounded apps+runs+findings
// ─────────────────────────────────────────────────────────────────────────────
describe("A8-13: GET /api/reports/weekly — bounded queries", () => {
  function makeReq() {
    return new Request("http://localhost");
  }

  it("caps apps at 100 in user path", async () => {
    const { GET } = await import("@/app/api/reports/weekly/route");
    await GET(makeReq());

    expect(monitoredAppFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });

  it("uses select on findings (not include: true) in user path", async () => {
    const { GET } = await import("@/app/api/reports/weekly/route");
    await GET(makeReq());

    const call = monitoredAppFindMany.mock.calls[0]?.[0];
    const findingsConfig = call?.include?.monitorRuns?.include?.findings;
    expect(findingsConfig).toBeDefined();
    expect(findingsConfig?.select).toBeDefined();
    expect(findingsConfig?.take).toBe(200);
  });

  it("returns 403 for FREE tier", async () => {
    getOrgLimits.mockResolvedValueOnce({ tier: "FREE" });
    const { GET } = await import("@/app/api/reports/weekly/route");
    const res = await GET(makeReq());
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A8-14: reports/evidence — date range validation
// ─────────────────────────────────────────────────────────────────────────────
describe("A8-14: GET /api/reports/evidence — date range validation", () => {
  function makeNextReq(params: Record<string, string>) {
    const url = new URL("http://localhost/api/reports/evidence");
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return Object.assign(new Request(url.toString()), { nextUrl: url });
  }

  it("returns 400 when 'to' is before 'from'", async () => {
    const { GET } = await import("@/app/api/reports/evidence/route");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(makeNextReq({ from: "2026-06-01", to: "2026-01-01", framework: "soc2" }) as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/'to' date must be after/);
  });

  it("returns 400 when range exceeds 1 year", async () => {
    const { GET } = await import("@/app/api/reports/evidence/route");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(makeNextReq({ from: "2024-01-01", to: "2026-01-02", framework: "soc2" }) as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/1 year/);
  });

  it("returns 400 when framework is invalid", async () => {
    const { GET } = await import("@/app/api/reports/evidence/route");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(makeNextReq({ from: "2026-01-01", to: "2026-06-01", framework: "pci" }) as any);
    expect(res.status).toBe(400);
  });

  it("returns 403 for FREE tier", async () => {
    getOrgLimits.mockResolvedValueOnce({ tier: "FREE" });
    const { GET } = await import("@/app/api/reports/evidence/route");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(makeNextReq({ from: "2026-01-01", to: "2026-06-01", framework: "soc2" }) as any);
    expect(res.status).toBe(403);
  });

  it("returns 200 (PDF) with valid params within range", async () => {
    const { GET } = await import("@/app/api/reports/evidence/route");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(makeNextReq({ from: "2026-01-01", to: "2026-06-01", framework: "soc2" }) as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });
});
