/**
 * security-audit-5.test.ts
 *
 * Tests for audit-5 security fixes:
 *  Fix 1: Public score SSRF guard (private IP returns 400)
 *  Fix 2: Webhook/Slack destination SSRF guard (private IP destination returns 400)
 *  Fix 3: Jira URL SSRF guard (private IP Jira URL returns 400 on config save)
 *  Fix 4: JWT refresh threshold reduced to 5 minutes (300 seconds)
 *  Fix 5: VIEWER role enforcement on write endpoints
 */

// Set JWT_SECRET before any imports so vi.importActual('@/lib/auth') works in tests
process.env.JWT_SECRET = "test-jwt-secret-for-audit-5";

import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── SSRF guard mock ─────────────────────────────────────────────────────────
const isPrivateUrl = vi.fn<[string], Promise<boolean>>();
vi.mock("@/lib/ssrf-guard", () => ({ isPrivateUrl, isPrivateIp: vi.fn() }));

// ─── Auth mock ────────────────────────────────────────────────────────────────
const getSession = vi.fn();
const requireRole = vi.fn();
// Mock completely so the JWT_SECRET IIFE never runs for route imports
vi.mock("@/lib/auth", () => ({ getSession, requireRole }));

// ─── Tenant mock ──────────────────────────────────────────────────────────────
const getOrgLimits = vi.fn();
const logAudit = vi.fn();
const canAddApp = vi.fn();
vi.mock("@/lib/tenant", () => ({ getOrgLimits, logAudit, canAddApp }));

// ─── Rate-limit mock ──────────────────────────────────────────────────────────
const checkRateLimit = vi.fn();
const getClientIp = vi.fn().mockReturnValue("1.2.3.4");
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit, getClientIp }));

// ─── Security check mocks ─────────────────────────────────────────────────────
vi.mock("@/lib/security", () => ({
  checkSecurityHeaders: vi.fn().mockReturnValue([]),
  checkMetaAndConfig: vi.fn().mockReturnValue([]),
  checkSSLIssues: vi.fn().mockReturnValue([]),
  checkInlineScripts: vi.fn().mockReturnValue([]),
  checkCORSMisconfiguration: vi.fn().mockReturnValue([]),
}));

// ─── DB mock ─────────────────────────────────────────────────────────────────
const alertConfigCreate = vi.fn();
const alertConfigFindFirst = vi.fn();
const alertConfigFindMany = vi.fn();
const alertConfigUpdate = vi.fn();
const alertConfigDelete = vi.fn();
const monitoredAppFindFirst = vi.fn();
const monitoredAppCreate = vi.fn();
const monitoredAppDelete = vi.fn();
const monitoredAppUpdate = vi.fn();
const findingFindFirst = vi.fn();
const findingUpdate = vi.fn();
const auditLogCreate = vi.fn();
const integrationConfigFindUnique = vi.fn();
const integrationConfigUpsert = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    alertConfig: {
      create: alertConfigCreate,
      findFirst: alertConfigFindFirst,
      findMany: alertConfigFindMany,
      update: alertConfigUpdate,
      delete: alertConfigDelete,
    },
    monitoredApp: {
      findFirst: monitoredAppFindFirst,
      findMany: vi.fn().mockResolvedValue([]),
      create: monitoredAppCreate,
      update: monitoredAppUpdate,
      delete: monitoredAppDelete,
      count: vi.fn().mockResolvedValue(0),
    },
    finding: {
      findFirst: findingFindFirst,
      findUnique: vi.fn().mockResolvedValue({ id: "f1", remediationMeta: null }),
      update: findingUpdate,
    },
    auditLog: {
      create: auditLogCreate,
    },
    integrationConfig: {
      findUnique: integrationConfigFindUnique,
      upsert: integrationConfigUpsert,
    },
  },
}));

// ─── Analytics mock ───────────────────────────────────────────────────────────
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

// ─── Types mock ───────────────────────────────────────────────────────────────
vi.mock("@/lib/types", async () => {
  const { z } = await import("zod");
  return {
    createAppSchema: z.object({
      url: z.string().url(),
      name: z.string().optional(),
    }),
  };
});

vi.mock("@/lib/observability", () => ({ logApiError: vi.fn() }));
vi.mock("@/lib/scanner-http", () => ({ runHttpScanForApp: vi.fn() }));
vi.mock("@/lib/crypto-util", () => ({
  obfuscate: vi.fn((v: string) => Buffer.from(v).toString("base64")),
  deobfuscate: vi.fn((v: string) => Buffer.from(v, "base64").toString("utf8")),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }),
}));
vi.mock("@/lib/remediation-lifecycle", () => ({
  parseRemediationMeta: vi.fn().mockReturnValue({ meta: { linkedPRs: [] } }),
  linkPRToFinding: vi.fn().mockResolvedValue({ linkedPRs: [] }),
  addTimelineEvent: vi.fn().mockResolvedValue(undefined),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────
function makeRequest(method: string, body?: unknown, headers?: Record<string, string>) {
  return new Request("http://localhost", {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ─── Session factories ────────────────────────────────────────────────────────
const viewerSession = { id: "user_viewer", orgId: "org_a", role: "VIEWER", email: "viewer@example.com", name: "Viewer" };
const memberSession = { id: "user_member", orgId: "org_a", role: "MEMBER", email: "member@example.com", name: "Member" };
const adminSession = { id: "user_admin", orgId: "org_a", role: "ADMIN", email: "admin@example.com", name: "Admin" };

beforeEach(() => {
  vi.clearAllMocks();
  logAudit.mockResolvedValue(undefined);
  auditLogCreate.mockResolvedValue({});
  alertConfigCreate.mockResolvedValue({ id: "cfg_1", channel: "WEBHOOK", destination: "https://example.com/hook", minSeverity: "HIGH" });
  monitoredAppCreate.mockResolvedValue({ id: "app_1", name: "Test", url: "https://example.com", orgId: "org_a" });
  monitoredAppDelete.mockResolvedValue({});
  monitoredAppUpdate.mockResolvedValue({});
  findingUpdate.mockResolvedValue({ id: "finding_1", status: "ACKNOWLEDGED", notes: null });
  canAddApp.mockResolvedValue({ allowed: true });
  checkRateLimit.mockResolvedValue({ allowed: true });
  getClientIp.mockReturnValue("1.2.3.4");
  getOrgLimits.mockResolvedValue({ tier: "ENTERPRISE", status: "ACTIVE", maxApps: 100 });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 1: Public score SSRF guard
// ─────────────────────────────────────────────────────────────────────────────
describe("Fix 1: Public score SSRF guard", () => {
  it("private IP URL returns 400", async () => {
    isPrivateUrl.mockResolvedValue(true);

    const { POST } = await import("@/app/api/public/score/route");
    const res = await POST(makeRequest("POST", { url: "http://169.254.169.254/latest/meta-data/" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("URL not allowed");
  });

  it("valid public URL proceeds past SSRF check", async () => {
    isPrivateUrl.mockResolvedValue(false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }),
    ));

    const { POST } = await import("@/app/api/public/score/route");
    const res = await POST(makeRequest("POST", { url: "https://example.com" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("score");
    expect(body.error).toBeUndefined();

    vi.unstubAllGlobals();
  });

  it("localhost URL returns 400 (isPrivateUrl blocks it)", async () => {
    isPrivateUrl.mockResolvedValue(true);

    const { POST } = await import("@/app/api/public/score/route");
    const res = await POST(makeRequest("POST", { url: "http://localhost:8080/admin" }));

    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 2: Webhook and Slack destination SSRF guard
// ─────────────────────────────────────────────────────────────────────────────
describe("Fix 2: Webhook SSRF guard in POST /api/alerts", () => {
  it("WEBHOOK destination with private IP returns 400", async () => {
    getSession.mockResolvedValue(adminSession);
    isPrivateUrl.mockResolvedValue(true);

    const { POST } = await import("@/app/api/alerts/route");
    const res = await POST(makeRequest("POST", {
      channel: "WEBHOOK",
      destination: "http://10.0.0.1/internal-webhook",
      minSeverity: "HIGH",
    }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("private or internal address");
  });

  it("SLACK destination with private IP returns 400", async () => {
    getSession.mockResolvedValue(adminSession);
    isPrivateUrl.mockResolvedValue(true);

    const { POST } = await import("@/app/api/alerts/route");
    const res = await POST(makeRequest("POST", {
      channel: "SLACK",
      destination: "http://192.168.1.100/slack-hook",
      minSeverity: "HIGH",
    }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("private or internal address");
  });

  it("WEBHOOK destination with valid public URL passes SSRF check", async () => {
    getSession.mockResolvedValue(adminSession);
    isPrivateUrl.mockResolvedValue(false);

    const { POST } = await import("@/app/api/alerts/route");
    const res = await POST(makeRequest("POST", {
      channel: "WEBHOOK",
      destination: "https://hooks.example.com/webhook",
      minSeverity: "HIGH",
    }));

    // Should not be blocked by SSRF guard
    expect(res.status).not.toBe(400);
  });

  it("EMAIL destination skips SSRF check entirely", async () => {
    getSession.mockResolvedValue(adminSession);
    isPrivateUrl.mockResolvedValue(true); // would block if called

    const { POST } = await import("@/app/api/alerts/route");
    const res = await POST(makeRequest("POST", {
      channel: "EMAIL",
      destination: "user@example.com",
      minSeverity: "HIGH",
    }));

    // EMAIL skips the SSRF guard entirely
    expect(isPrivateUrl).not.toHaveBeenCalled();
    expect(res.status).not.toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 3: Jira URL SSRF guard
// ─────────────────────────────────────────────────────────────────────────────
describe("Fix 3: Jira URL SSRF guard in POST /api/integrations/jira", () => {
  it("private IP Jira URL returns 400 on POST config save", async () => {
    requireRole.mockResolvedValue(adminSession);
    isPrivateUrl.mockResolvedValue(true);

    const { POST } = await import("@/app/api/integrations/jira/route");
    const res = await POST(makeRequest("POST", {
      url: "http://10.0.0.5:8080",
      email: "admin@example.com",
      apiToken: "token123",
      projectKey: "SEC",
      issueType: "Bug",
    }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("public address");
  });

  it("valid public Jira URL passes SSRF check and saves config", async () => {
    requireRole.mockResolvedValue(adminSession);
    isPrivateUrl.mockResolvedValue(false);
    integrationConfigUpsert.mockResolvedValue({ id: "int_1" });

    const { POST } = await import("@/app/api/integrations/jira/route");
    const res = await POST(makeRequest("POST", {
      url: "https://mycompany.atlassian.net",
      email: "admin@example.com",
      apiToken: "token123",
      projectKey: "SEC",
      issueType: "Bug",
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("private IP in jira/test returns 400 before making fetch", async () => {
    requireRole.mockResolvedValue(adminSession);
    integrationConfigFindUnique.mockResolvedValue({
      id: "int_1",
      enabled: true,
      config: {
        url: "http://172.16.0.1",
        email: "admin@example.com",
        apiToken: "dGVzdA==",
        projectKey: "SEC",
        issueType: "Bug",
      },
    });
    isPrivateUrl.mockResolvedValue(true);

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { POST } = await import("@/app/api/integrations/jira/test/route");
    const res = await POST(makeRequest("POST"));

    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 4: JWT refresh threshold is 5 minutes
// ─────────────────────────────────────────────────────────────────────────────
describe("Fix 4: JWT refresh threshold reduced to 5 minutes", () => {
  it("REFRESH_THRESHOLD equals 5 * 60 (300 seconds)", async () => {
    // Use vi.importActual to load the real auth.ts (JWT_SECRET is set at top of file)
    const actualAuth = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
    expect(actualAuth.REFRESH_THRESHOLD).toBe(5 * 60);
    expect(actualAuth.REFRESH_THRESHOLD).toBe(300);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 5: VIEWER role enforcement
// ─────────────────────────────────────────────────────────────────────────────
describe("Fix 5: VIEWER role gets 403 on write operations", () => {
  it("VIEWER gets 403 on POST /api/apps", async () => {
    getSession.mockResolvedValue(viewerSession);

    const { POST } = await import("@/app/api/apps/route");
    const res = await POST(makeRequest("POST", { url: "https://example.com", name: "Test" }));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("read-only");
  });

  it("MEMBER gets 403 on DELETE /api/apps/[id]", async () => {
    getSession.mockResolvedValue(memberSession);

    const { DELETE } = await import("@/app/api/apps/[id]/route");
    const res = await DELETE(makeRequest("DELETE"), {
      params: Promise.resolve({ id: "app_1" }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("read-only");
  });

  it("MEMBER gets 403 on PATCH /api/apps/[id]", async () => {
    getSession.mockResolvedValue(memberSession);

    const { PATCH } = await import("@/app/api/apps/[id]/route");
    const res = await PATCH(makeRequest("PATCH", { name: "New Name" }), {
      params: Promise.resolve({ id: "app_1" }),
    });

    expect(res.status).toBe(403);
  });

  it("VIEWER gets 403 on POST /api/apps/bulk", async () => {
    getSession.mockResolvedValue(viewerSession);

    const { POST } = await import("@/app/api/apps/bulk/route");
    const res = await POST(makeRequest("POST", { apps: [{ url: "https://example.com" }] }));

    expect(res.status).toBe(403);
  });

  it("MEMBER gets 403 on POST /api/apps/bulk", async () => {
    getSession.mockResolvedValue(memberSession);

    const { POST } = await import("@/app/api/apps/bulk/route");
    const res = await POST(makeRequest("POST", { apps: [{ url: "https://example.com" }] }));

    expect(res.status).toBe(403);
  });

  it("VIEWER gets 403 on PATCH /api/findings/[id]", async () => {
    getSession.mockResolvedValue(viewerSession);

    const { PATCH } = await import("@/app/api/findings/[id]/route");
    const res = await PATCH(makeRequest("PATCH", { status: "ACKNOWLEDGED" }), {
      params: Promise.resolve({ id: "finding_1" }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("read-only");
  });

  it("MEMBER can PATCH /api/findings/[id] (not blocked)", async () => {
    getSession.mockResolvedValue(memberSession);
    findingFindFirst.mockResolvedValue({
      id: "finding_1",
      status: "OPEN",
      notes: null,
      severity: "HIGH",
      run: { app: { orgId: "org_a" } },
    });

    const { PATCH } = await import("@/app/api/findings/[id]/route");
    const res = await PATCH(makeRequest("PATCH", { status: "ACKNOWLEDGED" }), {
      params: Promise.resolve({ id: "finding_1" }),
    });

    // MEMBER passes the role check and proceeds
    expect(res.status).not.toBe(403);
  });

  it("VIEWER gets 403 on POST /api/findings/[id]/assign", async () => {
    getSession.mockResolvedValue(viewerSession);

    const { POST } = await import("@/app/api/findings/[id]/assign/route");
    const res = await POST(makeRequest("POST", { userId: "user_2" }), {
      params: Promise.resolve({ id: "finding_1" }),
    });

    expect(res.status).toBe(403);
  });

  it("VIEWER gets 403 on POST /api/findings/[id]/link", async () => {
    getSession.mockResolvedValue(viewerSession);

    const { POST } = await import("@/app/api/findings/[id]/link/route");
    const res = await POST(makeRequest("POST", { url: "https://github.com/org/repo/pull/1" }), {
      params: Promise.resolve({ id: "finding_1" }),
    });

    expect(res.status).toBe(403);
  });

  it("VIEWER gets 403 on POST /api/scan/[id]", async () => {
    getSession.mockResolvedValue(viewerSession);

    const { POST } = await import("@/app/api/scan/[id]/route");
    const res = await POST(makeRequest("POST"), {
      params: Promise.resolve({ id: "app_1" }),
    });

    expect(res.status).toBe(403);
  });

  it("VIEWER gets 403 on POST /api/alerts", async () => {
    getSession.mockResolvedValue(viewerSession);

    const { POST } = await import("@/app/api/alerts/route");
    const res = await POST(makeRequest("POST", {
      channel: "EMAIL",
      destination: "x@example.com",
      minSeverity: "HIGH",
    }));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("read-only");
  });

  it("MEMBER gets 403 on POST /api/alerts", async () => {
    getSession.mockResolvedValue(memberSession);

    const { POST } = await import("@/app/api/alerts/route");
    const res = await POST(makeRequest("POST", {
      channel: "EMAIL",
      destination: "x@example.com",
      minSeverity: "HIGH",
    }));

    expect(res.status).toBe(403);
  });

  it("VIEWER gets 403 on PATCH /api/alerts/[id]", async () => {
    getSession.mockResolvedValue(viewerSession);

    const { PATCH } = await import("@/app/api/alerts/[id]/route");
    const res = await PATCH(makeRequest("PATCH", { enabled: false }), {
      params: Promise.resolve({ id: "cfg_1" }),
    });

    expect(res.status).toBe(403);
  });

  it("MEMBER gets 403 on DELETE /api/alerts/[id]", async () => {
    getSession.mockResolvedValue(memberSession);

    const { DELETE } = await import("@/app/api/alerts/[id]/route");
    const res = await DELETE(makeRequest("DELETE"), {
      params: Promise.resolve({ id: "cfg_1" }),
    });

    expect(res.status).toBe(403);
  });

  it("ADMIN can POST /api/apps (not blocked)", async () => {
    getSession.mockResolvedValue(adminSession);
    monitoredAppFindFirst.mockResolvedValue(null); // no duplicate

    const { POST } = await import("@/app/api/apps/route");
    const res = await POST(makeRequest("POST", { url: "https://example.com", name: "Test" }));

    // ADMIN passes the role check
    expect(res.status).not.toBe(403);
  });
});
