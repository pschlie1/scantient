/**
 * finding-trends.test.ts
 *
 * Tests for finding trend analytics endpoint.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Auth mocks ───────────────────────────────────────────────────────────────
const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession }));

// ─── DB mocks ─────────────────────────────────────────────────────────────────
const findingFindMany = vi.fn();
const monitorRunFindMany = vi.fn();
const subscriptionFindUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    finding: { findMany: findingFindMany },
    monitorRun: { findMany: monitorRunFindMany },
    subscription: { findUnique: subscriptionFindUnique },
  },
}));

// ─── date-fns mock — use real implementation ──────────────────────────────────
// (no mock needed, date-fns is a pure library)

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeSession() {
  return { id: "user-1", orgId: "org-1", role: "OWNER" };
}

function makeFinding(overrides: Partial<{
  code: string;
  severity: string;
  status: string;
  createdAt: Date;
  resolvedAt: Date | null;
  acknowledgedAt: Date | null;
}> = {}) {
  return {
    code: "MISSING_CSP",
    severity: "HIGH",
    status: "OPEN",
    createdAt: new Date(),
    resolvedAt: null,
    acknowledgedAt: null,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue(null);
  findingFindMany.mockResolvedValue([]);
  monitorRunFindMany.mockResolvedValue([]);
  // Default: PRO tier — passes the trends tier gate
  subscriptionFindUnique.mockResolvedValue({ tier: "PRO" });
});

describe("GET /api/metrics/trends", () => {
  it("returns 401 without session", async () => {
    getSession.mockResolvedValue(null);
    const { GET } = await import("@/app/api/metrics/trends/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 200 with correct trend data structure", async () => {
    getSession.mockResolvedValue(makeSession());
    findingFindMany.mockResolvedValue([]);
    monitorRunFindMany.mockResolvedValue([]);
    const { GET } = await import("@/app/api/metrics/trends/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("openFindingsOverTime");
    expect(json).toHaveProperty("findingsBySeverity");
    expect(json).toHaveProperty("mttaHours");
    expect(json).toHaveProperty("mttrHours");
    expect(json).toHaveProperty("topFindingCodes");
    expect(json).toHaveProperty("scoreTrend");
    expect(json).toHaveProperty("periodDays", 30);
  });

  it("empty org returns zeros not errors", async () => {
    getSession.mockResolvedValue(makeSession());
    findingFindMany.mockResolvedValue([]);
    monitorRunFindMany.mockResolvedValue([]);
    const { GET } = await import("@/app/api/metrics/trends/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.openFindingsOverTime).toHaveLength(30);
    expect(json.openFindingsOverTime.every((d: { count: number }) => d.count === 0)).toBe(true);
    expect(json.topFindingCodes).toHaveLength(0);
    expect(json.findingsBySeverity.CRITICAL).toBe(0);
  });

  it("openFindingsOverTime has 30 entries", async () => {
    getSession.mockResolvedValue(makeSession());
    findingFindMany.mockResolvedValue([makeFinding()]);
    monitorRunFindMany.mockResolvedValue([]);
    const { GET } = await import("@/app/api/metrics/trends/route");
    const res = await GET();
    const json = await res.json();
    expect(json.openFindingsOverTime).toHaveLength(30);
  });

  it("MTTR calculation uses resolvedAt - createdAt", async () => {
    const createdAt = new Date("2026-02-20T00:00:00Z");
    const resolvedAt = new Date("2026-02-20T06:00:00Z"); // 6 hours later
    getSession.mockResolvedValue(makeSession());
    findingFindMany.mockResolvedValue([
      makeFinding({ severity: "HIGH", createdAt, resolvedAt }),
    ]);
    monitorRunFindMany.mockResolvedValue([]);
    const { GET } = await import("@/app/api/metrics/trends/route");
    const res = await GET();
    const json = await res.json();
    // MTTR for HIGH should be 6 hours
    expect(json.mttrHours.HIGH).toBe(6);
  });

  it("MTTA calculation uses acknowledgedAt - createdAt", async () => {
    const createdAt = new Date("2026-02-20T00:00:00Z");
    const acknowledgedAt = new Date("2026-02-20T02:00:00Z"); // 2 hours later
    getSession.mockResolvedValue(makeSession());
    findingFindMany.mockResolvedValue([
      makeFinding({ severity: "CRITICAL", createdAt, acknowledgedAt }),
    ]);
    monitorRunFindMany.mockResolvedValue([]);
    const { GET } = await import("@/app/api/metrics/trends/route");
    const res = await GET();
    const json = await res.json();
    expect(json.mttaHours.CRITICAL).toBe(2);
  });

  it("topFindingCodes sorted by count descending", async () => {
    getSession.mockResolvedValue(makeSession());
    findingFindMany.mockResolvedValue([
      makeFinding({ code: "MISSING_CSP" }),
      makeFinding({ code: "MISSING_CSP" }),
      makeFinding({ code: "MISSING_CSP" }),
      makeFinding({ code: "MISSING_HSTS" }),
      makeFinding({ code: "MISSING_HSTS" }),
      makeFinding({ code: "INSECURE_COOKIE" }),
    ]);
    monitorRunFindMany.mockResolvedValue([]);
    const { GET } = await import("@/app/api/metrics/trends/route");
    const res = await GET();
    const json = await res.json();
    expect(json.topFindingCodes[0].code).toBe("MISSING_CSP");
    expect(json.topFindingCodes[0].count).toBe(3);
    expect(json.topFindingCodes[1].count).toBe(2);
  });

  it("queries findings with org isolation", async () => {
    getSession.mockResolvedValue(makeSession());
    findingFindMany.mockResolvedValue([]);
    monitorRunFindMany.mockResolvedValue([]);
    const { GET } = await import("@/app/api/metrics/trends/route");
    await GET();
    expect(findingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          run: expect.objectContaining({
            app: expect.objectContaining({ orgId: "org-1" }),
          }),
        }),
      }),
    );
  });

  it("returns 403 for FREE tier users", async () => {
    getSession.mockResolvedValue(makeSession());
    subscriptionFindUnique.mockResolvedValue({ tier: "FREE" });
    const { GET } = await import("@/app/api/metrics/trends/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 403 for STARTER tier users", async () => {
    getSession.mockResolvedValue(makeSession());
    subscriptionFindUnique.mockResolvedValue({ tier: "STARTER" });
    const { GET } = await import("@/app/api/metrics/trends/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 200 for ENTERPRISE_PLUS tier", async () => {
    getSession.mockResolvedValue(makeSession());
    subscriptionFindUnique.mockResolvedValue({ tier: "ENTERPRISE_PLUS" });
    findingFindMany.mockResolvedValue([]);
    monitorRunFindMany.mockResolvedValue([]);
    const { GET } = await import("@/app/api/metrics/trends/route");
    const res = await GET();
    expect(res.status).toBe(200);
  });
});
