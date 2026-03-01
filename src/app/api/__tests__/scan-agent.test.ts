/**
 * scan-agent.test.ts
 *
 * Tests for:
 *  - POST /api/agent/scan
 *  - POST /api/apps/[id]/agent-key
 *  - DELETE /api/apps/[id]/agent-key
 *  - GET /api/agent/pending
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, randomBytes } from "crypto";

// ─── Auth mock ────────────────────────────────────────────────────────────────
const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession }));

// ─── DB mock ─────────────────────────────────────────────────────────────────
const monitoredAppFindFirst = vi.fn();
const monitoredAppUpdate = vi.fn();
const monitoredAppFindUnique = vi.fn();
const monitorRunCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    monitoredApp: {
      findFirst: monitoredAppFindFirst,
      update: monitoredAppUpdate,
      findUnique: monitoredAppFindUnique,
    },
    monitorRun: {
      create: monitorRunCreate,
    },
    auditLog: { create: vi.fn() },
  },
}));

// ─── Tenant mock ──────────────────────────────────────────────────────────────
const getOrgLimits = vi.fn();
vi.mock("@/lib/tenant", () => ({ getOrgLimits, logAudit: vi.fn() }));

// ─── Alerts mock ──────────────────────────────────────────────────────────────
const sendCriticalFindingsAlert = vi.fn();
vi.mock("@/lib/alerts", () => ({ sendCriticalFindingsAlert }));

// ─── Analytics mock ───────────────────────────────────────────────────────────
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function generateKey() {
  const raw = `sa_${randomBytes(32).toString("base64url")}`;
  return { raw, hash: sha256(raw), prefix: raw.slice(0, 10) };
}

function adminSession() {
  return { id: "user_1", orgId: "org_a", role: "ADMIN" };
}

function makeRequest(method: string, body?: unknown, headers?: Record<string, string>) {
  return new Request("http://localhost", {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const validFindings = [
  {
    code: "MISSING_CSP",
    title: "CSP missing",
    description: "No CSP header",
    severity: "HIGH" as const,
    fixPrompt: "Add CSP",
  },
];

// ─── POST /api/agent/scan tests ───────────────────────────────────────────────
describe("POST /api/agent/scan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 with missing Authorization header", async () => {
    const { POST } = await import("@/app/api/agent/scan/route");
    const req = makeRequest("POST", { findings: [] });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 with invalid key format (not sa_)", async () => {
    monitoredAppFindFirst.mockResolvedValue(null);
    const { POST } = await import("@/app/api/agent/scan/route");
    const req = makeRequest("POST", { findings: [] }, { Authorization: "Bearer invalid_key_format" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 with wrong (non-existent) sa_ key", async () => {
    monitoredAppFindFirst.mockResolvedValue(null);
    const { POST } = await import("@/app/api/agent/scan/route");
    const req = makeRequest(
      "POST",
      { findings: [] },
      { Authorization: "Bearer sa_wrongkeyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 with invalid body (missing required fields)", async () => {
    const { raw, hash } = generateKey();
    monitoredAppFindFirst.mockResolvedValue({
      id: "app_1",
      orgId: "org_a",
      agentKeyHash: hash,
      agentEnabled: true,
    });

    const { POST } = await import("@/app/api/agent/scan/route");
    const req = makeRequest("POST", { invalid: "body" }, { Authorization: `Bearer ${raw}` });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("creates MonitorRun and findings on valid submission", async () => {
    const { raw, hash } = generateKey();
    monitoredAppFindFirst.mockResolvedValue({
      id: "app_1",
      orgId: "org_a",
      agentKeyHash: hash,
      agentEnabled: true,
    });
    monitorRunCreate.mockResolvedValue({ id: "run_1" });
    getOrgLimits.mockResolvedValue({ tier: "PRO" });
    monitoredAppUpdate.mockResolvedValue({});
    sendCriticalFindingsAlert.mockResolvedValue(undefined);

    const { POST } = await import("@/app/api/agent/scan/route");
    const req = makeRequest(
      "POST",
      { findings: validFindings, responseTimeMs: 250, statusCode: 200 },
      { Authorization: `Bearer ${raw}` },
    );
    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.runId).toBe("run_1");
    expect(body.status).toBe("WARNING"); // HIGH finding → WARNING
    expect(body.findingsCount).toBe(1);

    expect(monitorRunCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          appId: "app_1",
          status: "WARNING",
          findings: expect.objectContaining({ create: expect.arrayContaining([expect.objectContaining({ code: "MISSING_CSP" })]) }),
        }),
      }),
    );
  });

  it("updates app status and agentLastSeenAt", async () => {
    const { raw, hash } = generateKey();
    monitoredAppFindFirst.mockResolvedValue({
      id: "app_1",
      orgId: "org_a",
      agentKeyHash: hash,
      agentEnabled: true,
    });
    monitorRunCreate.mockResolvedValue({ id: "run_2" });
    getOrgLimits.mockResolvedValue({ tier: "STARTER" });
    monitoredAppUpdate.mockResolvedValue({});
    sendCriticalFindingsAlert.mockResolvedValue(undefined);

    const { POST } = await import("@/app/api/agent/scan/route");
    const req = makeRequest(
      "POST",
      { findings: validFindings },
      { Authorization: `Bearer ${raw}` },
    );
    await POST(req);

    expect(monitoredAppUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "app_1" },
        data: expect.objectContaining({
          status: "WARNING",
          lastCheckedAt: expect.any(Date),
          nextCheckAt: expect.any(Date),
          agentLastSeenAt: expect.any(Date),
        }),
      }),
    );
  });

  it("sends alert for critical findings", async () => {
    const { raw, hash } = generateKey();
    monitoredAppFindFirst.mockResolvedValue({
      id: "app_1",
      orgId: "org_a",
      agentKeyHash: hash,
      agentEnabled: true,
    });
    monitorRunCreate.mockResolvedValue({ id: "run_3" });
    getOrgLimits.mockResolvedValue({ tier: "FREE" });
    monitoredAppUpdate.mockResolvedValue({});
    sendCriticalFindingsAlert.mockResolvedValue(undefined);

    const criticalFindings = [
      {
        code: "HTTP_NOT_HTTPS",
        title: "Not HTTPS",
        description: "Served over HTTP",
        severity: "CRITICAL" as const,
        fixPrompt: "Use HTTPS",
      },
    ];

    const { POST } = await import("@/app/api/agent/scan/route");
    const req = makeRequest(
      "POST",
      { findings: criticalFindings },
      { Authorization: `Bearer ${raw}` },
    );
    await POST(req);

    expect(sendCriticalFindingsAlert).toHaveBeenCalledWith(
      "app_1",
      expect.arrayContaining([expect.objectContaining({ severity: "CRITICAL" })]),
    );
  });
});

// ─── POST /api/apps/[id]/agent-key tests ─────────────────────────────────────
describe("POST /api/apps/[id]/agent-key", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates a key for ADMIN role", async () => {
    getSession.mockResolvedValue(adminSession());
    monitoredAppFindFirst.mockResolvedValue({ id: "app_1", orgId: "org_a" });
    monitoredAppUpdate.mockResolvedValue({});

    const { POST } = await import("@/app/api/apps/[id]/agent-key/route");
    const req = makeRequest("POST");
    const res = await POST(req, { params: Promise.resolve({ id: "app_1" }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.plainKey).toMatch(/^sa_/);
    expect(body.prefix).toBe(body.plainKey.slice(0, 10));

    expect(monitoredAppUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          agentEnabled: true,
          agentKeyHash: expect.any(String),
          agentKeyPrefix: expect.any(String),
        }),
      }),
    );
  });

  it("returns 403 for MEMBER role", async () => {
    getSession.mockResolvedValue({ id: "u1", orgId: "org_a", role: "MEMBER" });

    const { POST } = await import("@/app/api/apps/[id]/agent-key/route");
    const req = makeRequest("POST");
    const res = await POST(req, { params: Promise.resolve({ id: "app_1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 401 without session", async () => {
    getSession.mockResolvedValue(null);
    const { POST } = await import("@/app/api/apps/[id]/agent-key/route");
    const req = makeRequest("POST");
    const res = await POST(req, { params: Promise.resolve({ id: "app_1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 if app not in org", async () => {
    getSession.mockResolvedValue(adminSession());
    monitoredAppFindFirst.mockResolvedValue(null);

    const { POST } = await import("@/app/api/apps/[id]/agent-key/route");
    const req = makeRequest("POST");
    const res = await POST(req, { params: Promise.resolve({ id: "other_app" }) });
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /api/apps/[id]/agent-key tests ───────────────────────────────────
describe("DELETE /api/apps/[id]/agent-key", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revokes the agent key", async () => {
    getSession.mockResolvedValue(adminSession());
    monitoredAppFindFirst.mockResolvedValue({ id: "app_1", orgId: "org_a", agentEnabled: true });
    monitoredAppUpdate.mockResolvedValue({});

    const { DELETE } = await import("@/app/api/apps/[id]/agent-key/route");
    const req = makeRequest("DELETE");
    const res = await DELETE(req, { params: Promise.resolve({ id: "app_1" }) });
    expect(res.status).toBe(200);

    expect(monitoredAppUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          agentEnabled: false,
          agentKeyHash: null,
          agentKeyPrefix: null,
        }),
      }),
    );
  });

  it("returns 403 for VIEWER role", async () => {
    getSession.mockResolvedValue({ id: "u1", orgId: "org_a", role: "VIEWER" });
    const { DELETE } = await import("@/app/api/apps/[id]/agent-key/route");
    const req = makeRequest("DELETE");
    const res = await DELETE(req, { params: Promise.resolve({ id: "app_1" }) });
    expect(res.status).toBe(403);
  });
});
