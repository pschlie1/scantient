/**
 * security-audit-7.test.ts
 *
 * Tests for audit-7 security fixes:
 *  Fix 1: Teams webhook SSRF guard (private IP webhook URL returns 400)
 *  Fix 2: Stripe concurrent checkout race condition (orphaned customer cleanup)
 *  Fix 3: Executive report bounded data query (take: 10 runs, take: 200 findings)
 *  Fix 4: App URL SSRF check at save time (POST and PATCH)
 *  Fix 5: Finding notes max length (10,000 chars)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── SSRF guard mock ──────────────────────────────────────────────────────────
const isPrivateUrl = vi.fn<[string], Promise<boolean>>();
vi.mock("@/lib/ssrf-guard", () => ({ isPrivateUrl, isPrivateIp: vi.fn() }));

// ─── Auth mock ────────────────────────────────────────────────────────────────
const getSession = vi.fn();
const requireRole = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession, requireRole }));

// ─── Tenant mock ──────────────────────────────────────────────────────────────
const getOrgLimits = vi.fn();
const logAudit = vi.fn();
const canAddApp = vi.fn();
vi.mock("@/lib/tenant", () => ({ getOrgLimits, logAudit, canAddApp }));

// ─── Crypto mock ──────────────────────────────────────────────────────────────
vi.mock("@/lib/crypto-util", () => ({
  obfuscate: vi.fn((v: string) => `enc:${v}`),
  deobfuscate: vi.fn((v: string) => v.replace("enc:", "")),
}));

// ─── Stripe mock ──────────────────────────────────────────────────────────────
const customersCreate = vi.fn();
const customersDel = vi.fn();
const checkoutSessionsCreate = vi.fn();
const getStripe = vi.fn(() => ({
  customers: { create: customersCreate, del: customersDel },
  checkout: { sessions: { create: checkoutSessionsCreate } },
}));
vi.mock("@/lib/stripe", () => ({
  getStripe,
  PLANS: {
    STARTER: { priceId: null },
    PRO: { priceId: "price_pro_test" },
    ENTERPRISE: { priceId: "price_ent_test" },
    ENTERPRISE_PLUS: { priceId: "price_ent_plus_test" },
  },
}));

// ─── Analytics mock ───────────────────────────────────────────────────────────
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

// ─── Observability mock ───────────────────────────────────────────────────────
vi.mock("@/lib/observability", () => ({ logApiError: vi.fn() }));
vi.mock("@/lib/remediation-lifecycle", () => ({ addTimelineEvent: vi.fn().mockResolvedValue(undefined) }));

// ─── Types mock (createAppSchema) ─────────────────────────────────────────────
vi.mock("@/lib/types", async () => {
  const { z } = await import("zod");
  return {
    createAppSchema: z.object({
      name: z.string().min(1),
      url: z.string().url(),
      criticality: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional().default("MEDIUM"),
    }),
  };
});

// ─── DB mock ──────────────────────────────────────────────────────────────────
const organizationFindUnique = vi.fn();
const organizationUpdateMany = vi.fn();
const integrationConfigFindUnique = vi.fn();
const integrationConfigUpsert = vi.fn();
const monitoredAppFindMany = vi.fn();
const monitoredAppFindFirst = vi.fn();
const monitoredAppCreate = vi.fn();
const monitoredAppUpdate = vi.fn();
const monitoredAppCount = vi.fn();
const findingFindFirst = vi.fn();
const findingUpdate = vi.fn();
const auditLogCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    organization: {
      findUnique: organizationFindUnique,
      updateMany: organizationUpdateMany,
    },
    integrationConfig: {
      findUnique: integrationConfigFindUnique,
      upsert: integrationConfigUpsert,
    },
    monitoredApp: {
      findMany: monitoredAppFindMany,
      findFirst: monitoredAppFindFirst,
      create: monitoredAppCreate,
      update: monitoredAppUpdate,
      count: monitoredAppCount,
    },
    finding: {
      findFirst: findingFindFirst,
      findUnique: vi.fn().mockResolvedValue({ id: "f1", remediationMeta: null }),
      update: findingUpdate,
    },
    auditLog: {
      create: auditLogCreate,
    },
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    orgId: "org-1",
    email: "admin@example.com",
    orgName: "Test Org",
    role: "ADMIN",
    ...overrides,
  };
}

function makeLimits(tier = "PRO") {
  return { tier, maxApps: 10, maxUsers: 10 };
}

beforeEach(() => {
  vi.clearAllMocks();
  isPrivateUrl.mockResolvedValue(false);
  getSession.mockResolvedValue(null);
  requireRole.mockRejectedValue(new Error("Unauthorized"));
  getOrgLimits.mockResolvedValue(makeLimits("PRO"));
  canAddApp.mockResolvedValue({ allowed: true, reason: null });
  monitoredAppCount.mockResolvedValue(0);
  auditLogCreate.mockResolvedValue({});
  logAudit.mockResolvedValue(undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 1: Teams webhook SSRF guard
// ─────────────────────────────────────────────────────────────────────────────
describe("Fix 1: Teams webhook SSRF guard", () => {
  function makeTeamsRequest(body: unknown) {
    return new Request("http://localhost/api/integrations/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 400 when webhook URL resolves to a private IP", async () => {
    requireRole.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("ENTERPRISE"));
    // Private IP that contains "webhook" keyword to pass pattern check
    isPrivateUrl.mockResolvedValue(true);

    const { POST } = await import("@/app/api/integrations/teams/route");
    const req = makeTeamsRequest({ webhookUrl: "https://169.254.169.254/webhook" });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/public address/i);
    expect(integrationConfigUpsert).not.toHaveBeenCalled();
  });

  it("proceeds and saves config when webhook URL is a valid public Teams URL", async () => {
    requireRole.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));
    isPrivateUrl.mockResolvedValue(false);
    integrationConfigUpsert.mockResolvedValue({ id: "int-1", orgId: "org-1" });

    const { POST } = await import("@/app/api/integrations/teams/route");
    const req = makeTeamsRequest({
      webhookUrl: "https://myorg.webhook.office.com/webhookb2/abc-token",
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(integrationConfigUpsert).toHaveBeenCalledOnce();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 2: Stripe concurrent checkout race condition
// ─────────────────────────────────────────────────────────────────────────────
describe("Fix 2: Stripe concurrent checkout race condition", () => {
  function makeCheckoutRequest(plan = "PRO") {
    return new Request("http://localhost/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
  }

  it("cleans up orphaned customer and uses winner customerId when race is lost", async () => {
    const session = makeSession();
    getSession.mockResolvedValue(session);

    // Org has no customerId yet
    organizationFindUnique.mockResolvedValueOnce({ id: "org-1", name: "Test Org", stripeCustomerId: null });

    // Stripe creates a new customer
    customersCreate.mockResolvedValue({ id: "cus_new_loser" });
    customersDel.mockResolvedValue({});

    // updateMany returns 0 -- another request already wrote a customerId
    organizationUpdateMany.mockResolvedValue({ count: 0 });

    // Re-fetch returns the winner's customerId
    organizationFindUnique.mockResolvedValueOnce({ stripeCustomerId: "cus_winner" });

    checkoutSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/pay/cs_test" });

    const { POST } = await import("@/app/api/stripe/checkout/route");
    const req = makeCheckoutRequest("PRO");
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.url).toContain("stripe.com");

    // Orphaned customer must be deleted
    expect(customersDel).toHaveBeenCalledWith("cus_new_loser");

    // Checkout session must use the winner's customerId
    expect(checkoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_winner" }),
    );
  });

  it("uses newly created customerId when atomic claim succeeds (count = 1)", async () => {
    const session = makeSession();
    getSession.mockResolvedValue(session);

    organizationFindUnique.mockResolvedValueOnce({ id: "org-1", name: "Test Org", stripeCustomerId: null });
    customersCreate.mockResolvedValue({ id: "cus_new_winner" });
    organizationUpdateMany.mockResolvedValue({ count: 1 });
    checkoutSessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/pay/cs_test" });

    const { POST } = await import("@/app/api/stripe/checkout/route");
    const req = makeCheckoutRequest("PRO");
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(customersDel).not.toHaveBeenCalled();
    expect(checkoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_new_winner" }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 3: Executive report bounded data query
// ─────────────────────────────────────────────────────────────────────────────
describe("Fix 3: Executive report bounded data query", () => {
  it("passes take: 10 for monitorRuns and take: 200 for findings in the DB query", async () => {
    const session = makeSession();
    getSession.mockResolvedValue(session);
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));

    // Mock org lookup
    const orgFindUnique = vi.fn().mockResolvedValue({ name: "Test Org" });
    // Override the db mock for organization.findUnique in this scope
    vi.mocked(organizationFindUnique).mockResolvedValue({ name: "Test Org" });

    monitoredAppFindMany.mockResolvedValue([]);

    const { GET } = await import("@/app/api/reports/executive/route");
    const res = await GET();

    expect(res.status).toBe(200);

    // Verify the query includes take: 10 for monitorRuns and take: 200 for findings
    expect(monitoredAppFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          monitorRuns: expect.objectContaining({
            take: 10,
            include: expect.objectContaining({
              findings: expect.objectContaining({
                take: 200,
              }),
            }),
          }),
        }),
      }),
    );
  });

  it("returns 403 for FREE tier", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("FREE"));

    const { GET } = await import("@/app/api/reports/executive/route");
    const res = await GET();

    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 4: App URL SSRF check at save time
// ─────────────────────────────────────────────────────────────────────────────
describe("Fix 4: App URL SSRF check at save time", () => {
  describe("POST /api/apps", () => {
    function makePostRequest(body: unknown) {
      return new Request("http://localhost/api/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    it("returns 400 when app URL resolves to a private IP", async () => {
      getSession.mockResolvedValue(makeSession());
      isPrivateUrl.mockResolvedValue(true);

      const { POST } = await import("@/app/api/apps/route");
      const req = makePostRequest({ name: "Internal App", url: "http://192.168.1.1", criticality: "HIGH" });
      const res = await POST(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/public address/i);
      expect(monitoredAppCreate).not.toHaveBeenCalled();
    });

    it("proceeds when app URL is a public address", async () => {
      getSession.mockResolvedValue(makeSession());
      isPrivateUrl.mockResolvedValue(false);
      monitoredAppFindFirst.mockResolvedValue(null);
      monitoredAppCreate.mockResolvedValue({
        id: "app-1",
        orgId: "org-1",
        name: "Public App",
        url: "https://example.com",
        criticality: "MEDIUM",
      });

      const { POST } = await import("@/app/api/apps/route");
      const req = makePostRequest({ name: "Public App", url: "https://example.com" });
      const res = await POST(req);

      expect(res.status).toBe(201);
      expect(monitoredAppCreate).toHaveBeenCalledOnce();
    });
  });

  describe("PATCH /api/apps/[id]", () => {
    function makePatchRequest(body: unknown) {
      return new Request("http://localhost/api/apps/app-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    it("returns 400 when updated app URL resolves to a private IP", async () => {
      getSession.mockResolvedValue(makeSession({ role: "OWNER" }));
      isPrivateUrl.mockResolvedValue(true);

      const { PATCH } = await import("@/app/api/apps/[id]/route");
      const req = makePatchRequest({ url: "http://10.0.0.1" });
      const res = await PATCH(req, { params: Promise.resolve({ id: "app-1" }) });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/public address/i);
      expect(monitoredAppUpdate).not.toHaveBeenCalled();
    });

    it("proceeds when updated app URL is a public address", async () => {
      getSession.mockResolvedValue(makeSession({ role: "OWNER" }));
      isPrivateUrl.mockResolvedValue(false);
      monitoredAppFindFirst.mockResolvedValue({ id: "app-1", orgId: "org-1", name: "My App" });
      monitoredAppUpdate.mockResolvedValue({ id: "app-1", orgId: "org-1", name: "My App", url: "https://new.example.com" });

      const { PATCH } = await import("@/app/api/apps/[id]/route");
      const req = makePatchRequest({ url: "https://new.example.com" });
      const res = await PATCH(req, { params: Promise.resolve({ id: "app-1" }) });

      expect(res.status).toBe(200);
      expect(monitoredAppUpdate).toHaveBeenCalledOnce();
    });

    it("skips SSRF check when URL is not included in the patch", async () => {
      getSession.mockResolvedValue(makeSession({ role: "OWNER" }));
      isPrivateUrl.mockResolvedValue(true); // Would fail if called
      monitoredAppFindFirst.mockResolvedValue({ id: "app-1", orgId: "org-1", name: "My App" });
      monitoredAppUpdate.mockResolvedValue({ id: "app-1", orgId: "org-1", name: "Renamed App" });

      const { PATCH } = await import("@/app/api/apps/[id]/route");
      const req = makePatchRequest({ name: "Renamed App" });
      const res = await PATCH(req, { params: Promise.resolve({ id: "app-1" }) });

      expect(res.status).toBe(200);
      expect(isPrivateUrl).not.toHaveBeenCalled();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 5: Finding notes max length
// ─────────────────────────────────────────────────────────────────────────────
describe("Fix 5: Finding notes max length", () => {
  function makePatchRequest(body: unknown, id = "finding-1") {
    return new Request(`http://localhost/api/findings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 400 when notes exceed 10,000 characters", async () => {
    getSession.mockResolvedValue(makeSession());

    const { PATCH } = await import("@/app/api/findings/[id]/route");
    const req = makePatchRequest({
      status: "OPEN",
      notes: "x".repeat(10001),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "finding-1" }) });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(JSON.stringify(json)).toMatch(/10,000/i);
    expect(findingUpdate).not.toHaveBeenCalled();
  });

  it("accepts notes at exactly 10,000 characters", async () => {
    getSession.mockResolvedValue(makeSession());
    findingFindFirst.mockResolvedValue({
      id: "finding-1",
      status: "OPEN",
      notes: null,
      severity: "HIGH",
    });
    findingUpdate.mockResolvedValue({ id: "finding-1", status: "OPEN", notes: "x".repeat(10000) });

    const { PATCH } = await import("@/app/api/findings/[id]/route");
    const req = makePatchRequest({
      status: "OPEN",
      notes: "x".repeat(10000),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "finding-1" }) });

    expect(res.status).toBe(200);
    expect(findingUpdate).toHaveBeenCalledOnce();
  });

  it("accepts notes that are absent (undefined)", async () => {
    getSession.mockResolvedValue(makeSession());
    findingFindFirst.mockResolvedValue({
      id: "finding-1",
      status: "OPEN",
      notes: null,
      severity: "MEDIUM",
    });
    findingUpdate.mockResolvedValue({ id: "finding-1", status: "ACKNOWLEDGED", notes: null });

    const { PATCH } = await import("@/app/api/findings/[id]/route");
    const req = makePatchRequest({ status: "ACKNOWLEDGED" });
    const res = await PATCH(req, { params: Promise.resolve({ id: "finding-1" }) });

    expect(res.status).toBe(200);
    expect(findingUpdate).toHaveBeenCalledOnce();
  });
});
