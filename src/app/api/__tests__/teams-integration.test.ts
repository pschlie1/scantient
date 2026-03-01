/**
 * teams-integration.test.ts
 *
 * Tests for Microsoft Teams alert integration.
 * Covers: tier gating, CRUD operations, test notification.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Auth mocks ───────────────────────────────────────────────────────────────
const requireRole = vi.fn();
vi.mock("@/lib/auth", () => ({ requireRole }));

// ─── Tenant mocks ─────────────────────────────────────────────────────────────
const getOrgLimits = vi.fn();
vi.mock("@/lib/tenant", () => ({ getOrgLimits }));

// ─── DB mocks ─────────────────────────────────────────────────────────────────
const integrationConfigFindUnique = vi.fn();
const integrationConfigUpsert = vi.fn();
const integrationConfigDeleteMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    integrationConfig: {
      findUnique: integrationConfigFindUnique,
      upsert: integrationConfigUpsert,
      deleteMany: integrationConfigDeleteMany,
    },
  },
}));

// ─── Crypto mocks ─────────────────────────────────────────────────────────────
vi.mock("@/lib/crypto-util", () => ({
  obfuscate: vi.fn((v: string) => `enc:${v}`),
  deobfuscate: vi.fn((v: string) => v.replace("enc:", "")),
}));

// ─── Teams notify mock ────────────────────────────────────────────────────────
const sendTeamsNotification = vi.fn();
vi.mock("@/lib/teams-notify", () => ({ sendTeamsNotification }));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeSession(role = "OWNER") {
  return { userId: "user-1", orgId: "org-1", role };
}

function makeLimits(tier: string) {
  return { tier, maxApps: 5, maxUsers: 5 };
}

function makeRequest(body?: unknown): Request {
  return new Request("http://localhost/api/integrations/teams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  requireRole.mockRejectedValue(new Error("Unauthorized"));
  getOrgLimits.mockResolvedValue(makeLimits("FREE"));
});

describe("GET /api/integrations/teams", () => {
  it("returns 401 without session", async () => {
    requireRole.mockRejectedValue(new Error("Unauthorized"));
    const { GET } = await import("@/app/api/integrations/teams/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for MEMBER role", async () => {
    requireRole.mockRejectedValue(new Error("Forbidden"));
    const { GET } = await import("@/app/api/integrations/teams/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 403 for FREE tier", async () => {
    requireRole.mockResolvedValue(makeSession("OWNER"));
    getOrgLimits.mockResolvedValue(makeLimits("FREE"));
    const { GET } = await import("@/app/api/integrations/teams/route");
    const res = await GET();
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("Pro and Enterprise plans");
  });

  it("returns 403 for STARTER tier", async () => {
    requireRole.mockResolvedValue(makeSession("OWNER"));
    getOrgLimits.mockResolvedValue(makeLimits("STARTER"));
    const { GET } = await import("@/app/api/integrations/teams/route");
    const res = await GET();
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("Microsoft Teams alerts");
  });

  it("returns 200 with masked config for PRO tier", async () => {
    requireRole.mockResolvedValue(makeSession("OWNER"));
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));
    integrationConfigFindUnique.mockResolvedValue({
      id: "int-1",
      orgId: "org-1",
      type: "teams",
      enabled: true,
      config: { webhookUrl: "https://myorg.webhook.office.com/webhookb2/abc123" },
    });
    const { GET } = await import("@/app/api/integrations/teams/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.webhookUrl).toContain("••••••");
    expect(json.webhookUrl).not.toContain("abc123");
    expect(json.enabled).toBe(true);
  });

  it("returns null when no config exists (PRO tier)", async () => {
    requireRole.mockResolvedValue(makeSession("OWNER"));
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));
    integrationConfigFindUnique.mockResolvedValue(null);
    const { GET } = await import("@/app/api/integrations/teams/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toBeNull();
  });
});

describe("POST /api/integrations/teams", () => {
  it("saves config for ADMIN with PRO tier", async () => {
    requireRole.mockResolvedValue(makeSession("ADMIN"));
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));
    integrationConfigUpsert.mockResolvedValue({ id: "int-1", orgId: "org-1" });
    const { POST } = await import("@/app/api/integrations/teams/route");
    const req = makeRequest({ webhookUrl: "https://myorg.webhook.office.com/webhookb2/token123" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(integrationConfigUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ orgId: "org-1", type: "teams" }),
      }),
    );
  });

  it("returns 400 for invalid webhook URL (no webhook/office/teams/logic keyword)", async () => {
    requireRole.mockResolvedValue(makeSession("ADMIN"));
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));
    const { POST } = await import("@/app/api/integrations/teams/route");
    const req = makeRequest({ webhookUrl: "https://evil.com/notavalidhook" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-https URL", async () => {
    requireRole.mockResolvedValue(makeSession("ADMIN"));
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));
    const { POST } = await import("@/app/api/integrations/teams/route");
    const req = makeRequest({ webhookUrl: "http://myorg.webhook.office.com/token" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 403 for FREE tier", async () => {
    requireRole.mockResolvedValue(makeSession("ADMIN"));
    getOrgLimits.mockResolvedValue(makeLimits("FREE"));
    const { POST } = await import("@/app/api/integrations/teams/route");
    const req = makeRequest({ webhookUrl: "https://myorg.webhook.office.com/token" });
    const res = await POST(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("Microsoft Teams alerts");
  });

  it("returns 401 without session", async () => {
    requireRole.mockRejectedValue(new Error("Unauthorized"));
    const { POST } = await import("@/app/api/integrations/teams/route");
    const req = makeRequest({ webhookUrl: "https://myorg.webhook.office.com/token" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/integrations/teams", () => {
  it("removes config for OWNER with PRO tier", async () => {
    requireRole.mockResolvedValue(makeSession("OWNER"));
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));
    integrationConfigDeleteMany.mockResolvedValue({ count: 1 });
    const { DELETE } = await import("@/app/api/integrations/teams/route");
    const res = await DELETE();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(integrationConfigDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: "org-1", type: "teams" } }),
    );
  });

  it("returns 403 for FREE tier", async () => {
    requireRole.mockResolvedValue(makeSession("OWNER"));
    getOrgLimits.mockResolvedValue(makeLimits("FREE"));
    const { DELETE } = await import("@/app/api/integrations/teams/route");
    const res = await DELETE();
    expect(res.status).toBe(403);
  });
});

describe("POST /api/integrations/teams/test", () => {
  it("returns 404 if no config exists", async () => {
    requireRole.mockResolvedValue(makeSession("OWNER"));
    integrationConfigFindUnique.mockResolvedValue(null);
    const { POST } = await import("@/app/api/integrations/teams/test/route");
    const res = await POST();
    expect(res.status).toBe(404);
  });

  it("calls sendTeamsNotification and returns ok", async () => {
    requireRole.mockResolvedValue(makeSession("OWNER"));
    integrationConfigFindUnique.mockResolvedValue({
      id: "int-1",
      orgId: "org-1",
      type: "teams",
      enabled: true,
      config: { webhookUrl: "enc:https://myorg.webhook.office.com/token" },
    });
    sendTeamsNotification.mockResolvedValue(true);
    const { POST } = await import("@/app/api/integrations/teams/test/route");
    const res = await POST();
    expect(res.status).toBe(200);
    expect(sendTeamsNotification).toHaveBeenCalledWith(
      expect.stringContaining("office.com"),
      expect.objectContaining({ title: expect.stringContaining("Test") }),
    );
  });

  it("returns 502 if sendTeamsNotification fails", async () => {
    requireRole.mockResolvedValue(makeSession("OWNER"));
    integrationConfigFindUnique.mockResolvedValue({
      id: "int-1",
      orgId: "org-1",
      type: "teams",
      enabled: true,
      config: { webhookUrl: "enc:https://myorg.webhook.office.com/token" },
    });
    sendTeamsNotification.mockResolvedValue(false);
    const { POST } = await import("@/app/api/integrations/teams/test/route");
    const res = await POST();
    expect(res.status).toBe(502);
  });

  it("returns 401 without session", async () => {
    requireRole.mockRejectedValue(new Error("Unauthorized"));
    const { POST } = await import("@/app/api/integrations/teams/test/route");
    const res = await POST();
    expect(res.status).toBe(401);
  });
});
