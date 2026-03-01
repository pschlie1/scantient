/**
 * github-integration.test.ts
 *
 * Tests for GitHub Issues integration.
 * Covers: tier gating, CRUD, creating issues from findings.
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
const findingFindFirst = vi.fn();
const auditLogCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    integrationConfig: {
      findUnique: integrationConfigFindUnique,
      upsert: integrationConfigUpsert,
      deleteMany: integrationConfigDeleteMany,
    },
    finding: {
      findFirst: findingFindFirst,
    },
    auditLog: {
      create: auditLogCreate,
    },
  },
}));

// ─── Crypto mocks ─────────────────────────────────────────────────────────────
vi.mock("@/lib/crypto-util", () => ({
  obfuscate: vi.fn((v: string) => `enc:${v}`),
  deobfuscate: vi.fn((v: string) => v.replace("enc:", "")),
}));

// ─── GitHub issues mock ───────────────────────────────────────────────────────
const createGitHubIssue = vi.fn();
vi.mock("@/lib/github-issues", () => ({ createGitHubIssue }));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeSession(role = "OWNER") {
  return { id: "user-1", orgId: "org-1", role };
}

function makeLimits(tier: string) {
  return { tier, maxApps: 5, maxUsers: 5 };
}

function makeRequest(body?: unknown): Request {
  return new Request("http://localhost/api/integrations/github", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const VALID_GITHUB_CONFIG = { owner: "myorg", repo: "myrepo", token: "ghp_abc123xyz" };

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  requireRole.mockRejectedValue(new Error("Unauthorized"));
  getOrgLimits.mockResolvedValue(makeLimits("FREE"));
});

describe("GET /api/integrations/github", () => {
  it("returns 403 for FREE tier", async () => {
    requireRole.mockResolvedValue(makeSession("OWNER"));
    getOrgLimits.mockResolvedValue(makeLimits("FREE"));
    const { GET } = await import("@/app/api/integrations/github/route");
    const res = await GET();
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("Pro and Enterprise plans");
  });

  it("returns 403 for STARTER tier", async () => {
    requireRole.mockResolvedValue(makeSession("OWNER"));
    getOrgLimits.mockResolvedValue(makeLimits("STARTER"));
    const { GET } = await import("@/app/api/integrations/github/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 200 with masked token for PRO tier", async () => {
    requireRole.mockResolvedValue(makeSession("OWNER"));
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));
    integrationConfigFindUnique.mockResolvedValue({
      id: "int-1",
      orgId: "org-1",
      type: "github",
      enabled: true,
      config: {
        owner: "myorg",
        repo: "myrepo",
        token: "enc:ghp_supersecrettoken123",
      },
    });
    const { GET } = await import("@/app/api/integrations/github/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.owner).toBe("myorg");
    expect(json.repo).toBe("myrepo");
    expect(json.token).toContain("••••");
    expect(json.token).not.toContain("supersecret");
    expect(json.enabled).toBe(true);
  });

  it("returns null when no config exists for PRO tier", async () => {
    requireRole.mockResolvedValue(makeSession("OWNER"));
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));
    integrationConfigFindUnique.mockResolvedValue(null);
    const { GET } = await import("@/app/api/integrations/github/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it("returns 401 without session", async () => {
    requireRole.mockRejectedValue(new Error("Unauthorized"));
    const { GET } = await import("@/app/api/integrations/github/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

describe("POST /api/integrations/github", () => {
  it("saves config for PRO tier (ADMIN)", async () => {
    requireRole.mockResolvedValue(makeSession("ADMIN"));
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));
    integrationConfigUpsert.mockResolvedValue({ id: "int-1", orgId: "org-1" });
    const { POST } = await import("@/app/api/integrations/github/route");
    const req = makeRequest(VALID_GITHUB_CONFIG);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(integrationConfigUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ orgId: "org-1", type: "github" }),
      }),
    );
  });

  it("returns 403 for FREE tier", async () => {
    requireRole.mockResolvedValue(makeSession("ADMIN"));
    getOrgLimits.mockResolvedValue(makeLimits("FREE"));
    const { POST } = await import("@/app/api/integrations/github/route");
    const req = makeRequest(VALID_GITHUB_CONFIG);
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 for missing required fields", async () => {
    requireRole.mockResolvedValue(makeSession("ADMIN"));
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));
    const { POST } = await import("@/app/api/integrations/github/route");
    const req = makeRequest({ owner: "myorg" }); // missing repo and token
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/integrations/github", () => {
  it("removes config for OWNER with PRO tier", async () => {
    requireRole.mockResolvedValue(makeSession("OWNER"));
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));
    integrationConfigDeleteMany.mockResolvedValue({ count: 1 });
    const { DELETE } = await import("@/app/api/integrations/github/route");
    const res = await DELETE();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(integrationConfigDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: "org-1", type: "github" } }),
    );
  });
});

describe("POST /api/findings/[id]/github-issue", () => {
  function makeParams(id = "finding-1") {
    return { params: Promise.resolve({ id }) };
  }

  // Override global FREE default — github-issue requires PRO+
  beforeEach(() => {
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));
  });

  it("returns 404 if finding not in org", async () => {
    requireRole.mockResolvedValue(makeSession("OWNER"));
    findingFindFirst.mockResolvedValue(null);
    const { POST } = await import("@/app/api/findings/[id]/github-issue/route");
    const res = await POST(new Request("http://localhost"), makeParams());
    expect(res.status).toBe(404);
  });

  it("returns 409 if no GitHub integration configured", async () => {
    requireRole.mockResolvedValue(makeSession("OWNER"));
    findingFindFirst.mockResolvedValue({
      id: "finding-1",
      code: "MISSING_CSP",
      title: "Missing CSP",
      description: "No Content Security Policy header.",
      severity: "HIGH",
      fixPrompt: "Add a CSP header.",
    });
    integrationConfigFindUnique.mockResolvedValue(null);
    const { POST } = await import("@/app/api/findings/[id]/github-issue/route");
    const res = await POST(new Request("http://localhost"), makeParams());
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("GitHub integration not configured");
  });

  it("creates GitHub issue and returns issueUrl + issueNumber", async () => {
    requireRole.mockResolvedValue(makeSession("OWNER"));
    findingFindFirst.mockResolvedValue({
      id: "finding-1",
      code: "MISSING_CSP",
      title: "Missing CSP",
      description: "No Content Security Policy header.",
      severity: "HIGH",
      fixPrompt: "Add a CSP header.",
    });
    integrationConfigFindUnique.mockResolvedValue({
      id: "int-1",
      orgId: "org-1",
      type: "github",
      enabled: true,
      config: { owner: "myorg", repo: "myrepo", token: "enc:ghp_token" },
    });
    createGitHubIssue.mockResolvedValue({
      issueUrl: "https://github.com/myorg/myrepo/issues/42",
      issueNumber: 42,
    });
    auditLogCreate.mockResolvedValue({});
    const { POST } = await import("@/app/api/findings/[id]/github-issue/route");
    const res = await POST(new Request("http://localhost"), makeParams());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.issueUrl).toBe("https://github.com/myorg/myrepo/issues/42");
    expect(json.issueNumber).toBe(42);
    expect(createGitHubIssue).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "myorg", repo: "myrepo" }),
      expect.objectContaining({ code: "MISSING_CSP" }),
      expect.stringContaining("finding-1"),
    );
    expect(auditLogCreate).toHaveBeenCalled();
  });

  it("returns 502 if createGitHubIssue fails", async () => {
    requireRole.mockResolvedValue(makeSession("OWNER"));
    findingFindFirst.mockResolvedValue({
      id: "finding-1",
      code: "MISSING_CSP",
      title: "Missing CSP",
      description: "No CSP.",
      severity: "HIGH",
      fixPrompt: "Add CSP.",
    });
    integrationConfigFindUnique.mockResolvedValue({
      id: "int-1",
      orgId: "org-1",
      type: "github",
      enabled: true,
      config: { owner: "myorg", repo: "myrepo", token: "enc:ghp_token" },
    });
    createGitHubIssue.mockResolvedValue(null);
    const { POST } = await import("@/app/api/findings/[id]/github-issue/route");
    const res = await POST(new Request("http://localhost"), makeParams());
    expect(res.status).toBe(502);
  });

  it("returns 401 without session", async () => {
    requireRole.mockRejectedValue(new Error("Unauthorized"));
    const { POST } = await import("@/app/api/findings/[id]/github-issue/route");
    const res = await POST(new Request("http://localhost"), makeParams());
    expect(res.status).toBe(401);
  });
});
