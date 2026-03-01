/**
 * subscription-tier-flows.test.ts
 *
 * Deep audit of ALL subscription tier user flows.
 * Covers: FREE, STARTER, PRO, ENTERPRISE, ENTERPRISE_PLUS, EXPIRED
 *
 * Features under test:
 *  - App limits (POST /api/apps, POST /api/apps/bulk)
 *  - User/invite limits (POST /api/team)
 *  - API key access (POST /api/keys)
 *  - Alert channel gating (POST /api/alerts)
 *  - Executive reports (GET /api/reports/executive)
 *  - Evidence packs (GET /api/reports/evidence)
 *  - PDF reports (GET /api/reports/pdf)
 *  - Jira integration (GET/POST/DELETE /api/integrations/jira)
 *  - SSO configuration (GET/POST/DELETE /api/integrations/sso)
 *  - Org limits endpoint (GET /api/org/limits)
 *  - Expired trial hard-blocks across all features
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ─── Auth mocks ───────────────────────────────────────────────────────────────
const getSession = vi.fn();
const requireRole = vi.fn();

vi.mock("@/lib/auth", () => ({ getSession, requireRole }));

// ─── Tenant mocks ─────────────────────────────────────────────────────────────
const getOrgLimits = vi.fn();
const canAddApp = vi.fn();
const canAddUser = vi.fn();
const logAudit = vi.fn();

vi.mock("@/lib/tenant", () => ({ getOrgLimits, canAddApp, canAddUser, logAudit }));

// ─── DB mocks ─────────────────────────────────────────────────────────────────
const monitoredAppCount = vi.fn();
const monitoredAppFindMany = vi.fn();
const monitoredAppCreate = vi.fn();
const alertConfigCreate = vi.fn();
const alertConfigFindMany = vi.fn();
const apiKeyCreate = vi.fn();
const apiKeyFindMany = vi.fn();
const organizationFindUnique = vi.fn();
const sSOConfigFindUnique = vi.fn();
const sSOConfigUpsert = vi.fn();
const sSOConfigDeleteMany = vi.fn();
const integrationConfigFindUnique = vi.fn();
const integrationConfigUpsert = vi.fn();
const integrationConfigDeleteMany = vi.fn();
const subscriptionFindUnique = vi.fn();
const userCount = vi.fn();
const userFindFirst = vi.fn();
const inviteFindFirst = vi.fn();
const inviteCreate = vi.fn();
const auditLogCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    monitoredApp: {
      count: monitoredAppCount,
      findMany: monitoredAppFindMany,
      create: monitoredAppCreate,
      findFirst: vi.fn().mockResolvedValue(null),
    },
    alertConfig: {
      create: alertConfigCreate,
      findMany: alertConfigFindMany,
    },
    apiKey: {
      create: apiKeyCreate,
      findMany: apiKeyFindMany,
    },
    organization: { findUnique: organizationFindUnique },
    sSOConfig: {
      findUnique: sSOConfigFindUnique,
      upsert: sSOConfigUpsert,
      deleteMany: sSOConfigDeleteMany,
    },
    integrationConfig: {
      findUnique: integrationConfigFindUnique,
      upsert: integrationConfigUpsert,
      deleteMany: integrationConfigDeleteMany,
    },
    subscription: { findUnique: subscriptionFindUnique },
    user: { count: userCount, findFirst: userFindFirst },
    invite: { findFirst: inviteFindFirst, create: inviteCreate },
    auditLog: { create: auditLogCreate },
  },
}));

// ─── Utility/library mocks ────────────────────────────────────────────────────
vi.mock("@/lib/observability", () => ({ logApiError: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/crypto-util", () => ({
  obfuscate: vi.fn().mockReturnValue("encrypted-secret"),
  deobfuscate: vi.fn().mockReturnValue("raw-secret"),
}));
vi.mock("@/lib/pdf-report", () => ({
  generateComplianceReport: vi.fn().mockResolvedValue(Buffer.from("pdf-content")),
  generateEvidencePack: vi.fn().mockResolvedValue(Buffer.from("evidence-content")),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a session object for a given role */
function makeSession(role: string = "ADMIN") {
  return { id: "user_1", orgId: "org_test", role, email: "admin@test.com", name: "Test Admin" };
}

/** Build tier limits matching what getOrgLimits returns */
function makeLimits(tier: string) {
  const matrix: Record<string, { maxApps: number; maxUsers: number }> = {
    FREE:             { maxApps: 2,   maxUsers: 1   },
    STARTER:          { maxApps: 5,   maxUsers: 2   },
    PRO:              { maxApps: 15,  maxUsers: 10  },
    ENTERPRISE:       { maxApps: 100, maxUsers: 50  },
    ENTERPRISE_PLUS:  { maxApps: 999, maxUsers: 999 },
    EXPIRED:          { maxApps: 0,   maxUsers: 0   },
  };
  return {
    tier,
    status: tier === "EXPIRED" ? "CANCELED" : "ACTIVE",
    ...(matrix[tier] ?? { maxApps: 0, maxUsers: 0 }),
    trialEndsAt: null,
    cancelAtPeriodEnd: false,
  };
}

function postReq(body: unknown) {
  return new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function getReq(url = "http://localhost") {
  return new Request(url);
}

function deleteReq() {
  return new Request("http://localhost", { method: "DELETE" });
}

// ─────────────────────────────────────────────────────────────────────────────
// Reset all mocks before each test
// ─────────────────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  logAudit.mockResolvedValue(undefined);
  auditLogCreate.mockResolvedValue({});
});

// =============================================================================
// SECTION 1: App limit enforcement — POST /api/apps
// =============================================================================

describe("POST /api/apps — app limit enforcement per tier", () => {
  const validApp = {
    url: "https://example.com",
    name: "My App",
    ownerEmail: "owner@test.com",
    criticality: "medium",
  };

  it("FREE: allows adding app when under limit (current: 1 of 2)", async () => {
    getSession.mockResolvedValue(makeSession());
    canAddApp.mockResolvedValue({ allowed: true });
    monitoredAppCreate.mockResolvedValue({ id: "app_1", ...validApp, orgId: "org_test" });

    const { POST } = await import("@/app/api/apps/route");
    const res = await POST(postReq(validApp));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.app.id).toBe("app_1");
  });

  it("FREE: blocks adding app when at limit (2 of 2) with correct error message", async () => {
    getSession.mockResolvedValue(makeSession());
    canAddApp.mockResolvedValue({
      allowed: false,
      reason: "Your FREE plan allows 2 apps. Upgrade to add more.",
    });

    const { POST } = await import("@/app/api/apps/route");
    const res = await POST(postReq(validApp));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.message).toContain("FREE plan allows 2 apps");
    expect(json.error.message).toContain("Upgrade");
  });

  it("STARTER: blocks adding app when at limit (5 of 5)", async () => {
    getSession.mockResolvedValue(makeSession());
    canAddApp.mockResolvedValue({
      allowed: false,
      reason: "Your STARTER plan allows 5 apps. Upgrade to add more.",
    });

    const { POST } = await import("@/app/api/apps/route");
    const res = await POST(postReq(validApp));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.message).toContain("STARTER plan allows 5 apps");
  });

  it("PRO: allows adding app when under limit (3 of 15)", async () => {
    getSession.mockResolvedValue(makeSession());
    canAddApp.mockResolvedValue({ allowed: true });
    monitoredAppCreate.mockResolvedValue({ id: "app_pro", ...validApp, orgId: "org_test" });

    const { POST } = await import("@/app/api/apps/route");
    const res = await POST(postReq(validApp));
    expect(res.status).toBe(201);
  });

  it("PRO: blocks adding app when at limit (15 of 15)", async () => {
    getSession.mockResolvedValue(makeSession());
    canAddApp.mockResolvedValue({
      allowed: false,
      reason: "Your PRO plan allows 15 apps. Upgrade to add more.",
    });

    const { POST } = await import("@/app/api/apps/route");
    const res = await POST(postReq(validApp));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.message).toContain("PRO plan allows 15 apps");
  });

  it("EXPIRED: blocks all app creation (0 app limit)", async () => {
    getSession.mockResolvedValue(makeSession());
    canAddApp.mockResolvedValue({
      allowed: false,
      reason: "Your EXPIRED plan allows 0 apps. Upgrade to add more.",
    });

    const { POST } = await import("@/app/api/apps/route");
    const res = await POST(postReq(validApp));
    expect(res.status).toBe(403);
  });

  it("returns 400 on invalid app input (missing ownerEmail)", async () => {
    getSession.mockResolvedValue(makeSession());

    const { POST } = await import("@/app/api/apps/route");
    const res = await POST(postReq({ url: "https://example.com", name: "Test" }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);

    const { POST } = await import("@/app/api/apps/route");
    const res = await POST(postReq(validApp));
    expect(res.status).toBe(401);
  });

  it("returns 409 on duplicate URL within org", async () => {
    getSession.mockResolvedValue(makeSession());
    canAddApp.mockResolvedValue({ allowed: true });
    // Simulate existing app with same URL by making findFirst return an existing app
    const { db } = await import("@/lib/db");
    (db.monitoredApp.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "existing_app",
      name: "Existing App",
      url: "https://example.com",
    });

    const { POST } = await import("@/app/api/apps/route");
    const res = await POST(postReq(validApp));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.message).toContain("already monitored");
  });
});

// =============================================================================
// SECTION 2: Bulk app limits — POST /api/apps/bulk
// =============================================================================

describe("POST /api/apps/bulk — bulk app limit per tier", () => {
  it("FREE: blocks bulk add when already at limit (2 of 2)", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("FREE"));
    monitoredAppCount.mockResolvedValue(2); // at limit
    monitoredAppFindMany.mockResolvedValue([]);

    const { POST } = await import("@/app/api/apps/bulk/route");
    const res = await POST(postReq({ apps: [{ url: "https://new.com" }] }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.message).toContain("FREE plan allows 2 apps");
  });

  it("STARTER: partially creates apps up to slot limit", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("STARTER")); // maxApps: 5
    monitoredAppCount.mockResolvedValue(4); // 1 slot remaining
    monitoredAppFindMany.mockResolvedValue([]); // no existing URLs
    monitoredAppCreate.mockResolvedValue({ id: "app_new" });

    const { POST } = await import("@/app/api/apps/bulk/route");
    const res = await POST(postReq({
      apps: [
        { url: "https://one.com" },
        { url: "https://two.com" }, // hits limit after first
      ],
    }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.created).toBe(1);
    expect(json.errors).toHaveLength(1);
    expect(json.errors[0].reason).toContain("Plan limit reached");
  });

  it("PRO: creates multiple apps within limit", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("PRO")); // maxApps: 15
    monitoredAppCount.mockResolvedValue(3); // 12 slots remaining
    monitoredAppFindMany.mockResolvedValue([]); // no existing URLs
    monitoredAppCreate.mockResolvedValue({ id: "app_new" });

    const { POST } = await import("@/app/api/apps/bulk/route");
    const res = await POST(postReq({
      apps: [
        { url: "https://one.com" },
        { url: "https://two.com" },
        { url: "https://three.com" },
      ],
    }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.created).toBe(3);
    expect(json.errors).toHaveLength(0);
  });

  it("EXPIRED: blocks all bulk add (0 slots)", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("EXPIRED")); // maxApps: 0
    monitoredAppCount.mockResolvedValue(0); // technically 0 but limit is also 0

    const { POST } = await import("@/app/api/apps/bulk/route");
    const res = await POST(postReq({ apps: [{ url: "https://new.com" }] }));
    expect(res.status).toBe(403);
  });

  it("skips duplicate URLs within the bulk batch", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));
    monitoredAppCount.mockResolvedValue(0);
    monitoredAppFindMany.mockResolvedValue([{ url: "https://existing.com" }]); // already exists
    monitoredAppCreate.mockResolvedValue({ id: "app_new" });

    const { POST } = await import("@/app/api/apps/bulk/route");
    const res = await POST(postReq({
      apps: [
        { url: "https://existing.com" }, // duplicate → skip
        { url: "https://new.com" },       // new → create
      ],
    }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.created).toBe(1);
    expect(json.skipped).toBe(1);
  });

  it("returns 400 when apps array is empty", async () => {
    getSession.mockResolvedValue(makeSession());

    const { POST } = await import("@/app/api/apps/bulk/route");
    const res = await POST(postReq({ apps: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);

    const { POST } = await import("@/app/api/apps/bulk/route");
    const res = await POST(postReq({ apps: [{ url: "https://new.com" }] }));
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// SECTION 3: API key access — POST /api/keys
// =============================================================================

describe("POST /api/keys — API key access per tier", () => {
  it("FREE: blocks API key creation with upgrade prompt", async () => {
    getSession.mockResolvedValue(makeSession("ADMIN"));
    getOrgLimits.mockResolvedValue(makeLimits("FREE"));

    const { POST } = await import("@/app/api/keys/route");
    const res = await POST(postReq({ name: "My Key" }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("Pro and Enterprise plans");
    expect(json.error).toContain("upgrade");
  });

  it("STARTER: blocks API key creation with upgrade prompt", async () => {
    getSession.mockResolvedValue(makeSession("ADMIN"));
    getOrgLimits.mockResolvedValue(makeLimits("STARTER"));

    const { POST } = await import("@/app/api/keys/route");
    const res = await POST(postReq({ name: "My Key" }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("Pro and Enterprise plans");
  });

  it("PRO: allows API key creation for admin", async () => {
    getSession.mockResolvedValue(makeSession("ADMIN"));
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));
    apiKeyCreate.mockResolvedValue({
      id: "key_1",
      name: "My Key",
      keyPrefix: "vs_abc12",
      lastUsedAt: null,
      createdAt: new Date(),
    });

    const { POST } = await import("@/app/api/keys/route");
    const res = await POST(postReq({ name: "My Key" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.key.id).toBe("key_1");
    expect(json.plainKey).toMatch(/^vs_/);
  });

  it("ENTERPRISE: allows API key creation for owner", async () => {
    getSession.mockResolvedValue(makeSession("OWNER"));
    getOrgLimits.mockResolvedValue(makeLimits("ENTERPRISE"));
    apiKeyCreate.mockResolvedValue({
      id: "key_ent",
      name: "Enterprise Key",
      keyPrefix: "vs_xyz99",
      lastUsedAt: null,
      createdAt: new Date(),
    });

    const { POST } = await import("@/app/api/keys/route");
    const res = await POST(postReq({ name: "Enterprise Key" }));
    expect(res.status).toBe(201);
  });

  it("ENTERPRISE_PLUS: allows API key creation", async () => {
    getSession.mockResolvedValue(makeSession("ADMIN"));
    getOrgLimits.mockResolvedValue(makeLimits("ENTERPRISE_PLUS"));
    apiKeyCreate.mockResolvedValue({
      id: "key_ep",
      name: "EP Key",
      keyPrefix: "vs_ep123",
      lastUsedAt: null,
      createdAt: new Date(),
    });

    const { POST } = await import("@/app/api/keys/route");
    const res = await POST(postReq({ name: "EP Key" }));
    expect(res.status).toBe(201);
  });

  it("EXPIRED: blocks API key creation", async () => {
    getSession.mockResolvedValue(makeSession("ADMIN"));
    getOrgLimits.mockResolvedValue(makeLimits("EXPIRED"));

    const { POST } = await import("@/app/api/keys/route");
    const res = await POST(postReq({ name: "My Key" }));
    expect(res.status).toBe(403);
  });

  it("PRO: MEMBER role is blocked from creating API keys (role check)", async () => {
    getSession.mockResolvedValue(makeSession("MEMBER"));
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));

    const { POST } = await import("@/app/api/keys/route");
    const res = await POST(postReq({ name: "My Key" }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("Admin access required");
  });

  it("PRO: VIEWER role is blocked from creating API keys", async () => {
    getSession.mockResolvedValue(makeSession("VIEWER"));
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));

    const { POST } = await import("@/app/api/keys/route");
    const res = await POST(postReq({ name: "My Key" }));
    expect(res.status).toBe(403);
  });

  it("returns 401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);

    const { POST } = await import("@/app/api/keys/route");
    const res = await POST(postReq({ name: "Key" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when name is missing", async () => {
    getSession.mockResolvedValue(makeSession("ADMIN"));
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));

    const { POST } = await import("@/app/api/keys/route");
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
  });
});

// =============================================================================
// SECTION 4: Alert channel gating — POST /api/alerts
// =============================================================================

describe("POST /api/alerts — alert channel gating per tier", () => {
  it("FREE: blocks ALL alert channels (EMAIL, SLACK, WEBHOOK)", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("FREE"));

    const { POST } = await import("@/app/api/alerts/route");

    for (const channel of ["EMAIL", "SLACK", "WEBHOOK"] as const) {
      const res = await POST(postReq({ channel, destination: "test@test.com", minSeverity: "HIGH" }));
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain("does not include alert channels");
    }
  });

  it("STARTER: allows EMAIL alerts", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("STARTER"));
    alertConfigCreate.mockResolvedValue({ id: "alert_1", channel: "EMAIL" });

    const { POST } = await import("@/app/api/alerts/route");
    const res = await POST(postReq({ channel: "EMAIL", destination: "ops@test.com", minSeverity: "HIGH" }));
    expect(res.status).toBe(201);
  });

  it("STARTER: blocks SLACK alerts with tier message", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("STARTER"));

    const { POST } = await import("@/app/api/alerts/route");
    const res = await POST(postReq({ channel: "SLACK", destination: "https://hooks.slack.com/test", minSeverity: "HIGH" }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("SLACK alerts are not available on your plan");
    expect(json.error).toContain("STARTER plan supports: EMAIL");
  });

  it("STARTER: blocks WEBHOOK alerts with tier message", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("STARTER"));

    const { POST } = await import("@/app/api/alerts/route");
    const res = await POST(postReq({ channel: "WEBHOOK", destination: "https://my-webhook.com", minSeverity: "HIGH" }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("WEBHOOK alerts are not available on your plan");
  });

  it("PRO: allows EMAIL and SLACK alerts", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));
    alertConfigCreate.mockResolvedValue({ id: "alert_pro" });

    const { POST } = await import("@/app/api/alerts/route");

    for (const channel of ["EMAIL", "SLACK"] as const) {
      alertConfigCreate.mockResolvedValueOnce({ id: `alert_${channel}`, channel });
      const res = await POST(postReq({ channel, destination: "https://target.com", minSeverity: "HIGH" }));
      expect(res.status).toBe(201);
    }
  });

  it("PRO: blocks WEBHOOK alerts with tier message", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));

    const { POST } = await import("@/app/api/alerts/route");
    const res = await POST(postReq({ channel: "WEBHOOK", destination: "https://my-webhook.com", minSeverity: "HIGH" }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("WEBHOOK alerts are not available on your plan");
    expect(json.error).toContain("PRO plan supports: EMAIL, SLACK");
    expect(json.error).toContain("Upgrade");
  });

  it("ENTERPRISE: allows ALL channels (EMAIL, SLACK, WEBHOOK)", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("ENTERPRISE"));
    alertConfigCreate.mockResolvedValue({ id: "alert_ent" });

    const { POST } = await import("@/app/api/alerts/route");

    for (const channel of ["EMAIL", "SLACK", "WEBHOOK"] as const) {
      alertConfigCreate.mockResolvedValueOnce({ id: `alert_${channel}`, channel });
      const res = await POST(postReq({ channel, destination: "https://target.com", minSeverity: "HIGH" }));
      expect(res.status).toBe(201);
    }
  });

  it("ENTERPRISE_PLUS: allows ALL channels", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("ENTERPRISE_PLUS"));
    alertConfigCreate.mockResolvedValue({ id: "alert_ep" });

    const { POST } = await import("@/app/api/alerts/route");

    for (const channel of ["EMAIL", "SLACK", "WEBHOOK"] as const) {
      alertConfigCreate.mockResolvedValueOnce({ id: `alert_${channel}`, channel });
      const res = await POST(postReq({ channel, destination: "https://target.com", minSeverity: "HIGH" }));
      expect(res.status).toBe(201);
    }
  });

  it("EXPIRED: blocks ALL alert channels", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("EXPIRED"));

    const { POST } = await import("@/app/api/alerts/route");

    for (const channel of ["EMAIL", "SLACK", "WEBHOOK"] as const) {
      const res = await POST(postReq({ channel, destination: "test@test.com", minSeverity: "HIGH" }));
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain("does not include alert channels");
    }
  });

  it("returns 400 on invalid channel value", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("ENTERPRISE"));

    const { POST } = await import("@/app/api/alerts/route");
    const res = await POST(postReq({ channel: "TEAMS", destination: "https://test.com" }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);

    const { POST } = await import("@/app/api/alerts/route");
    const res = await POST(postReq({ channel: "EMAIL", destination: "ops@test.com" }));
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// SECTION 5: Executive reports — GET /api/reports/executive
// =============================================================================

describe("GET /api/reports/executive — tier gating", () => {
  /** Set up minimal DB mocks for a successful executive report fetch */
  function setupReportDB() {
    organizationFindUnique.mockResolvedValue({ name: "Test Org" });
    monitoredAppFindMany.mockResolvedValue([]);
  }

  it("FREE: blocks executive report with tier message", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("FREE"));

    const { GET } = await import("@/app/api/reports/executive/route");
    const res = await GET();
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("PRO or ENTERPRISE plan");
    expect(json.tier).toBe("FREE");
  });

  it("STARTER: blocks executive report with tier message", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("STARTER"));

    const { GET } = await import("@/app/api/reports/executive/route");
    const res = await GET();
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.tier).toBe("STARTER");
  });

  it("PRO: allows executive report", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));
    setupReportDB();

    const { GET } = await import("@/app/api/reports/executive/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.summary).toBeDefined();
    expect(json.org.tier).toBe("PRO");
  });

  it("ENTERPRISE: allows executive report", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("ENTERPRISE"));
    setupReportDB();

    const { GET } = await import("@/app/api/reports/executive/route");
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("ENTERPRISE_PLUS: allows executive report", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("ENTERPRISE_PLUS"));
    setupReportDB();

    const { GET } = await import("@/app/api/reports/executive/route");
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("EXPIRED: blocks executive report", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("EXPIRED"));

    const { GET } = await import("@/app/api/reports/executive/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);

    const { GET } = await import("@/app/api/reports/executive/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// SECTION 6: Evidence packs — GET /api/reports/evidence
// =============================================================================

describe("GET /api/reports/evidence — tier gating", () => {
  const validUrl = "http://localhost/api/reports/evidence?from=2025-01-01&to=2025-12-31&framework=soc2";

  it("FREE: blocks evidence pack with tier message", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("FREE"));

    const { GET } = await import("@/app/api/reports/evidence/route");
    const res = await GET(new NextRequest(validUrl));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("Pro and Enterprise plans");
  });

  it("STARTER: blocks evidence pack", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("STARTER"));

    const { GET } = await import("@/app/api/reports/evidence/route");
    const res = await GET(new NextRequest(validUrl));
    expect(res.status).toBe(403);
  });

  it("PRO: allows evidence pack download", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));

    const { GET } = await import("@/app/api/reports/evidence/route");
    const res = await GET(new NextRequest(validUrl));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("ENTERPRISE: allows evidence pack download", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("ENTERPRISE"));

    const { GET } = await import("@/app/api/reports/evidence/route");
    const res = await GET(new NextRequest(validUrl));
    expect(res.status).toBe(200);
  });

  it("ENTERPRISE_PLUS: allows evidence pack download", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("ENTERPRISE_PLUS"));

    const { GET } = await import("@/app/api/reports/evidence/route");
    const res = await GET(new NextRequest(validUrl));
    expect(res.status).toBe(200);
  });

  it("EXPIRED: blocks evidence pack", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("EXPIRED"));

    const { GET } = await import("@/app/api/reports/evidence/route");
    const res = await GET(new NextRequest(validUrl));
    expect(res.status).toBe(403);
  });

  it("PRO: returns 400 when query params are missing", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));

    const { GET } = await import("@/app/api/reports/evidence/route");
    const res = await GET(new NextRequest("http://localhost/api/reports/evidence"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Missing required parameters");
  });

  it("PRO: returns 400 on invalid framework", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));

    const { GET } = await import("@/app/api/reports/evidence/route");
    const res = await GET(new NextRequest("http://localhost/api/reports/evidence?from=2025-01-01&to=2025-12-31&framework=hipaa"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Invalid framework");
  });

  it("PRO: accepts all valid frameworks (soc2, iso27001, nist)", async () => {
    getSession.mockResolvedValue(makeSession());
    const { GET } = await import("@/app/api/reports/evidence/route");

    for (const framework of ["soc2", "iso27001", "nist"]) {
      getOrgLimits.mockResolvedValueOnce(makeLimits("PRO"));
      const res = await GET(new NextRequest(`http://localhost/api/reports/evidence?from=2025-01-01&to=2025-12-31&framework=${framework}`));
      expect(res.status).toBe(200);
    }
  });

  it("returns 401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);

    const { GET } = await import("@/app/api/reports/evidence/route");
    const res = await GET(new NextRequest(validUrl));
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// SECTION 7: PDF reports — GET /api/reports/pdf
// =============================================================================

describe("GET /api/reports/pdf — tier gating", () => {
  it("FREE: blocks PDF report with tier message", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("FREE"));

    const { GET } = await import("@/app/api/reports/pdf/route");
    const res = await GET();
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("Pro and Enterprise plans");
  });

  it("STARTER: blocks PDF report", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("STARTER"));

    const { GET } = await import("@/app/api/reports/pdf/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("PRO: allows PDF report download", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));

    const { GET } = await import("@/app/api/reports/pdf/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("ENTERPRISE: allows PDF report download", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("ENTERPRISE"));

    const { GET } = await import("@/app/api/reports/pdf/route");
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("ENTERPRISE_PLUS: allows PDF report download", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("ENTERPRISE_PLUS"));

    const { GET } = await import("@/app/api/reports/pdf/route");
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("EXPIRED: blocks PDF report", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("EXPIRED"));

    const { GET } = await import("@/app/api/reports/pdf/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);

    const { GET } = await import("@/app/api/reports/pdf/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// SECTION 8: Jira integration — tier gating
// =============================================================================

describe("/api/integrations/jira — Jira tier gating", () => {
  const validJiraConfig = {
    url: "https://myorg.atlassian.net",
    email: "admin@myorg.com",
    apiToken: "jira-token-123",
    projectKey: "SEC",
    issueType: "Bug",
  };

  /** Set up requireRole to resolve (ADMIN or OWNER) */
  function mockOwnerSession() {
    requireRole.mockResolvedValue(makeSession("OWNER"));
  }
  function mockAdminSession() {
    requireRole.mockResolvedValue(makeSession("ADMIN"));
  }

  it("FREE: GET blocks Jira config access with tier message", async () => {
    mockAdminSession();
    getOrgLimits.mockResolvedValue(makeLimits("FREE"));

    const { GET } = await import("@/app/api/integrations/jira/route");
    const res = await GET();
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("Pro and Enterprise plans");
    expect(json.error).toContain("Jira integration");
  });

  it("STARTER: GET blocks Jira config access", async () => {
    mockAdminSession();
    getOrgLimits.mockResolvedValue(makeLimits("STARTER"));

    const { GET } = await import("@/app/api/integrations/jira/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("PRO: GET allows Jira config access (returns null when unconfigured)", async () => {
    mockAdminSession();
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));
    integrationConfigFindUnique.mockResolvedValue(null);

    const { GET } = await import("@/app/api/integrations/jira/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBeNull();
  });

  it("PRO: POST creates Jira config successfully", async () => {
    mockAdminSession();
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));
    integrationConfigUpsert.mockResolvedValue({ id: "int_1" });

    const { POST } = await import("@/app/api/integrations/jira/route");
    const res = await POST(postReq(validJiraConfig));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("ENTERPRISE: POST creates Jira config", async () => {
    mockOwnerSession();
    getOrgLimits.mockResolvedValue(makeLimits("ENTERPRISE"));
    integrationConfigUpsert.mockResolvedValue({ id: "int_ent" });

    const { POST } = await import("@/app/api/integrations/jira/route");
    const res = await POST(postReq(validJiraConfig));
    expect(res.status).toBe(200);
  });

  it("ENTERPRISE_PLUS: POST creates Jira config", async () => {
    mockAdminSession();
    getOrgLimits.mockResolvedValue(makeLimits("ENTERPRISE_PLUS"));
    integrationConfigUpsert.mockResolvedValue({ id: "int_ep" });

    const { POST } = await import("@/app/api/integrations/jira/route");
    const res = await POST(postReq(validJiraConfig));
    expect(res.status).toBe(200);
  });

  it("EXPIRED: POST blocks Jira config creation", async () => {
    mockAdminSession();
    getOrgLimits.mockResolvedValue(makeLimits("EXPIRED"));

    const { POST } = await import("@/app/api/integrations/jira/route");
    const res = await POST(postReq(validJiraConfig));
    expect(res.status).toBe(403);
  });

  it("PRO: DELETE removes Jira config", async () => {
    mockAdminSession();
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));
    integrationConfigDeleteMany.mockResolvedValue({});

    const { DELETE } = await import("@/app/api/integrations/jira/route");
    const res = await DELETE();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("STARTER: DELETE blocks Jira config removal", async () => {
    mockAdminSession();
    getOrgLimits.mockResolvedValue(makeLimits("STARTER"));

    const { DELETE } = await import("@/app/api/integrations/jira/route");
    const res = await DELETE();
    expect(res.status).toBe(403);
  });

  it("blocks MEMBER role (requireRole throws Forbidden)", async () => {
    requireRole.mockRejectedValue(new Error("Forbidden"));

    const { GET } = await import("@/app/api/integrations/jira/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated (requireRole throws Unauthorized)", async () => {
    requireRole.mockRejectedValue(new Error("Unauthorized"));

    const { GET } = await import("@/app/api/integrations/jira/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("PRO: POST returns 400 on invalid Jira config (missing fields)", async () => {
    mockAdminSession();
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));

    const { POST } = await import("@/app/api/integrations/jira/route");
    const res = await POST(postReq({ url: "not-a-url", email: "bad", apiToken: "" }));
    expect(res.status).toBe(400);
  });
});

// =============================================================================
// SECTION 9: SSO configuration — tier gating
// =============================================================================

describe("/api/integrations/sso — SSO tier gating", () => {
  const validSSOConfig = {
    provider: "oidc",
    clientId: "client-id-123",
    clientSecret: "secret-xyz",
    domain: "mycompany.com",
    discoveryUrl: "https://login.microsoftonline.com/tenant/.well-known/openid-configuration",
  };

  function mockOwnerSession() {
    requireRole.mockResolvedValue(makeSession("OWNER"));
  }

  it("FREE: GET blocks SSO config with tier message", async () => {
    mockOwnerSession();
    getOrgLimits.mockResolvedValue(makeLimits("FREE"));

    const { GET } = await import("@/app/api/integrations/sso/route");
    const res = await GET();
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("SSO is available on Enterprise plans only");
    expect(json.error).toContain("Upgrade");
  });

  it("STARTER: GET blocks SSO config", async () => {
    mockOwnerSession();
    getOrgLimits.mockResolvedValue(makeLimits("STARTER"));

    const { GET } = await import("@/app/api/integrations/sso/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("PRO: GET blocks SSO config (SSO is Enterprise-only)", async () => {
    mockOwnerSession();
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));

    const { GET } = await import("@/app/api/integrations/sso/route");
    const res = await GET();
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("Enterprise plans only");
  });

  it("ENTERPRISE: GET allows SSO config access (returns null when unconfigured)", async () => {
    mockOwnerSession();
    getOrgLimits.mockResolvedValue(makeLimits("ENTERPRISE"));
    sSOConfigFindUnique.mockResolvedValue(null);

    const { GET } = await import("@/app/api/integrations/sso/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBeNull();
  });

  it("ENTERPRISE: POST configures SSO successfully", async () => {
    mockOwnerSession();
    getOrgLimits.mockResolvedValue(makeLimits("ENTERPRISE"));
    sSOConfigFindUnique.mockResolvedValue(null);
    sSOConfigUpsert.mockResolvedValue({ id: "sso_1" });

    const { POST } = await import("@/app/api/integrations/sso/route");
    const res = await POST(postReq(validSSOConfig));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("ENTERPRISE_PLUS: POST configures SSO successfully", async () => {
    mockOwnerSession();
    getOrgLimits.mockResolvedValue(makeLimits("ENTERPRISE_PLUS"));
    sSOConfigFindUnique.mockResolvedValue(null);
    sSOConfigUpsert.mockResolvedValue({ id: "sso_ep" });

    const { POST } = await import("@/app/api/integrations/sso/route");
    const res = await POST(postReq(validSSOConfig));
    expect(res.status).toBe(200);
  });

  it("ENTERPRISE: DELETE removes SSO config", async () => {
    mockOwnerSession();
    getOrgLimits.mockResolvedValue(makeLimits("ENTERPRISE"));
    sSOConfigDeleteMany.mockResolvedValue({});

    const { DELETE } = await import("@/app/api/integrations/sso/route");
    const res = await DELETE();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("PRO: DELETE blocks SSO config removal", async () => {
    mockOwnerSession();
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));

    const { DELETE } = await import("@/app/api/integrations/sso/route");
    const res = await DELETE();
    expect(res.status).toBe(403);
  });

  it("EXPIRED: POST blocks SSO configuration", async () => {
    mockOwnerSession();
    getOrgLimits.mockResolvedValue(makeLimits("EXPIRED"));

    const { POST } = await import("@/app/api/integrations/sso/route");
    const res = await POST(postReq(validSSOConfig));
    expect(res.status).toBe(403);
  });

  it("non-OWNER role is blocked from SSO config (requireRole throws Forbidden)", async () => {
    requireRole.mockRejectedValue(new Error("Forbidden"));

    const { POST } = await import("@/app/api/integrations/sso/route");
    const res = await POST(postReq(validSSOConfig));
    expect(res.status).toBe(403);
  });

  it("returns 401 when unauthenticated", async () => {
    requireRole.mockRejectedValue(new Error("Unauthorized"));

    const { GET } = await import("@/app/api/integrations/sso/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("ENTERPRISE: POST returns 400 on invalid SSO config (bad discovery URL)", async () => {
    mockOwnerSession();
    getOrgLimits.mockResolvedValue(makeLimits("ENTERPRISE"));

    const { POST } = await import("@/app/api/integrations/sso/route");
    const res = await POST(postReq({ provider: "oidc", clientId: "id", domain: "test.com", discoveryUrl: "not-a-url" }));
    expect(res.status).toBe(400);
  });

  it("ENTERPRISE: POST returns 400 on invalid SSO provider value", async () => {
    mockOwnerSession();
    getOrgLimits.mockResolvedValue(makeLimits("ENTERPRISE"));

    const { POST } = await import("@/app/api/integrations/sso/route");
    const res = await POST(postReq({ provider: "google", clientId: "id", domain: "test.com" }));
    expect(res.status).toBe(400);
  });

  it("ENTERPRISE: GET returns existing SSO config with masked secret", async () => {
    mockOwnerSession();
    getOrgLimits.mockResolvedValue(makeLimits("ENTERPRISE"));
    sSOConfigFindUnique.mockResolvedValue({
      id: "sso_1",
      provider: "oidc",
      clientId: "client-id-123",
      clientSecret: "encrypted-value",
      tenantId: null,
      domain: "mycompany.com",
      discoveryUrl: "https://login.example.com/.well-known/openid-configuration",
      enabled: true,
    });

    const { GET } = await import("@/app/api/integrations/sso/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.clientSecret).toBe("••••••••"); // masked
    expect(json.clientId).toBe("client-id-123"); // shown
  });
});

// =============================================================================
// SECTION 10: Org limits endpoint — GET /api/org/limits
// =============================================================================

describe("GET /api/org/limits — returns correct tier limits", () => {
  it("FREE: returns correct maxApps and maxUsers", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("FREE"));

    const { GET } = await import("@/app/api/org/limits/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tier).toBe("FREE");
    expect(json.maxApps).toBe(2);
    expect(json.maxUsers).toBe(1);
  });

  it("STARTER: returns correct limits", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("STARTER"));

    const { GET } = await import("@/app/api/org/limits/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tier).toBe("STARTER");
    expect(json.maxApps).toBe(5);
    expect(json.maxUsers).toBe(2);
  });

  it("PRO: returns correct limits", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));

    const { GET } = await import("@/app/api/org/limits/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tier).toBe("PRO");
    expect(json.maxApps).toBe(15);
    expect(json.maxUsers).toBe(10);
  });

  it("ENTERPRISE: returns correct limits", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("ENTERPRISE"));

    const { GET } = await import("@/app/api/org/limits/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tier).toBe("ENTERPRISE");
    expect(json.maxApps).toBe(100);
    expect(json.maxUsers).toBe(50);
  });

  it("ENTERPRISE_PLUS: returns correct limits", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("ENTERPRISE_PLUS"));

    const { GET } = await import("@/app/api/org/limits/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tier).toBe("ENTERPRISE_PLUS");
    expect(json.maxApps).toBe(999);
    expect(json.maxUsers).toBe(999);
  });

  it("EXPIRED: returns maxApps: 0, maxUsers: 0", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("EXPIRED"));

    const { GET } = await import("@/app/api/org/limits/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tier).toBe("EXPIRED");
    expect(json.maxApps).toBe(0);
    expect(json.maxUsers).toBe(0);
  });

  it("returns 401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);

    const { GET } = await import("@/app/api/org/limits/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// SECTION 11: User/invite limits — POST /api/team
// =============================================================================

describe("POST /api/team — user limit enforcement per tier", () => {
  it("FREE: blocks inviting second user (at limit 1 of 1)", async () => {
    getSession.mockResolvedValue(makeSession("ADMIN"));
    canAddUser.mockResolvedValue({
      allowed: false,
      reason: "Your FREE plan allows 1 users. Upgrade to add more.",
    });

    const { POST } = await import("@/app/api/team/route");
    const res = await POST(postReq({ email: "new@test.com", role: "MEMBER" }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("FREE plan allows 1 users");
  });

  it("STARTER: allows inviting up to 2 users", async () => {
    getSession.mockResolvedValue(makeSession("ADMIN"));
    canAddUser.mockResolvedValue({ allowed: true });
    userFindFirst.mockResolvedValue(null); // no existing user with email
    inviteFindFirst.mockResolvedValue(null); // no pending invite
    inviteCreate.mockResolvedValue({ id: "invite_1", token: "tok123" });
    // Prevent real fetch for email sending
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));

    const { POST } = await import("@/app/api/team/route");
    const res = await POST(postReq({ email: "colleague@test.com", role: "MEMBER" }));
    expect(res.status).toBe(201);
    vi.unstubAllGlobals();
  });

  it("STARTER: blocks inviting beyond 2 users", async () => {
    getSession.mockResolvedValue(makeSession("ADMIN"));
    canAddUser.mockResolvedValue({
      allowed: false,
      reason: "Your STARTER plan allows 2 users. Upgrade to add more.",
    });

    const { POST } = await import("@/app/api/team/route");
    const res = await POST(postReq({ email: "third@test.com", role: "MEMBER" }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("STARTER plan allows 2 users");
  });

  it("PRO: allows inviting up to 10 users", async () => {
    getSession.mockResolvedValue(makeSession("ADMIN"));
    canAddUser.mockResolvedValue({ allowed: true });
    userFindFirst.mockResolvedValue(null);
    inviteFindFirst.mockResolvedValue(null);
    inviteCreate.mockResolvedValue({ id: "invite_pro", token: "tok_pro" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));

    const { POST } = await import("@/app/api/team/route");
    const res = await POST(postReq({ email: "member@test.com", role: "MEMBER" }));
    expect(res.status).toBe(201);
    vi.unstubAllGlobals();
  });

  it("EXPIRED: blocks all user invites", async () => {
    getSession.mockResolvedValue(makeSession("ADMIN"));
    canAddUser.mockResolvedValue({
      allowed: false,
      reason: "Your EXPIRED plan allows 0 users. Upgrade to add more.",
    });

    const { POST } = await import("@/app/api/team/route");
    const res = await POST(postReq({ email: "new@test.com", role: "MEMBER" }));
    expect(res.status).toBe(403);
  });

  it("blocks VIEWER role from inviting users", async () => {
    getSession.mockResolvedValue(makeSession("VIEWER"));

    const { POST } = await import("@/app/api/team/route");
    const res = await POST(postReq({ email: "new@test.com", role: "MEMBER" }));
    expect(res.status).toBe(403);
  });

  it("returns 409 when user with email already exists in org", async () => {
    getSession.mockResolvedValue(makeSession("ADMIN"));
    canAddUser.mockResolvedValue({ allowed: true });
    userFindFirst.mockResolvedValue({ id: "existing_user", email: "existing@test.com" });

    const { POST } = await import("@/app/api/team/route");
    const res = await POST(postReq({ email: "existing@test.com", role: "MEMBER" }));
    expect(res.status).toBe(409);
  });

  it("returns 400 on invalid email format", async () => {
    getSession.mockResolvedValue(makeSession("ADMIN"));

    const { POST } = await import("@/app/api/team/route");
    const res = await POST(postReq({ email: "not-an-email", role: "MEMBER" }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);

    const { POST } = await import("@/app/api/team/route");
    const res = await POST(postReq({ email: "new@test.com", role: "MEMBER" }));
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// SECTION 12: Expired trial hard-block — cross-feature smoke test
// =============================================================================

describe("EXPIRED tier — hard-blocks all gated features", () => {
  beforeEach(() => {
    getSession.mockResolvedValue(makeSession("ADMIN"));
    requireRole.mockResolvedValue(makeSession("OWNER"));
    getOrgLimits.mockResolvedValue(makeLimits("EXPIRED"));
  });

  it("blocks API key creation", async () => {
    const { POST } = await import("@/app/api/keys/route");
    const res = await POST(postReq({ name: "key" }));
    expect(res.status).toBe(403);
  });

  it("blocks email alerts", async () => {
    const { POST } = await import("@/app/api/alerts/route");
    const res = await POST(postReq({ channel: "EMAIL", destination: "a@b.com" }));
    expect(res.status).toBe(403);
  });

  it("blocks executive report", async () => {
    const { GET } = await import("@/app/api/reports/executive/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("blocks PDF report", async () => {
    const { GET } = await import("@/app/api/reports/pdf/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("blocks evidence pack", async () => {
    const { GET } = await import("@/app/api/reports/evidence/route");
    const res = await GET(new NextRequest("http://localhost/api/reports/evidence?from=2025-01-01&to=2025-12-31&framework=soc2"));
    expect(res.status).toBe(403);
  });

  it("blocks Jira integration access", async () => {
    const { GET } = await import("@/app/api/integrations/jira/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("blocks SSO configuration access", async () => {
    const { GET } = await import("@/app/api/integrations/sso/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("blocks bulk app creation", async () => {
    monitoredAppCount.mockResolvedValue(0);
    const { POST } = await import("@/app/api/apps/bulk/route");
    const res = await POST(postReq({ apps: [{ url: "https://new.com" }] }));
    expect(res.status).toBe(403);
  });
});
