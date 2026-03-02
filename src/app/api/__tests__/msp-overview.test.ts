/**
 * msp-overview.test.ts
 *
 * Tests for GET /api/msp/overview and GET /api/msp/client-count (Item 10).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Auth mock ────────────────────────────────────────────────────────────────
const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession }));

// ─── DB mock ─────────────────────────────────────────────────────────────────
const organizationFindMany = vi.fn();
const organizationCount = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    organization: {
      findMany: organizationFindMany,
      count: organizationCount,
    },
  },
}));

// ─── Helper sessions ──────────────────────────────────────────────────────────

function ownerSession() {
  return {
    id: "user_1",
    orgId: "msp_org",
    orgName: "My MSP",
    orgSlug: "my-msp",
    role: "OWNER",
    email: "owner@msp.com",
    name: "MSP Owner",
  };
}

function memberSession() {
  return {
    id: "user_2",
    orgId: "msp_org",
    orgName: "My MSP",
    orgSlug: "my-msp",
    role: "MEMBER",
    email: "member@msp.com",
    name: "Regular Member",
  };
}

// ─── GET /api/msp/overview ────────────────────────────────────────────────────

describe("GET /api/msp/overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    getSession.mockResolvedValue(null);
    const { GET } = await import("@/app/api/msp/overview/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for MEMBER role", async () => {
    getSession.mockResolvedValue(memberSession());
    const { GET } = await import("@/app/api/msp/overview/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns empty clients array for MSP with no client orgs", async () => {
    getSession.mockResolvedValue(ownerSession());
    organizationFindMany.mockResolvedValue([]);

    const { GET } = await import("@/app/api/msp/overview/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clients).toHaveLength(0);
    expect(body.mspOrgId).toBe("msp_org");
    expect(body.mspOrgName).toBe("My MSP");
    expect(body.clientCount).toBe(0);
  });

  it("returns client summary data for orgs with findings", async () => {
    getSession.mockResolvedValue(ownerSession());

    organizationFindMany.mockResolvedValue([
      {
        id: "client_org_1",
        name: "Acme Corp",
        slug: "acme-corp",
        parentOrgId: "msp_org",
        apps: [
          {
            id: "app_1",
            lastCheckedAt: new Date("2026-03-01T10:00:00Z"),
            monitorRuns: [
              {
                startedAt: new Date("2026-03-01T10:00:00Z"),
                findings: [
                  { severity: "CRITICAL" },
                  { severity: "CRITICAL" },
                  { severity: "HIGH" },
                  { severity: "MEDIUM" },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "client_org_2",
        name: "Beta Inc",
        slug: "beta-inc",
        parentOrgId: "msp_org",
        apps: [
          {
            id: "app_2",
            lastCheckedAt: new Date("2026-03-01T09:00:00Z"),
            monitorRuns: [
              {
                startedAt: new Date("2026-03-01T09:00:00Z"),
                findings: [],
              },
            ],
          },
        ],
      },
    ]);

    const { GET } = await import("@/app/api/msp/overview/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.clients).toHaveLength(2);
    expect(body.clientCount).toBe(2);

    // First client should be Acme Corp (more critical findings)
    const acme = body.clients[0];
    expect(acme.orgName).toBe("Acme Corp");
    expect(acme.criticalFindings).toBe(2);
    expect(acme.highFindings).toBe(1);
    expect(acme.totalOpenFindings).toBe(4);
    expect(acme.lastScanAt).toBe("2026-03-01T10:00:00.000Z");

    // Compliance score: 2*25 + 1*10 + 1*3 = 63 penalty → score = max(0, 100-63) = 37
    expect(acme.complianceScore).toBe(37);
    expect(acme.complianceGrade).toBe("F");

    // Second client is Beta Inc (no findings)
    const beta = body.clients[1];
    expect(beta.orgName).toBe("Beta Inc");
    expect(beta.criticalFindings).toBe(0);
    expect(beta.complianceScore).toBe(100);
    expect(beta.complianceGrade).toBe("A");
  });

  it("sorts clients by critical findings descending", async () => {
    getSession.mockResolvedValue(ownerSession());

    organizationFindMany.mockResolvedValue([
      {
        id: "low_risk_org",
        name: "Low Risk",
        slug: "low-risk",
        parentOrgId: "msp_org",
        apps: [
          {
            id: "app_l",
            lastCheckedAt: new Date(),
            monitorRuns: [{ startedAt: new Date(), findings: [{ severity: "LOW" }] }],
          },
        ],
      },
      {
        id: "high_risk_org",
        name: "High Risk",
        slug: "high-risk",
        parentOrgId: "msp_org",
        apps: [
          {
            id: "app_h",
            lastCheckedAt: new Date(),
            monitorRuns: [
              {
                startedAt: new Date(),
                findings: [{ severity: "CRITICAL" }, { severity: "CRITICAL" }, { severity: "CRITICAL" }],
              },
            ],
          },
        ],
      },
    ]);

    const { GET } = await import("@/app/api/msp/overview/route");
    const res = await GET();
    const body = await res.json();

    // High Risk should come first
    expect(body.clients[0].orgName).toBe("High Risk");
    expect(body.clients[1].orgName).toBe("Low Risk");
  });

  it("handles orgs with no apps or no runs", async () => {
    getSession.mockResolvedValue(ownerSession());

    organizationFindMany.mockResolvedValue([
      {
        id: "empty_org",
        name: "Empty Org",
        slug: "empty-org",
        parentOrgId: "msp_org",
        apps: [],
      },
    ]);

    const { GET } = await import("@/app/api/msp/overview/route");
    const res = await GET();
    const body = await res.json();

    expect(body.clients).toHaveLength(1);
    const client = body.clients[0];
    expect(client.totalApps).toBe(0);
    expect(client.criticalFindings).toBe(0);
    expect(client.lastScanAt).toBeNull();
    expect(client.complianceScore).toBe(100);
    expect(client.complianceGrade).toBe("A");
  });

  it("works for ADMIN role (not just OWNER)", async () => {
    getSession.mockResolvedValue({ ...ownerSession(), role: "ADMIN" });
    organizationFindMany.mockResolvedValue([]);

    const { GET } = await import("@/app/api/msp/overview/route");
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

// ─── Compliance score grading ─────────────────────────────────────────────────

describe("compliance grade calculation", () => {
  it("assigns correct grades based on score thresholds", async () => {
    getSession.mockResolvedValue(ownerSession());

    // Build orgs with known finding counts to verify grades
    const createOrg = (id: string, name: string, slug: string, findings: { severity: string }[]) => ({
      id,
      name,
      slug,
      parentOrgId: "msp_org",
      apps: [
        {
          id: `app_${id}`,
          lastCheckedAt: new Date(),
          monitorRuns: [{ startedAt: new Date(), findings }],
        },
      ],
    });

    organizationFindMany.mockResolvedValue([
      createOrg("o1", "Grade A", "grade-a", []), // score 100 → A
      createOrg("o2", "Grade B", "grade-b", [{ severity: "MEDIUM" }, { severity: "MEDIUM" }, { severity: "MEDIUM" }]), // 100-9=91 → A
      createOrg("o3", "Grade F", "grade-f", [
        { severity: "CRITICAL" }, { severity: "CRITICAL" }, { severity: "CRITICAL" }, { severity: "CRITICAL" },
      ]), // 100-100=0 → F
    ]);

    const { GET } = await import("@/app/api/msp/overview/route");
    const res = await GET();
    const body = await res.json();

    const byName = Object.fromEntries(body.clients.map((c: ClientEntry) => [c.orgName, c]));
    expect((byName["Grade A"] as ClientEntry).complianceGrade).toBe("A");
    expect((byName["Grade F"] as ClientEntry).complianceGrade).toBe("F");
  });
});

// ─── GET /api/msp/client-count ────────────────────────────────────────────────

interface ClientEntry {
  orgName: string;
  complianceGrade: string;
  complianceScore: number;
  criticalFindings: number;
}

describe("GET /api/msp/client-count", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 0 for unauthenticated user", async () => {
    getSession.mockResolvedValue(null);
    const { GET } = await import("@/app/api/msp/client-count/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(0);
  });

  it("returns 0 for MEMBER role", async () => {
    getSession.mockResolvedValue(memberSession());
    const { GET } = await import("@/app/api/msp/client-count/route");
    const res = await GET();
    const body = await res.json();
    expect(body.count).toBe(0);
  });

  it("returns client org count for OWNER", async () => {
    getSession.mockResolvedValue(ownerSession());
    organizationCount.mockResolvedValue(3);
    const { GET } = await import("@/app/api/msp/client-count/route");
    const res = await GET();
    const body = await res.json();
    expect(body.count).toBe(3);
    expect(organizationCount).toHaveBeenCalledWith({
      where: { parentOrgId: "msp_org" },
    });
  });

  it("returns client org count for ADMIN", async () => {
    getSession.mockResolvedValue({ ...ownerSession(), role: "ADMIN" });
    organizationCount.mockResolvedValue(7);
    const { GET } = await import("@/app/api/msp/client-count/route");
    const res = await GET();
    const body = await res.json();
    expect(body.count).toBe(7);
  });
});
