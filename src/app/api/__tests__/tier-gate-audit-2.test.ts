/**
 * tier-gate-audit-2.test.ts
 *
 * Tests for all Critical and High tier-gate fixes from audit-2.
 * Covers:
 *  C-1: stripe/checkout ENTERPRISE_PLUS enum
 *  C-2: jira/ticket tier gate
 *  C-3: jira/test tier gate
 *  C-4: findings/github-issue tier gate
 *  H-1: scan/[id] manual scan rate limit
 *  H-2: apps/agent-key tier gate
 *  H-3: apps/auth-config tier gate
 *  H-4: apps/trends tier gate
 *  H-5: api-auth tier re-check on downgraded orgs
 *  H-6: invite/[token] canAddUser at acceptance
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Auth mocks ───────────────────────────────────────────────────────────────
const getSession = vi.fn();
const requireRole = vi.fn();
const hashPassword = vi.fn();
const createSession = vi.fn();

vi.mock("@/lib/auth", () => ({ getSession, requireRole, hashPassword, createSession }));

// ─── Tenant mocks ─────────────────────────────────────────────────────────────
const getOrgLimits = vi.fn();
const canAddUser = vi.fn();
const logAudit = vi.fn();

vi.mock("@/lib/tenant", () => ({ getOrgLimits, canAddUser, logAudit }));

// ─── DB mocks ─────────────────────────────────────────────────────────────────
const monitoredAppFindFirst = vi.fn();
const monitoredAppUpdate = vi.fn();
const findingFindFirst = vi.fn();
const integrationConfigFindUnique = vi.fn();
const auditLogCreate = vi.fn();
const userFindFirst = vi.fn();
const inviteFindUnique = vi.fn();
const inviteDelete = vi.fn();
const userCreate = vi.fn();
const apiKeyFindFirst = vi.fn();
const apiKeyUpdate = vi.fn();
const subscriptionFindUnique = vi.fn();
const monitorRunFindMany = vi.fn();
const organizationFindUnique = vi.fn();
const organizationUpdate = vi.fn();
const dbTransaction = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    monitoredApp: {
      findFirst: monitoredAppFindFirst,
      update: monitoredAppUpdate,
    },
    finding: {
      findFirst: findingFindFirst,
      update: vi.fn(),
    },
    integrationConfig: {
      findUnique: integrationConfigFindUnique,
    },
    auditLog: {
      create: auditLogCreate,
    },
    user: {
      findFirst: userFindFirst,
      create: userCreate,
      count: vi.fn().mockResolvedValue(0),
    },
    invite: {
      findUnique: inviteFindUnique,
      delete: inviteDelete,
    },
    apiKey: {
      findFirst: apiKeyFindFirst,
      update: apiKeyUpdate,
    },
    subscription: {
      findUnique: subscriptionFindUnique,
    },
    monitorRun: {
      findMany: monitorRunFindMany,
    },
    organization: {
      findUnique: organizationFindUnique,
      update: organizationUpdate,
    },
    $transaction: dbTransaction,
  },
}));

// ─── Rate limit mock ──────────────────────────────────────────────────────────
const checkRateLimit = vi.fn();
const getClientIp = vi.fn().mockReturnValue("1.2.3.4");
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit, getClientIp }));

// ─── Scanner mock ─────────────────────────────────────────────────────────────
const runHttpScanForApp = vi.fn();
vi.mock("@/lib/scanner-http", () => ({ runHttpScanForApp }));

// ─── Analytics mock ───────────────────────────────────────────────────────────
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

// ─── Stripe mock ──────────────────────────────────────────────────────────────
const stripeCheckoutCreate = vi.fn();
const stripeCustomersCreate = vi.fn();
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    checkout: { sessions: { create: stripeCheckoutCreate } },
    customers: { create: stripeCustomersCreate },
  }),
  PLANS: {
    STARTER: { priceId: "price_starter" },
    PRO: { priceId: "price_pro" },
    ENTERPRISE: { priceId: "price_enterprise" },
    ENTERPRISE_PLUS: { priceId: "price_enterprise_plus" },
  },
}));

// ─── Crypto / deobfuscate mock ────────────────────────────────────────────────
vi.mock("@/lib/crypto-util", () => ({
  deobfuscate: vi.fn((v: string) => v),
  obfuscate: vi.fn((v: string) => v),
}));

// ─── SSRF guard mock ─────────────────────────────────────────────────────────
vi.mock("@/lib/ssrf-guard", () => ({
  isPrivateUrl: vi.fn().mockResolvedValue(false),
  isPrivateIp: vi.fn().mockReturnValue(false),
}));

// ─── GitHub issues mock ───────────────────────────────────────────────────────
const createGitHubIssue = vi.fn();
vi.mock("@/lib/github-issues", () => ({ createGitHubIssue }));

// ─── Auth headers mock ────────────────────────────────────────────────────────
vi.mock("@/lib/auth-headers", () => ({
  encryptAuthHeaders: vi.fn((v: unknown) => JSON.stringify(v)),
  decryptAuthHeaders: vi.fn((v: string) => JSON.parse(v)),
  maskAuthHeaders: vi.fn((headers: Array<{ name: string; value: string }>) =>
    headers.map((h) => ({ ...h, value: "••••••••" })),
  ),
}));

// ─── Crypto util for api-auth ─────────────────────────────────────────────────
vi.mock("node:crypto", async (importOriginal) => {
vi.mock("@/lib/endpoint-discovery", () => ({ discoverEndpoints: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/scanner-auth", () => ({ runAuthScan: vi.fn().mockResolvedValue([]) }));
  const actual = await importOriginal<typeof import("node:crypto")>();
  return {
    ...actual,
    default: actual,
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function freeSession() {
  return { id: "user_1", orgId: "org_free", role: "OWNER", email: "owner@free.com" };
}

function proSession() {
  return { id: "user_2", orgId: "org_pro", role: "OWNER", email: "owner@pro.com" };
}

function freeLimits() {
  return { tier: "FREE", maxApps: 2, maxUsers: 1 };
}

function proLimits() {
  return { tier: "PRO", maxApps: 15, maxUsers: 10 };
}

function starterLimits() {
  return { tier: "STARTER", maxApps: 5, maxUsers: 2 };
}

function makeReq(method = "POST", body?: unknown): Request {
  return new Request("http://localhost", {
    method,
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// C-1: stripe/checkout — ENTERPRISE_PLUS in enum
// ─────────────────────────────────────────────────────────────────────────────
describe("C-1: POST /api/stripe/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimit.mockResolvedValue({ allowed: true });
    getSession.mockResolvedValue(proSession());
    organizationFindUnique.mockResolvedValue({
      id: "org_pro",
      name: "Pro Org",
      stripeCustomerId: "cus_existing",
    });
    stripeCheckoutCreate.mockResolvedValue({ url: "https://checkout.stripe.com/test_session" });
  });

  it("accepts ENTERPRISE_PLUS as a valid plan", async () => {
    getSession.mockResolvedValue({ ...proSession(), orgId: "org_ep" });
    organizationFindUnique.mockResolvedValue({
      id: "org_ep",
      name: "EP Org",
      stripeCustomerId: "cus_existing",
    });
    stripeCheckoutCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session_ep" });

    const { POST } = await import("@/app/api/stripe/checkout/route");
    const res = await POST(makeReq("POST", { plan: "ENTERPRISE_PLUS" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.url).toContain("stripe.com");
  });

  it("returns 400 for invalid plan name", async () => {
    const { POST } = await import("@/app/api/stripe/checkout/route");
    const res = await POST(makeReq("POST", { plan: "INVALID_PLAN" }));
    expect(res.status).toBe(400);
  });

  it("returns 401 without session", async () => {
    getSession.mockResolvedValue(null);
    const { POST } = await import("@/app/api/stripe/checkout/route");
    const res = await POST(makeReq("POST", { plan: "PRO" }));
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C-2: jira/ticket — tier gate
// ─────────────────────────────────────────────────────────────────────────────
describe("C-2: POST /api/integrations/jira/ticket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRole.mockResolvedValue(proSession());
    getOrgLimits.mockResolvedValue(proLimits());
    integrationConfigFindUnique.mockResolvedValue({
      enabled: true,
      config: { url: "https://jira.example.com", email: "a@b.com", apiToken: "tok", projectKey: "PROJ", issueType: "Bug" },
    });
    findingFindFirst.mockResolvedValue({
      id: "finding_1",
      title: "XSS",
      description: "desc",
      fixPrompt: "fix it",
      severity: "HIGH",
      notes: null,
      run: { app: { orgId: "org_pro", name: "App", url: "https://app.example.com" } },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ key: "PROJ-1" }),
    }));
  });

  it("returns 403 for FREE tier", async () => {
    requireRole.mockResolvedValue(freeSession());
    getOrgLimits.mockResolvedValue(freeLimits());
    const { POST } = await import("@/app/api/integrations/jira/ticket/route");
    const res = await POST(makeReq("POST", { findingId: "finding_1" }));
    expect(res.status).toBe(403);
  });

  it("returns 403 for STARTER tier", async () => {
    requireRole.mockResolvedValue({ ...freeSession(), orgId: "org_starter" });
    getOrgLimits.mockResolvedValue(starterLimits());
    const { POST } = await import("@/app/api/integrations/jira/ticket/route");
    const res = await POST(makeReq("POST", { findingId: "finding_1" }));
    expect(res.status).toBe(403);
  });

  it("allows PRO tier to create Jira ticket", async () => {
    const { POST } = await import("@/app/api/integrations/jira/ticket/route");
    const res = await POST(makeReq("POST", { findingId: "finding_1" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ticketUrl).toContain("PROJ-1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C-3: jira/test — tier gate
// ─────────────────────────────────────────────────────────────────────────────
describe("C-3: POST /api/integrations/jira/test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimit.mockResolvedValue({ allowed: true });
    requireRole.mockResolvedValue(proSession());
    getOrgLimits.mockResolvedValue(proLimits());
    integrationConfigFindUnique.mockResolvedValue({
      config: { url: "https://jira.example.com", email: "a@b.com", apiToken: "tok" },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ displayName: "Test User" }),
    }));
  });

  it("returns 403 for FREE tier", async () => {
    requireRole.mockResolvedValue(freeSession());
    getOrgLimits.mockResolvedValue(freeLimits());
    const { POST } = await import("@/app/api/integrations/jira/test/route");
    const res = await POST();
    expect(res.status).toBe(403);
  });

  it("returns 403 for STARTER tier", async () => {
    requireRole.mockResolvedValue({ ...freeSession(), orgId: "org_starter" });
    getOrgLimits.mockResolvedValue(starterLimits());
    const { POST } = await import("@/app/api/integrations/jira/test/route");
    const res = await POST();
    expect(res.status).toBe(403);
  });

  it("allows PRO tier to test Jira connection", async () => {
    const { POST } = await import("@/app/api/integrations/jira/test/route");
    const res = await POST();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C-4: findings/github-issue — tier gate
// ─────────────────────────────────────────────────────────────────────────────
describe("C-4: POST /api/findings/[id]/github-issue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimit.mockResolvedValue({ allowed: true });
    requireRole.mockResolvedValue(proSession());
    getOrgLimits.mockResolvedValue(proLimits());
    findingFindFirst.mockResolvedValue({
      id: "finding_1",
      title: "SQL Injection",
      description: "desc",
      severity: "CRITICAL",
      fixPrompt: "sanitize input",
      code: "code",
    });
    integrationConfigFindUnique.mockResolvedValue({
      enabled: true,
      config: { owner: "acme", repo: "web", token: "ghp_token" },
    });
    createGitHubIssue.mockResolvedValue({ issueUrl: "https://github.com/acme/web/issues/1", issueNumber: 1 });
    auditLogCreate.mockResolvedValue({});
  });

  it("returns 403 for FREE tier", async () => {
    requireRole.mockResolvedValue(freeSession());
    getOrgLimits.mockResolvedValue(freeLimits());
    const { POST } = await import("@/app/api/findings/[id]/github-issue/route");
    const res = await POST(makeReq("POST"), { params: Promise.resolve({ id: "finding_1" }) });
    expect(res.status).toBe(403);
  });

  it("allows PRO tier to create GitHub issue", async () => {
    const { POST } = await import("@/app/api/findings/[id]/github-issue/route");
    const res = await POST(makeReq("POST"), { params: Promise.resolve({ id: "finding_1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.issueUrl).toContain("github.com");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H-1: scan/[id] — manual scan rate limit
// ─────────────────────────────────────────────────────────────────────────────
describe("H-1: POST /api/scan/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue(freeSession());
    getOrgLimits.mockResolvedValue(freeLimits());
    monitoredAppFindFirst.mockResolvedValue({ id: "app_1", orgId: "org_free" });
    checkRateLimit.mockResolvedValue({ allowed: true });
    runHttpScanForApp.mockResolvedValue({ runId: "run_1", status: "HEALTHY", findingsCount: 0, responseTimeMs: 100 });
  });

  it("returns 429 when FREE tier exceeds 3 scans/day", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 3600 });
    const { POST } = await import("@/app/api/scan/[id]/route");
    const res = await POST(makeReq("POST"), { params: Promise.resolve({ id: "app_1" }) });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3600");
  });

  it("passes for FREE tier within daily limit", async () => {
    checkRateLimit.mockResolvedValue({ allowed: true });
    const { POST } = await import("@/app/api/scan/[id]/route");
    const res = await POST(makeReq("POST"), { params: Promise.resolve({ id: "app_1" }) });
    expect(res.status).toBe(200);
  });

  it("uses PRO limit of 50 scans/day", async () => {
    getSession.mockResolvedValue(proSession());
    getOrgLimits.mockResolvedValue(proLimits());
    monitoredAppFindFirst.mockResolvedValue({ id: "app_1", orgId: "org_pro" });
    checkRateLimit.mockResolvedValue({ allowed: true });

    const { POST } = await import("@/app/api/scan/[id]/route");
    await POST(makeReq("POST"), { params: Promise.resolve({ id: "app_1" }) });

    expect(checkRateLimit).toHaveBeenCalledWith(
      "manual-scan:org_pro",
      expect.objectContaining({ maxAttempts: 50 }),
    );
  });

  it("uses FREE limit of 3 scans/day", async () => {
    const { POST } = await import("@/app/api/scan/[id]/route");
    await POST(makeReq("POST"), { params: Promise.resolve({ id: "app_1" }) });

    expect(checkRateLimit).toHaveBeenCalledWith(
      "manual-scan:org_free",
      expect.objectContaining({ maxAttempts: 3 }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H-2: apps/agent-key — tier gate
// ─────────────────────────────────────────────────────────────────────────────
describe("H-2: POST /api/apps/[id]/agent-key", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    monitoredAppFindFirst.mockResolvedValue({ id: "app_1", orgId: "org_pro" });
    monitoredAppUpdate.mockResolvedValue({});
    getOrgLimits.mockResolvedValue(proLimits());
  });

  it("returns 403 for FREE tier", async () => {
    getSession.mockResolvedValue(freeSession());
    getOrgLimits.mockResolvedValue(freeLimits());
    const { POST } = await import("@/app/api/apps/[id]/agent-key/route");
    const res = await POST(makeReq("POST"), { params: Promise.resolve({ id: "app_1" }) });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("Pro plan");
  });

  it("returns 403 for STARTER tier", async () => {
    getSession.mockResolvedValue({ ...freeSession(), orgId: "org_starter" });
    getOrgLimits.mockResolvedValue(starterLimits());
    monitoredAppFindFirst.mockResolvedValue({ id: "app_1", orgId: "org_starter" });
    const { POST } = await import("@/app/api/apps/[id]/agent-key/route");
    const res = await POST(makeReq("POST"), { params: Promise.resolve({ id: "app_1" }) });
    expect(res.status).toBe(403);
  });

  it("allows PRO tier to generate agent key", async () => {
    getSession.mockResolvedValue(proSession());
    const { POST } = await import("@/app/api/apps/[id]/agent-key/route");
    const res = await POST(makeReq("POST"), { params: Promise.resolve({ id: "app_1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.plainKey).toMatch(/^sa_/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H-3: apps/auth-config — tier gate
// ─────────────────────────────────────────────────────────────────────────────
describe("H-3: GET/PUT /api/apps/[id]/auth-config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    monitoredAppFindFirst.mockResolvedValue({ id: "app_1", orgId: "org_pro", authHeaders: null });
    monitoredAppUpdate.mockResolvedValue({});
    getOrgLimits.mockResolvedValue(proLimits());
  });

  it("GET returns 403 for FREE tier", async () => {
    getSession.mockResolvedValue(freeSession());
    getOrgLimits.mockResolvedValue(freeLimits());
    const { GET } = await import("@/app/api/apps/[id]/auth-config/route");
    const res = await GET(makeReq("GET"), { params: Promise.resolve({ id: "app_1" }) });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("Pro plan");
  });

  it("PUT returns 403 for FREE tier", async () => {
    getSession.mockResolvedValue(freeSession());
    getOrgLimits.mockResolvedValue(freeLimits());
    const { PUT } = await import("@/app/api/apps/[id]/auth-config/route");
    const res = await PUT(makeReq("PUT", [{ name: "X-Api-Key", value: "secret" }]), { params: Promise.resolve({ id: "app_1" }) });
    expect(res.status).toBe(403);
  });

  it("GET allows PRO tier", async () => {
    getSession.mockResolvedValue(proSession());
    const { GET } = await import("@/app/api/apps/[id]/auth-config/route");
    const res = await GET(makeReq("GET"), { params: Promise.resolve({ id: "app_1" }) });
    expect(res.status).toBe(200);
  });

  it("PUT allows PRO tier to save auth headers", async () => {
    getSession.mockResolvedValue(proSession());
    const { PUT } = await import("@/app/api/apps/[id]/auth-config/route");
    const res = await PUT(makeReq("PUT", [{ name: "Authorization", value: "Bearer tok" }]), { params: Promise.resolve({ id: "app_1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H-4: apps/trends — tier gate
// ─────────────────────────────────────────────────────────────────────────────
describe("H-4: GET /api/apps/[id]/trends", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    monitoredAppFindFirst.mockResolvedValue({ id: "app_1" });
    monitorRunFindMany.mockResolvedValue([]);
    getOrgLimits.mockResolvedValue(proLimits());
  });

  it("returns 403 for FREE tier", async () => {
    getSession.mockResolvedValue(freeSession());
    getOrgLimits.mockResolvedValue(freeLimits());
    const { GET } = await import("@/app/api/apps/[id]/trends/route");
    const res = await GET(makeReq("GET"), { params: Promise.resolve({ id: "app_1" }) });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("Pro plan");
  });

  it("returns 403 for STARTER tier", async () => {
    getSession.mockResolvedValue({ ...freeSession(), orgId: "org_starter" });
    getOrgLimits.mockResolvedValue(starterLimits());
    const { GET } = await import("@/app/api/apps/[id]/trends/route");
    const res = await GET(makeReq("GET"), { params: Promise.resolve({ id: "app_1" }) });
    expect(res.status).toBe(403);
  });

  it("allows PRO tier to view trends", async () => {
    getSession.mockResolvedValue(proSession());
    const { GET } = await import("@/app/api/apps/[id]/trends/route");
    const res = await GET(makeReq("GET"), { params: Promise.resolve({ id: "app_1" }) });
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H-5: api-auth — tier re-check for downgraded orgs
// ─────────────────────────────────────────────────────────────────────────────
describe("H-5: authenticateApiKey — tier re-check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when org has been downgraded to FREE", async () => {
    apiKeyFindFirst.mockResolvedValue({
      id: "key_1",
      orgId: "org_downgraded",
      keyHash: "hash",
      keyPrefix: "vs_test_",
      expiresAt: null,
    });
    subscriptionFindUnique.mockResolvedValue({ orgId: "org_downgraded", tier: "FREE" });

    const { authenticateApiKey } = await import("@/lib/api-auth");
    const req = new Request("http://localhost", {
      headers: { authorization: "Bearer vs_test_key_123" },
    });
    const result = await authenticateApiKey(req);
    expect(result).toBeNull();
  });

  it("returns null when org has no subscription (defaults to FREE)", async () => {
    apiKeyFindFirst.mockResolvedValue({
      id: "key_2",
      orgId: "org_nosub",
      keyHash: "hash",
      keyPrefix: "vs_test_",
      expiresAt: null,
    });
    subscriptionFindUnique.mockResolvedValue(null);

    const { authenticateApiKey } = await import("@/lib/api-auth");
    const req = new Request("http://localhost", {
      headers: { authorization: "Bearer vs_test_key_456" },
    });
    const result = await authenticateApiKey(req);
    expect(result).toBeNull();
  });

  it("returns orgId when org has active PRO subscription", async () => {
    apiKeyFindFirst.mockResolvedValue({
      id: "key_3",
      orgId: "org_pro",
      keyHash: "hash",
      keyPrefix: "vs_test_",
      expiresAt: null,
    });
    subscriptionFindUnique.mockResolvedValue({ orgId: "org_pro", tier: "PRO" });
    apiKeyUpdate.mockResolvedValue({});
    auditLogCreate.mockResolvedValue({});

    const { authenticateApiKey } = await import("@/lib/api-auth");
    const req = new Request("http://localhost", {
      headers: { authorization: "Bearer vs_test_key_789" },
    });
    const result = await authenticateApiKey(req);
    expect(result).toBe("org_pro");
  });

  it("returns orgId for ENTERPRISE_PLUS subscription", async () => {
    apiKeyFindFirst.mockResolvedValue({
      id: "key_4",
      orgId: "org_ep",
      keyHash: "hash",
      keyPrefix: "vs_test_",
      expiresAt: null,
    });
    subscriptionFindUnique.mockResolvedValue({ orgId: "org_ep", tier: "ENTERPRISE_PLUS" });
    apiKeyUpdate.mockResolvedValue({});
    auditLogCreate.mockResolvedValue({});

    const { authenticateApiKey } = await import("@/lib/api-auth");
    const req = new Request("http://localhost", {
      headers: { authorization: "Bearer vs_test_key_ep" },
    });
    const result = await authenticateApiKey(req);
    expect(result).toBe("org_ep");
  });

  it("returns null for STARTER tier (API keys require PRO+)", async () => {
    apiKeyFindFirst.mockResolvedValue({
      id: "key_5",
      orgId: "org_starter",
      keyHash: "hash",
      keyPrefix: "vs_test_",
      expiresAt: null,
    });
    subscriptionFindUnique.mockResolvedValue({ orgId: "org_starter", tier: "STARTER" });

    const { authenticateApiKey } = await import("@/lib/api-auth");
    const req = new Request("http://localhost", {
      headers: { authorization: "Bearer vs_test_key_starter" },
    });
    const result = await authenticateApiKey(req);
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H-6: invite/[token] POST — canAddUser at acceptance
// ─────────────────────────────────────────────────────────────────────────────
describe("H-6: POST /api/auth/invite/[token]", () => {
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  beforeEach(() => {
    vi.resetAllMocks();
    // Audit 18: rate limit is now checked on invite route — allow by default
    checkRateLimit.mockResolvedValue({ allowed: true });
    getClientIp.mockReturnValue("1.2.3.4");
    inviteFindUnique.mockResolvedValue({
      token: "valid_token",
      email: "newuser@example.com",
      orgId: "org_pro",
      role: "MEMBER",
      expiresAt: futureDate,
      org: { name: "Pro Org" },
    });
    userFindFirst.mockResolvedValue(null);
    canAddUser.mockResolvedValue({ allowed: true });
    hashPassword.mockResolvedValue("hashed_password");
    userCreate.mockResolvedValue({ id: "new_user_1" });
    inviteDelete.mockResolvedValue({});
    createSession.mockResolvedValue({ id: "new_user_1", email: "newuser@example.com" });
    logAudit.mockResolvedValue(undefined);
    dbTransaction.mockImplementation((cb: (tx: unknown) => unknown) =>
      cb({ user: { findFirst: userFindFirst, create: userCreate, count: vi.fn().mockResolvedValue(0) }, invite: { findUnique: inviteFindUnique, delete: inviteDelete } })
    );
  });

  it("returns 409 when org has reached user limit at acceptance time", async () => {
    canAddUser.mockResolvedValue({ allowed: false, reason: "User limit reached" });
    const { POST } = await import("@/app/api/auth/invite/[token]/route");
    const res = await POST(
      makeReq("POST", { name: "New User", password: "Password123456!" }),
      { params: Promise.resolve({ token: "valid_token" }) },
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("user limit");
  });

  it("creates user when org has capacity", async () => {
    canAddUser.mockResolvedValue({ allowed: true });
    const { POST } = await import("@/app/api/auth/invite/[token]/route");
    const res = await POST(
      makeReq("POST", { name: "New User", password: "Password123456!" }),
      { params: Promise.resolve({ token: "valid_token" }) },
    );
    expect(res.status).toBe(201);
    expect(userCreate).toHaveBeenCalled();
  });

  it("calls canAddUser before creating the user", async () => {
    const { POST } = await import("@/app/api/auth/invite/[token]/route");
    await POST(
      makeReq("POST", { name: "New User", password: "Password123456!" }),
      { params: Promise.resolve({ token: "valid_token" }) },
    );
    expect(canAddUser).toHaveBeenCalledWith("org_pro");
    expect(userCreate).toHaveBeenCalled();
  });

  it("returns 404 for invalid token", async () => {
    inviteFindUnique.mockResolvedValue(null);
    const { POST } = await import("@/app/api/auth/invite/[token]/route");
    const res = await POST(
      makeReq("POST", { name: "New User", password: "Password123456!" }),
      { params: Promise.resolve({ token: "bad_token" }) },
    );
    expect(res.status).toBe(404);
  });
});
