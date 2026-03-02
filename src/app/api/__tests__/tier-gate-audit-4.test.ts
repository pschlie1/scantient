/**
 * tier-gate-audit-4.test.ts
 *
 * Tests for audit-4 security and business logic fixes:
 *  Fix 1: Alert dispatch respects current org tier
 *  Fix 2: Agent endpoints re-check tier after downgrade
 *  Fix 3: Agent scan code injection — finding code allowlist
 *  Fix 4: EXPIRED/CANCELED orgs are skipped by cron scanner
 *  Fix 5: Team member removal and role management
 *
 * NOTE: Fix 1 tests the real sendCriticalFindingsAlert, so @/lib/alerts is NOT
 * mocked at the module level. Fix 4 only tests the early-return path, which
 * exits before sendCriticalFindingsAlert is called.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, randomBytes } from "crypto";

// ─── Auth mock ────────────────────────────────────────────────────────────────
const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession }));

// ─── Tenant mock ──────────────────────────────────────────────────────────────
const getOrgLimits = vi.fn();
const logAudit = vi.fn();
vi.mock("@/lib/tenant", () => ({ getOrgLimits, logAudit }));

// ─── DB mock ─────────────────────────────────────────────────────────────────
const monitoredAppFindFirst = vi.fn();
const monitoredAppFindUnique = vi.fn();
const monitoredAppUpdate = vi.fn();
const monitorRunCreate = vi.fn();
const monitorRunUpdate = vi.fn();
const alertConfigFindMany = vi.fn();
const alertConfigFindUnique = vi.fn();
const notificationCreate = vi.fn();
const userFindFirst = vi.fn();
const userDelete = vi.fn();
const userUpdate = vi.fn();
const auditLogFindFirst = vi.fn();
const auditLogCreate = vi.fn();
const apiKeyDeleteMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    monitoredApp: {
      findFirst: monitoredAppFindFirst,
      findUnique: monitoredAppFindUnique,
      update: monitoredAppUpdate,
    },
    monitorRun: {
      create: monitorRunCreate,
      update: monitorRunUpdate,
      findUnique: vi.fn().mockResolvedValue({ id: "run_1", findings: [] }),
    },
    alertConfig: {
      findMany: alertConfigFindMany,
      findUnique: alertConfigFindUnique,
    },
    notification: { create: notificationCreate, findFirst: vi.fn().mockResolvedValue(null) },
    user: {
      findFirst: userFindFirst,
      delete: userDelete,
      update: userUpdate,
    },
    auditLog: {
      findFirst: auditLogFindFirst,
      create: auditLogCreate,
    },
    apiKey: {
      deleteMany: apiKeyDeleteMany,
    },
    integrationConfig: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

// ─── Analytics mock ───────────────────────────────────────────────────────────
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

// ─── Security mocks (all check functions return empty arrays) ─────────────────
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
  checkUptimeStatus: vi.fn().mockReturnValue([]),
  scanJavaScriptForKeys: vi.fn().mockReturnValue([]),
}));

vi.mock("@/lib/content-hash", () => ({
  computeContentHash: vi.fn().mockReturnValue("hash123"),
}));

vi.mock("@/lib/remediation-lifecycle", () => ({
  autoTriageFinding: vi.fn().mockResolvedValue(undefined),
  verifyResolvedFindings: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/auth-headers", () => ({
  decryptAuthHeaders: vi.fn().mockReturnValue([]),
}));
vi.mock("@/lib/endpoint-discovery", () => ({ discoverEndpoints: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/scanner-auth", () => ({ runAuthScan: vi.fn().mockResolvedValue([]) }));

// ─── Helpers ─────────────────────────────────────────────────────────────────
function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function generateKey() {
  const raw = `sa_${randomBytes(32).toString("base64url")}`;
  return { raw, hash: sha256(raw) };
}

function makeRequest(method: string, body?: unknown, headers?: Record<string, string>) {
  return new Request("http://localhost", {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const MOCK_APP = {
  id: "app_1",
  name: "Test App",
  url: "https://example.com",
  orgId: "org_a",
  ownerEmail: "owner@example.com",
  authHeaders: null,
  org: { id: "org_a", name: "TestOrg" },
};

beforeEach(() => {
  vi.clearAllMocks();
  notificationCreate.mockResolvedValue({});
  logAudit.mockResolvedValue(undefined);
  monitorRunCreate.mockResolvedValue({ id: "run_1" });
  monitorRunUpdate.mockResolvedValue({});
  monitoredAppUpdate.mockResolvedValue({});
  auditLogFindFirst.mockResolvedValue(null);
  auditLogCreate.mockResolvedValue({});
  apiKeyDeleteMany.mockResolvedValue({ count: 0 });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 1: Alert dispatch respects current org tier
// ─────────────────────────────────────────────────────────────────────────────
describe("Fix 1: Alert tier enforcement — sendCriticalFindingsAlert", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("STARTER tier — SLACK config is skipped, EMAIL config is sent", async () => {
    process.env.RESEND_API_KEY = "test-resend-key";

    monitoredAppFindUnique.mockResolvedValue(MOCK_APP);
    alertConfigFindMany.mockResolvedValue([
      {
        id: "cfg_slack",
        channel: "SLACK",
        destination: "https://hooks.slack.com/services/test",
        minSeverity: "HIGH",
        enabled: true,
        orgId: "org_a",
      },
      {
        id: "cfg_email",
        channel: "EMAIL",
        destination: "security@example.com",
        minSeverity: "HIGH",
        enabled: true,
        orgId: "org_a",
      },
    ]);
    getOrgLimits.mockResolvedValue({ tier: "STARTER", status: "ACTIVE" });

    const mockFetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    const { sendCriticalFindingsAlert } = await import("@/lib/alerts");
    const promise = sendCriticalFindingsAlert("app_1", [
      {
        code: "MISSING_HEADER_CONTENT_SECURITY_POLICY",
        title: "CSP missing",
        description: "No CSP",
        severity: "HIGH",
        fixPrompt: "Add CSP",
      },
    ]);
    await vi.runAllTimersAsync();
    await promise;

    // Should have called fetch exactly once (EMAIL only — Resend API)
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe("https://api.resend.com/emails");
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body.to).toContain("security@example.com");

    // Only one notification logged (the EMAIL one)
    expect(notificationCreate).toHaveBeenCalledTimes(1);
    const notifData = notificationCreate.mock.calls[0][0].data;
    expect(notifData.alertConfigId).toBe("cfg_email");
  });

  it("EXPIRED tier — all configs skipped, no alerts sent", async () => {
    monitoredAppFindUnique.mockResolvedValue(MOCK_APP);
    alertConfigFindMany.mockResolvedValue([
      {
        id: "cfg_email",
        channel: "EMAIL",
        destination: "security@example.com",
        minSeverity: "HIGH",
        enabled: true,
        orgId: "org_a",
      },
      {
        id: "cfg_slack",
        channel: "SLACK",
        destination: "https://hooks.slack.com/services/test",
        minSeverity: "HIGH",
        enabled: true,
        orgId: "org_a",
      },
      {
        id: "cfg_webhook",
        channel: "WEBHOOK",
        destination: "https://example.com/webhook",
        minSeverity: "HIGH",
        enabled: true,
        orgId: "org_a",
      },
    ]);
    getOrgLimits.mockResolvedValue({ tier: "EXPIRED", status: "CANCELED" });

    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const { sendCriticalFindingsAlert } = await import("@/lib/alerts");
    const promise = sendCriticalFindingsAlert("app_1", [
      {
        code: "NO_HTTPS",
        title: "No HTTPS",
        description: "Site is HTTP",
        severity: "CRITICAL",
        fixPrompt: "Use HTTPS",
      },
    ]);
    await vi.runAllTimersAsync();
    await promise;

    // No alerts dispatched (fetch is only called if alerts are sent)
    expect(mockFetch).not.toHaveBeenCalled();
    expect(notificationCreate).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 2: Agent endpoints re-check tier after downgrade
// ─────────────────────────────────────────────────────────────────────────────
describe("Fix 2: resolveAppFromBearer rejects non-PRO+ orgs", () => {
  it("FREE org agent key — POST /api/agent/scan returns 401", async () => {
    const { raw, hash } = generateKey();
    monitoredAppFindFirst.mockResolvedValue({
      id: "app_1",
      orgId: "org_a",
      agentKeyHash: hash,
      agentEnabled: true,
    });
    getOrgLimits.mockResolvedValue({ tier: "FREE" });

    const { POST } = await import("@/app/api/agent/scan/route");
    const res = await POST(
      makeRequest("POST", { findings: [] }, { Authorization: `Bearer ${raw}` }),
    );
    expect(res.status).toBe(401);
  });

  it("STARTER org agent key — POST /api/agent/scan returns 401", async () => {
    const { raw, hash } = generateKey();
    monitoredAppFindFirst.mockResolvedValue({
      id: "app_1",
      orgId: "org_a",
      agentKeyHash: hash,
      agentEnabled: true,
    });
    getOrgLimits.mockResolvedValue({ tier: "STARTER" });

    const { POST } = await import("@/app/api/agent/scan/route");
    const res = await POST(
      makeRequest("POST", { findings: [] }, { Authorization: `Bearer ${raw}` }),
    );
    expect(res.status).toBe(401);
  });

  it("PRO org agent key — POST /api/agent/scan is authorized (not 401)", async () => {
    const { raw, hash } = generateKey();
    monitoredAppFindFirst.mockResolvedValue({
      id: "app_1",
      orgId: "org_a",
      agentKeyHash: hash,
      agentEnabled: true,
    });
    getOrgLimits.mockResolvedValue({ tier: "PRO" });
    monitorRunCreate.mockResolvedValue({ id: "run_1" });

    const { POST } = await import("@/app/api/agent/scan/route");
    const res = await POST(
      makeRequest("POST", { findings: [] }, { Authorization: `Bearer ${raw}` }),
    );
    expect(res.status).not.toBe(401);
  });

  it("EXPIRED org agent key — GET /api/agent/pending returns 401", async () => {
    const { raw, hash } = generateKey();
    monitoredAppFindFirst.mockResolvedValue({
      id: "app_1",
      orgId: "org_a",
      agentKeyHash: hash,
      agentEnabled: true,
    });
    getOrgLimits.mockResolvedValue({ tier: "EXPIRED" });

    const { GET } = await import("@/app/api/agent/pending/route");
    const res = await GET(makeRequest("GET", undefined, { Authorization: `Bearer ${raw}` }));
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 3: Agent scan code injection — finding code allowlist
// ─────────────────────────────────────────────────────────────────────────────
describe("Fix 3: Finding code allowlist", () => {
  function setupValidBearerApp() {
    const { raw, hash } = generateKey();
    monitoredAppFindFirst.mockResolvedValue({
      id: "app_1",
      orgId: "org_a",
      agentKeyHash: hash,
      agentEnabled: true,
    });
    getOrgLimits.mockResolvedValue({ tier: "PRO" });
    monitorRunCreate.mockResolvedValue({ id: "run_1" });
    return raw;
  }

  it("valid finding code is accepted — returns 200", async () => {
    const raw = setupValidBearerApp();
    const { POST } = await import("@/app/api/agent/scan/route");
    const res = await POST(
      makeRequest(
        "POST",
        {
          findings: [
            {
              code: "MISSING_HEADER_CONTENT_SECURITY_POLICY",
              title: "CSP missing",
              description: "No CSP header found",
              severity: "HIGH",
              fixPrompt: "Add Content-Security-Policy header",
            },
          ],
        },
        { Authorization: `Bearer ${raw}` },
      ),
    );
    expect(res.status).toBe(200);
  });

  it("invalid finding code returns 400 with descriptive error", async () => {
    const raw = setupValidBearerApp();
    const { POST } = await import("@/app/api/agent/scan/route");
    const res = await POST(
      makeRequest(
        "POST",
        {
          findings: [
            {
              code: "TOTALLY_FAKE_INJECTION_CODE",
              title: "Injected",
              description: "This code is not valid",
              severity: "CRITICAL",
              fixPrompt: "nothing",
            },
          ],
        },
        { Authorization: `Bearer ${raw}` },
      ),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).toContain("Invalid finding code");
  });

  it("201 findings in body returns 400 (exceeds max 200)", async () => {
    const raw = setupValidBearerApp();
    const { POST } = await import("@/app/api/agent/scan/route");
    const tooManyFindings = Array.from({ length: 201 }, (_, i) => ({
      code: "MISSING_HEADER_CONTENT_SECURITY_POLICY",
      title: `Finding ${i}`,
      description: "desc",
      severity: "LOW",
      fixPrompt: "fix",
    }));

    const res = await POST(
      makeRequest("POST", { findings: tooManyFindings }, { Authorization: `Bearer ${raw}` }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).toContain("200");
  });

  it("exactly 200 findings accepted — returns 200", async () => {
    const raw = setupValidBearerApp();
    monitorRunCreate.mockResolvedValue({ id: "run_200" });

    const { POST } = await import("@/app/api/agent/scan/route");
    const maxFindings = Array.from({ length: 200 }, (_, i) => ({
      code: "MISSING_HEADER_CONTENT_SECURITY_POLICY",
      title: `Finding ${i}`,
      description: "desc",
      severity: "LOW" as const,
      fixPrompt: "fix",
    }));

    const res = await POST(
      makeRequest("POST", { findings: maxFindings }, { Authorization: `Bearer ${raw}` }),
    );
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 4: EXPIRED/CANCELED orgs skipped by cron scanner
// ─────────────────────────────────────────────────────────────────────────────
describe("Fix 4: EXPIRED/CANCELED org scan skipped in runHttpScanForApp", () => {
  it("CANCELED status — returns skipped result and defers nextCheckAt by 24h", async () => {
    monitoredAppFindUnique.mockResolvedValue(MOCK_APP);
    getOrgLimits.mockResolvedValue({ tier: "EXPIRED", status: "CANCELED" });

    const { runHttpScanForApp } = await import("@/lib/scanner-http");
    const result = await runHttpScanForApp("app_1", { source: "cron" });

    expect(result.runId).toBe("skipped");
    expect(result.findingsCount).toBe(0);
    expect(result.status).toBe("HEALTHY");

    expect(monitoredAppUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "app_1" },
        data: expect.objectContaining({
          nextCheckAt: expect.any(Date),
        }),
      }),
    );

    // MonitorRun should NOT be created for a skipped scan
    expect(monitorRunCreate).not.toHaveBeenCalled();
  });

  it("EXPIRED tier with non-CANCELED status — scan is also skipped", async () => {
    monitoredAppFindUnique.mockResolvedValue(MOCK_APP);
    getOrgLimits.mockResolvedValue({ tier: "EXPIRED", status: "TRIALING" });

    const { runHttpScanForApp } = await import("@/lib/scanner-http");
    const result = await runHttpScanForApp("app_1");

    expect(result.runId).toBe("skipped");
    expect(monitorRunCreate).not.toHaveBeenCalled();
  });

  it("CANCELED status but non-EXPIRED tier — scan is also skipped", async () => {
    monitoredAppFindUnique.mockResolvedValue(MOCK_APP);
    getOrgLimits.mockResolvedValue({ tier: "PRO", status: "CANCELED" });

    const { runHttpScanForApp } = await import("@/lib/scanner-http");
    const result = await runHttpScanForApp("app_1");

    expect(result.runId).toBe("skipped");
    expect(monitorRunCreate).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 5: Team member removal and role management
// ─────────────────────────────────────────────────────────────────────────────
describe("Fix 5: DELETE /api/team/[id] — member removal", () => {
  const ownerSession = { id: "owner_1", orgId: "org_a", role: "OWNER", name: "Owner" };
  const adminSession = { id: "admin_1", orgId: "org_a", role: "ADMIN", name: "Admin" };

  it("OWNER removes a MEMBER — returns 200 with ok:true", async () => {
    getSession.mockResolvedValue(ownerSession);
    userFindFirst.mockResolvedValue({
      id: "member_1",
      email: "member@example.com",
      role: "MEMBER",
      orgId: "org_a",
    });
    userDelete.mockResolvedValue({});

    const { DELETE } = await import("@/app/api/team/[id]/route");
    const res = await DELETE(makeRequest("DELETE"), {
      params: Promise.resolve({ id: "member_1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(userDelete).toHaveBeenCalledWith({ where: { id: "member_1" } });
  });

  it("ADMIN removes a MEMBER — returns 200", async () => {
    getSession.mockResolvedValue(adminSession);
    userFindFirst.mockResolvedValue({
      id: "member_2",
      email: "member2@example.com",
      role: "MEMBER",
      orgId: "org_a",
    });
    userDelete.mockResolvedValue({});

    const { DELETE } = await import("@/app/api/team/[id]/route");
    const res = await DELETE(makeRequest("DELETE"), {
      params: Promise.resolve({ id: "member_2" }),
    });
    expect(res.status).toBe(200);
  });

  it("cannot remove self — returns 400", async () => {
    getSession.mockResolvedValue(ownerSession);

    const { DELETE } = await import("@/app/api/team/[id]/route");
    const res = await DELETE(makeRequest("DELETE"), {
      params: Promise.resolve({ id: "owner_1" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("yourself");
  });

  it("cannot remove the OWNER — returns 403", async () => {
    getSession.mockResolvedValue(adminSession);
    userFindFirst.mockResolvedValue({
      id: "other_owner",
      email: "owner@example.com",
      role: "OWNER",
      orgId: "org_a",
    });

    const { DELETE } = await import("@/app/api/team/[id]/route");
    const res = await DELETE(makeRequest("DELETE"), {
      params: Promise.resolve({ id: "other_owner" }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("owner");
  });

  it("MEMBER role cannot delete — returns 403", async () => {
    getSession.mockResolvedValue({ id: "m1", orgId: "org_a", role: "MEMBER" });

    const { DELETE } = await import("@/app/api/team/[id]/route");
    const res = await DELETE(makeRequest("DELETE"), {
      params: Promise.resolve({ id: "member_2" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 if member not found in org", async () => {
    getSession.mockResolvedValue(ownerSession);
    userFindFirst.mockResolvedValue(null);

    const { DELETE } = await import("@/app/api/team/[id]/route");
    const res = await DELETE(makeRequest("DELETE"), {
      params: Promise.resolve({ id: "nonexistent" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 401 without session", async () => {
    getSession.mockResolvedValue(null);

    const { DELETE } = await import("@/app/api/team/[id]/route");
    const res = await DELETE(makeRequest("DELETE"), {
      params: Promise.resolve({ id: "member_1" }),
    });
    expect(res.status).toBe(401);
  });
});

describe("Fix 5: PATCH /api/team/[id] — role change", () => {
  const ownerSession = { id: "owner_1", orgId: "org_a", role: "OWNER", name: "Owner" };
  const adminSession = { id: "admin_1", orgId: "org_a", role: "ADMIN", name: "Admin" };

  it("OWNER changes a MEMBER to ADMIN — returns 200 with updated member", async () => {
    getSession.mockResolvedValue(ownerSession);
    userFindFirst.mockResolvedValue({
      id: "member_1",
      email: "member@example.com",
      role: "MEMBER",
      orgId: "org_a",
    });
    userUpdate.mockResolvedValue({
      id: "member_1",
      name: "Member",
      email: "member@example.com",
      role: "ADMIN",
    });

    const { PATCH } = await import("@/app/api/team/[id]/route");
    const res = await PATCH(makeRequest("PATCH", { role: "ADMIN" }), {
      params: Promise.resolve({ id: "member_1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.member.role).toBe("ADMIN");
  });

  it("ADMIN cannot change roles — returns 403", async () => {
    getSession.mockResolvedValue(adminSession);

    const { PATCH } = await import("@/app/api/team/[id]/route");
    const res = await PATCH(makeRequest("PATCH", { role: "VIEWER" }), {
      params: Promise.resolve({ id: "member_1" }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("owner");
  });

  it("cannot change own role — returns 400", async () => {
    getSession.mockResolvedValue(ownerSession);

    const { PATCH } = await import("@/app/api/team/[id]/route");
    const res = await PATCH(makeRequest("PATCH", { role: "ADMIN" }), {
      params: Promise.resolve({ id: "owner_1" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("own role");
  });

  it("cannot change the OWNER role — returns 403", async () => {
    getSession.mockResolvedValue(ownerSession);
    userFindFirst.mockResolvedValue({
      id: "other_owner",
      email: "owner2@example.com",
      role: "OWNER",
      orgId: "org_a",
    });

    const { PATCH } = await import("@/app/api/team/[id]/route");
    const res = await PATCH(makeRequest("PATCH", { role: "MEMBER" }), {
      params: Promise.resolve({ id: "other_owner" }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("owner");
  });

  it("invalid role value returns 400", async () => {
    getSession.mockResolvedValue(ownerSession);

    const { PATCH } = await import("@/app/api/team/[id]/route");
    const res = await PATCH(makeRequest("PATCH", { role: "SUPERADMIN" }), {
      params: Promise.resolve({ id: "member_1" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 401 without session", async () => {
    getSession.mockResolvedValue(null);

    const { PATCH } = await import("@/app/api/team/[id]/route");
    const res = await PATCH(makeRequest("PATCH", { role: "MEMBER" }), {
      params: Promise.resolve({ id: "member_1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 if target member not found", async () => {
    getSession.mockResolvedValue(ownerSession);
    userFindFirst.mockResolvedValue(null);

    const { PATCH } = await import("@/app/api/team/[id]/route");
    const res = await PATCH(makeRequest("PATCH", { role: "MEMBER" }), {
      params: Promise.resolve({ id: "nonexistent" }),
    });
    expect(res.status).toBe(404);
  });
});
