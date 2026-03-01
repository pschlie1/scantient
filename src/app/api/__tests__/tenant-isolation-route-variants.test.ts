import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("tenant isolation - remaining route variants", () => {
  it("findings assign returns 404 for cross-tenant finding id", async () => {
    const findingFindFirst = vi.fn().mockResolvedValue(null);

    vi.doMock("@/lib/auth", () => ({ getSession: vi.fn().mockResolvedValue({ id: "u_1", orgId: "org_a", role: "ADMIN" }) }));
    vi.doMock("@/lib/tenant", () => ({ getOrgLimits: vi.fn().mockResolvedValue({ tier: "PRO" }) }));
    vi.doMock("@/lib/db", () => ({
      db: {
        finding: { findFirst: findingFindFirst },
        findingAssignment: { deleteMany: vi.fn(), upsert: vi.fn() },
        user: { findFirst: vi.fn() },
      },
    }));

    const { POST } = await import("@/app/api/findings/[id]/assign/route");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "user_b" }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "finding_b" }) });
    expect(res.status).toBe(404);
    expect(findingFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "finding_b" } }),
    );
  });

  it("findings link GET enforces org boundary with scoped query", async () => {
    const findingFindFirst = vi.fn().mockResolvedValue(null);

    vi.doMock("@/lib/auth", () => ({ getSession: vi.fn().mockResolvedValue({ id: "u_1", orgId: "org_a", role: "ADMIN" }) }));
    vi.doMock("@/lib/tenant", () => ({ getOrgLimits: vi.fn().mockResolvedValue({ tier: "PRO" }) }));
    vi.doMock("@/lib/db", () => ({ db: { finding: { findFirst: findingFindFirst } } }));
    vi.doMock("@/lib/remediation-lifecycle", () => ({ parseRemediationMeta: vi.fn(), linkPRToFinding: vi.fn() }));

    const { GET } = await import("@/app/api/findings/[id]/link/route");
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "finding_b" }) });

    expect(res.status).toBe(404);
    expect(findingFindFirst).toHaveBeenCalledWith({
      where: { id: "finding_b", run: { app: { orgId: "org_a" } } },
    });
  });

  it("findings timeline GET enforces org boundary with scoped query", async () => {
    const findingFindFirst = vi.fn().mockResolvedValue(null);

    vi.doMock("@/lib/auth", () => ({ getSession: vi.fn().mockResolvedValue({ id: "u_1", orgId: "org_a", role: "ADMIN" }) }));
    vi.doMock("@/lib/tenant", () => ({ getOrgLimits: vi.fn().mockResolvedValue({ tier: "PRO" }) }));
    vi.doMock("@/lib/db", () => ({ db: { finding: { findFirst: findingFindFirst } } }));
    vi.doMock("@/lib/remediation-lifecycle", () => ({ parseRemediationMeta: vi.fn() }));

    const { GET } = await import("@/app/api/findings/[id]/timeline/route");
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "finding_b" }) });

    expect(res.status).toBe(404);
    expect(findingFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "finding_b", run: { app: { orgId: "org_a" } } } }),
    );
  });

  it("app trends route does not return cross-tenant run data", async () => {
    const monitoredAppFindFirst = vi.fn().mockResolvedValue({ id: "app_a" });
    const monitorRunFindMany = vi.fn().mockResolvedValue([
      {
        id: "run_a",
        status: "HEALTHY",
        startedAt: new Date("2026-02-28T00:00:00Z"),
        findings: [{ severity: "LOW" }, { severity: "MEDIUM" }],
      },
    ]);

    vi.doMock("@/lib/auth", () => ({ getSession: vi.fn().mockResolvedValue({ id: "u_1", orgId: "org_a", role: "ADMIN" }) }));
    vi.doMock("@/lib/tenant", () => ({ getOrgLimits: vi.fn().mockResolvedValue({ tier: "PRO" }) }));
    vi.doMock("@/lib/db", () => ({
      db: {
        monitoredApp: { findFirst: monitoredAppFindFirst },
        monitorRun: { findMany: monitorRunFindMany },
      },
    }));

    const { GET } = await import("@/app/api/apps/[id]/trends/route");
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "app_a" }) });
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(monitoredAppFindFirst).toHaveBeenCalledWith({
      where: { id: "app_a", orgId: "org_a" },
      select: { id: true },
    });
    expect(monitorRunFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { appId: "app_a" } }),
    );
    expect(JSON.stringify(payload)).not.toContain("org_b");
  });
});
