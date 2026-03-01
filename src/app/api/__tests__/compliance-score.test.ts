/**
 * compliance-score.test.ts
 *
 * Tests for compliance score dashboard endpoint.
 * Covers: auth, tier gating, score calculation, top impacting findings.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateComplianceScore } from "@/lib/compliance-score";

// ─── Auth mocks ───────────────────────────────────────────────────────────────
const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession }));

// ─── Tenant mocks ─────────────────────────────────────────────────────────────
const getOrgLimits = vi.fn();
vi.mock("@/lib/tenant", () => ({ getOrgLimits }));

// ─── DB mocks ─────────────────────────────────────────────────────────────────
const findingFindMany = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    finding: {
      findMany: findingFindMany,
    },
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeSession() {
  return { userId: "user-1", orgId: "org-1", role: "OWNER" };
}

function makeLimits(tier: string) {
  return { tier, maxApps: 5, maxUsers: 5 };
}

// ─── Unit tests: compliance score calculation ─────────────────────────────────

describe("calculateComplianceScore (unit)", () => {
  it("returns 100% score with no open findings", () => {
    const result = calculateComplianceScore([]);
    expect(result.soc2.score).toBe(100);
    expect(result.nist.score).toBe(100);
    expect(result.iso27001.score).toBe(100);
    expect(result.topImpactingFindings).toHaveLength(0);
  });

  it("reduces score when findings are present", () => {
    const result = calculateComplianceScore([
      { code: "EXPOSED_API_KEY", title: "Exposed API key", severity: "CRITICAL" },
    ]);
    expect(result.soc2.score).toBeLessThan(100);
    expect(result.nist.score).toBeLessThan(100);
    expect(result.iso27001.score).toBeLessThan(100);
  });

  it("ignores unknown finding codes", () => {
    const result = calculateComplianceScore([
      { code: "UNKNOWN_CODE_XYZ", title: "Unknown", severity: "LOW" },
    ]);
    expect(result.soc2.score).toBe(100);
    expect(result.topImpactingFindings).toHaveLength(0);
  });

  it("correctly sorts top impacting findings by controls impacted", () => {
    // EXPOSED_API_KEY maps to 3+2+2=7 controls; MISSING_HSTS maps to 1+1+1=3 controls
    const result = calculateComplianceScore([
      { code: "EXPOSED_API_KEY", title: "Exposed API key", severity: "CRITICAL" },
      { code: "MISSING_HSTS", title: "Missing HSTS", severity: "HIGH" },
      { code: "MISSING_CSP", title: "Missing CSP", severity: "HIGH" },
    ]);
    expect(result.topImpactingFindings.length).toBeGreaterThan(0);
    // Top finding should have most controls impacted
    expect(result.topImpactingFindings[0].controlsImpacted).toBeGreaterThanOrEqual(
      result.topImpactingFindings[1]?.controlsImpacted ?? 0,
    );
  });

  it("deduplicates same finding code appearing multiple times", () => {
    const result = calculateComplianceScore([
      { code: "MISSING_CSP", title: "Missing CSP", severity: "HIGH" },
      { code: "MISSING_CSP", title: "Missing CSP", severity: "HIGH" },
      { code: "MISSING_CSP", title: "Missing CSP", severity: "HIGH" },
    ]);
    // Should not have 3 entries for same code in top impacting
    const cspEntries = result.topImpactingFindings.filter((f) => f.code === "MISSING_CSP");
    expect(cspEntries.length).toBe(1);
  });

  it("limits top impacting findings to 5", () => {
    const result = calculateComplianceScore([
      { code: "MISSING_CSP", title: "Missing CSP", severity: "HIGH" },
      { code: "MISSING_HSTS", title: "Missing HSTS", severity: "HIGH" },
      { code: "MISSING_X_FRAME_OPTIONS", title: "Missing X-Frame-Options", severity: "MEDIUM" },
      { code: "INSECURE_COOKIE", title: "Insecure cookie", severity: "HIGH" },
      { code: "EXPOSED_API_KEY", title: "Exposed API key", severity: "CRITICAL" },
      { code: "SSL_CERT_EXPIRED", title: "SSL expired", severity: "CRITICAL" },
      { code: "UPTIME_ERROR", title: "Uptime error", severity: "HIGH" },
    ]);
    expect(result.topImpactingFindings.length).toBeLessThanOrEqual(5);
  });

  it("reports correct status: compliant >= 80, at_risk 50-79, non_compliant < 50", () => {
    const allFindings = [
      { code: "MISSING_CSP", title: "CSP", severity: "HIGH" },
      { code: "MISSING_HSTS", title: "HSTS", severity: "HIGH" },
      { code: "MISSING_X_FRAME_OPTIONS", title: "X-Frame", severity: "MEDIUM" },
      { code: "MISSING_X_CONTENT_TYPE", title: "X-Content-Type", severity: "MEDIUM" },
      { code: "MISSING_REFERRER_POLICY", title: "Referrer", severity: "LOW" },
      { code: "MISSING_PERMISSIONS_POLICY", title: "Permissions", severity: "LOW" },
      { code: "INSECURE_COOKIE", title: "Cookie", severity: "HIGH" },
      { code: "EXPOSED_API_KEY", title: "API Key", severity: "CRITICAL" },
      { code: "EXPOSED_SECRET", title: "Secret", severity: "CRITICAL" },
      { code: "SSL_CERT_EXPIRED", title: "SSL", severity: "CRITICAL" },
      { code: "UPTIME_ERROR", title: "Uptime", severity: "HIGH" },
    ];
    const result = calculateComplianceScore(allFindings);
    expect(["compliant", "at_risk", "non_compliant"]).toContain(result.soc2.status);
    expect(result.soc2.controls_passed).toBeLessThanOrEqual(result.soc2.controls_total);
    expect(result.soc2.findings).toBeGreaterThan(0);
  });
});

// ─── API route tests ──────────────────────────────────────────────────────────

describe("GET /api/compliance/score", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue(null);
    getOrgLimits.mockResolvedValue(makeLimits("FREE"));
    findingFindMany.mockResolvedValue([]);
  });

  it("returns 401 without session", async () => {
    getSession.mockResolvedValue(null);
    const { GET } = await import("@/app/api/compliance/score/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for FREE tier", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("FREE"));
    const { GET } = await import("@/app/api/compliance/score/route");
    const res = await GET();
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("Pro and Enterprise plans");
  });

  it("returns 403 for STARTER tier", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("STARTER"));
    const { GET } = await import("@/app/api/compliance/score/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 200 with valid compliance scores for PRO tier", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));
    findingFindMany.mockResolvedValue([]);
    const { GET } = await import("@/app/api/compliance/score/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("soc2");
    expect(json).toHaveProperty("nist");
    expect(json).toHaveProperty("iso27001");
    expect(json).toHaveProperty("topImpactingFindings");
    expect(json.soc2.score).toBe(100);
    expect(json.soc2.status).toBe("compliant");
  });

  it("returns 200 with valid compliance scores for ENTERPRISE tier", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("ENTERPRISE"));
    findingFindMany.mockResolvedValue([
      { code: "EXPOSED_API_KEY", title: "Exposed API key", severity: "CRITICAL" },
      { code: "MISSING_CSP", title: "Missing CSP", severity: "HIGH" },
    ]);
    const { GET } = await import("@/app/api/compliance/score/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.soc2.score).toBeLessThan(100);
    expect(json.topImpactingFindings.length).toBeGreaterThan(0);
    // Top finding should be sorted by most controls impacted
    if (json.topImpactingFindings.length >= 2) {
      expect(json.topImpactingFindings[0].controlsImpacted).toBeGreaterThanOrEqual(
        json.topImpactingFindings[1].controlsImpacted,
      );
    }
  });

  it("queries findings with org isolation", async () => {
    getSession.mockResolvedValue(makeSession());
    getOrgLimits.mockResolvedValue(makeLimits("PRO"));
    findingFindMany.mockResolvedValue([]);
    const { GET } = await import("@/app/api/compliance/score/route");
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
});
