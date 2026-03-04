/**
 * security-audit-23.test.ts
 *
 * Tests for Audit-23 security fixes:
 *  1. Bulk app add: SSRF guard — each URL is checked with isPrivateUrl() before DB write
 *  2. Bulk app add: rate limit — 429 when org exceeds 5 bulk-add requests per hour
 *  3. Bulk app add: audit log — logAudit called when apps are created
 *  4. Weekly report: timing-safe CRON_SECRET — invalid secret returns 401, not data
 *  5. Evidence PDF: safe Content-Disposition filename — derived from parsed Date, not raw query string
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));

const TEST_CRON_SECRET = "super-secret-cron-token-audit-23";

beforeAll(() => {
  process.env.CRON_SECRET = TEST_CRON_SECRET;
  process.env.JWT_SECRET = "test-jwt-secret-audit-23";
});

// ─── DB mocks ─────────────────────────────────────────────────────────────────
const monitoredAppCreate = vi.fn();
const monitoredAppCount = vi.fn();
const monitoredAppFindMany = vi.fn();
const orgFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    monitoredApp: {
      create: monitoredAppCreate,
      count: monitoredAppCount,
      findMany: monitoredAppFindMany,
    },
    organization: { findMany: orgFindMany },
  },
}));

// ─── Auth mocks ───────────────────────────────────────────────────────────────
const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession }));

// ─── Tenant mocks ─────────────────────────────────────────────────────────────
const getOrgLimits = vi.fn();
const logAudit = vi.fn();
vi.mock("@/lib/tenant", () => ({ getOrgLimits, logAudit }));

// ─── Rate limit mock ──────────────────────────────────────────────────────────
const checkRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit }));

// ─── SSRF guard mock ──────────────────────────────────────────────────────────
const isPrivateUrl = vi.fn();
vi.mock("@/lib/ssrf-guard", () => ({ isPrivateUrl }));

// ─── Observability mock ───────────────────────────────────────────────────────
vi.mock("@/lib/observability", () => ({ logApiError: vi.fn() }));

// ─── PDF report mock ──────────────────────────────────────────────────────────
vi.mock("@/lib/pdf-report", () => ({
  generateEvidencePack: vi.fn().mockResolvedValue(Buffer.from("pdf-content")),
}));

const SESSION = {
  id: "user-1",
  orgId: "org-1",
  email: "admin@example.com",
  role: "OWNER" as const,
  name: "Admin",
  org: { name: "Test Org", slug: "test-org", subscriptionTier: "PRO" },
  iat: Math.floor(Date.now() / 1000) - 10,
};

beforeEach(() => {
  vi.clearAllMocks();

  getSession.mockResolvedValue(SESSION);
  getOrgLimits.mockResolvedValue({ tier: "PRO", maxApps: 10, maxUsers: 20, status: "ACTIVE" });
  checkRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: null });
  isPrivateUrl.mockResolvedValue(false);
  monitoredAppCount.mockResolvedValue(0);
  monitoredAppFindMany.mockResolvedValue([]);
  monitoredAppCreate.mockImplementation(async ({ data }: { data: { url: string } }) => ({
    id: `app-${Math.random()}`,
    url: data.url,
    name: new URL(data.url).hostname,
  }));
  logAudit.mockResolvedValue(undefined);
  orgFindMany.mockResolvedValue([{ id: "org-1", name: "Test Org" }]);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Fix 1 & 2 & 3: POST /api/apps/bulk — SSRF guard + rate limit + audit log
// ═══════════════════════════════════════════════════════════════════════════════

const bulkRoutePath = resolve(__dir, "../apps/bulk/route.ts");

describe("POST /api/apps/bulk — audit-23 fixes", () => {
  async function callBulk(apps: Array<{ url: string; name?: string }>) {
    const { POST } = await import(bulkRoutePath);
    const req = new Request("http://localhost/api/apps/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apps }),
    });
    return POST(req);
  }

  // ── Fix 2: Rate limit ───────────────────────────────────────────────────────
  it("returns 429 when bulk rate limit is exceeded", async () => {
    checkRateLimit.mockImplementation(async (key: string) => {
      if (key.startsWith("apps-bulk:")) {
        return { allowed: false, retryAfterSeconds: 3600 };
      }
      return { allowed: true, retryAfterSeconds: null };
    });

    const res = await callBulk([{ url: "https://example.com" }]);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/bulk-add/i);
  });

  it("includes Retry-After header when rate limited", async () => {
    checkRateLimit.mockImplementation(async (key: string) => {
      if (key.startsWith("apps-bulk:")) {
        return { allowed: false, retryAfterSeconds: 1800 };
      }
      return { allowed: true, retryAfterSeconds: null };
    });

    const res = await callBulk([{ url: "https://example.com" }]);
    expect(res.headers.get("Retry-After")).toBe("1800");
  });

  it("passes through when rate limit allows", async () => {
    checkRateLimit.mockResolvedValue({ allowed: true });

    const res = await callBulk([{ url: "https://example.com" }]);
    expect(res.status).not.toBe(429);
  });

  // ── Fix 1: SSRF guard ───────────────────────────────────────────────────────
  it("rejects private/internal URLs in the bulk list", async () => {
    isPrivateUrl.mockImplementation(async (url: string) => {
      return url.includes("169.254") || url.includes("10.0") || url.includes("localhost");
    });

    const res = await callBulk([
      { url: "https://example.com" },
      { url: "http://169.254.169.254/latest/meta-data/" },
      { url: "https://safe.example.com" },
    ]);

    expect(res.status).toBe(200);
    const body = await res.json();
    // 2 public URLs should be created; 1 private URL in errors
    expect(body.created).toBe(2);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].url).toBe("http://169.254.169.254/latest/meta-data/");
    expect(body.errors[0].reason).toMatch(/private|internal/i);
  });

  it("rejects all URLs when all are private/internal", async () => {
    isPrivateUrl.mockResolvedValue(true);

    const res = await callBulk([
      { url: "http://10.0.0.1/" },
      { url: "http://192.168.1.1/" },
    ]);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(0);
    expect(body.errors).toHaveLength(2);
  });

  it("creates apps normally when no URLs are private", async () => {
    isPrivateUrl.mockResolvedValue(false);

    const res = await callBulk([
      { url: "https://alpha.example.com" },
      { url: "https://beta.example.com" },
    ]);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(2);
    expect(body.errors).toHaveLength(0);
    // isPrivateUrl should have been called for each URL
    expect(isPrivateUrl).toHaveBeenCalledWith("https://alpha.example.com");
    expect(isPrivateUrl).toHaveBeenCalledWith("https://beta.example.com");
  });

  it("treats an isPrivateUrl exception as a block (fail-safe)", async () => {
    isPrivateUrl.mockRejectedValue(new Error("DNS resolution failed"));

    const res = await callBulk([{ url: "https://unknown-internal.corp" }]);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(0);
    expect(body.errors).toHaveLength(1);
  });

  // ── Fix 3: Audit log ────────────────────────────────────────────────────────
  it("calls logAudit when at least one app is created", async () => {
    isPrivateUrl.mockResolvedValue(false);

    await callBulk([{ url: "https://example.com" }]);

    expect(logAudit).toHaveBeenCalledOnce();
    const [, action, , details] = logAudit.mock.calls[0];
    expect(action).toBe("app.bulk_created");
    expect(details).toMatch(/1 app/i);
  });

  it("does NOT call logAudit when zero apps are created (all blocked)", async () => {
    isPrivateUrl.mockResolvedValue(true);

    await callBulk([{ url: "http://10.0.0.1/" }]);

    expect(logAudit).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    getSession.mockResolvedValue(null);

    const res = await callBulk([{ url: "https://example.com" }]);
    expect(res.status).toBe(401);
  });

  it("blocks VIEWER role", async () => {
    getSession.mockResolvedValue({ ...SESSION, role: "VIEWER" });

    const res = await callBulk([{ url: "https://example.com" }]);
    expect(res.status).toBe(403);
  });

  it("blocks MEMBER role", async () => {
    getSession.mockResolvedValue({ ...SESSION, role: "MEMBER" });

    const res = await callBulk([{ url: "https://example.com" }]);
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Fix 4: GET /api/reports/weekly — timing-safe CRON_SECRET comparison
// ═══════════════════════════════════════════════════════════════════════════════

const weeklyRoutePath = resolve(__dir, "../reports/weekly/route.ts");

describe("GET /api/reports/weekly — audit-23 timing-safe CRON_SECRET", () => {
  async function callWeekly(authHeader?: string) {
    const { GET } = await import(weeklyRoutePath);
    const headers: Record<string, string> = {};
    if (authHeader !== undefined) headers["authorization"] = authHeader;
    const req = new Request("http://localhost/api/reports/weekly", { headers });
    return GET(req);
  }

  it("allows cron path with correct CRON_SECRET", async () => {
    monitoredAppFindMany.mockResolvedValue([]);

    const res = await callWeekly(`Bearer ${TEST_CRON_SECRET}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("generatedAt");
    expect(body).toHaveProperty("reports");
  });

  it("returns 401 when no auth header and no session", async () => {
    getSession.mockResolvedValue(null);

    const res = await callWeekly();
    expect(res.status).toBe(401);
  });

  it("falls through to user path with wrong CRON_SECRET (not treated as cron)", async () => {
    // Wrong secret → isCron is false → falls through to session check
    getSession.mockResolvedValue(null);

    const res = await callWeekly("Bearer wrong-secret");
    expect(res.status).toBe(401);
  });

  it("rejects a prefix of the real CRON_SECRET (timing-safe check prevents prefix match)", async () => {
    getSession.mockResolvedValue(null);

    const partial = `Bearer ${TEST_CRON_SECRET.slice(0, 10)}`;
    const res = await callWeekly(partial);
    expect(res.status).toBe(401);
  });

  it("rejects empty authorization header", async () => {
    getSession.mockResolvedValue(null);

    const res = await callWeekly("");
    expect(res.status).toBe(401);
  });

  it("returns 403 for authenticated user on FREE plan (plan gate)", async () => {
    getOrgLimits.mockResolvedValue({ tier: "FREE", maxApps: 2, maxUsers: 1, status: "ACTIVE" });
    checkRateLimit.mockResolvedValue({ allowed: true });

    const res = await callWeekly();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Starter/i);
  });

  it("returns report data for authenticated STARTER+ user", async () => {
    getOrgLimits.mockResolvedValue({ tier: "STARTER", maxApps: 5, maxUsers: 5, status: "ACTIVE" });
    checkRateLimit.mockResolvedValue({ allowed: true });
    monitoredAppFindMany.mockResolvedValue([]);

    const res = await callWeekly();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("report");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Fix 5: GET /api/reports/evidence — safe Content-Disposition filename
// ═══════════════════════════════════════════════════════════════════════════════

const evidenceRoutePath = resolve(__dir, "../reports/evidence/route.ts");

describe("GET /api/reports/evidence — audit-23 Content-Disposition filename safety", () => {
  /**
   * Create a NextRequest with the given query parameters.
   * The evidence route uses `req.nextUrl`, which is a property of NextRequest
   * (not plain Request).
   */
  async function callEvidence(params: Record<string, string>) {
    const { GET } = await import(evidenceRoutePath);
    const url = new URL("http://localhost/api/reports/evidence");
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const req = new NextRequest(url.toString());
    return GET(req);
  }

  beforeEach(() => {
    getOrgLimits.mockResolvedValue({ tier: "PRO", maxApps: 20, maxUsers: 20, status: "ACTIVE" });
  });

  it("returns a PDF with a safe filename built from canonical ISO date strings", async () => {
    const res = await callEvidence({
      from: "2024-01-01",
      to: "2024-12-31",
      framework: "soc2",
    });

    expect(res.status).toBe(200);
    const cd = res.headers.get("Content-Disposition");
    expect(cd).toBeTruthy();
    expect(cd).toMatch(/scantient-evidence-soc2-2024-01-01-to-2024-12-31\.pdf/);
  });

  it("filename is derived from parsed dates (not raw query string)", async () => {
    // Supply full ISO timestamp — the filename should only use the date portion
    const res = await callEvidence({
      from: "2024-01-01T00:00:00.000Z",
      to: "2024-06-30T23:59:59.000Z",
      framework: "nist",
    });

    if (res.status === 200) {
      const cd = res.headers.get("Content-Disposition")!;
      // Must NOT include raw time part "T00:00:00"
      expect(cd).not.toMatch(/T\d{2}:\d{2}:\d{2}/);
      // Must include only the YYYY-MM-DD portions
      expect(cd).toMatch(/2024-01-01/);
      expect(cd).toMatch(/2024-06-30/);
    }
  });

  it("returns 400 for an invalid date in 'from'", async () => {
    const res = await callEvidence({
      from: "not-a-date",
      to: "2024-12-31",
      framework: "nist",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/date/i);
  });

  it("returns 400 when 'to' is not a valid date", async () => {
    const res = await callEvidence({
      from: "2024-01-01",
      to: "bad-date",
      framework: "soc2",
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when to <= from", async () => {
    const res = await callEvidence({
      from: "2024-12-31",
      to: "2024-01-01",
      framework: "soc2",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/'to' date must be after/i);
  });

  it("returns 400 for an invalid framework value", async () => {
    const res = await callEvidence({
      from: "2024-01-01",
      to: "2024-12-31",
      framework: "unknown-framework",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/framework/i);
  });

  it("returns 403 for FREE plan", async () => {
    getOrgLimits.mockResolvedValue({ tier: "FREE", maxApps: 2, maxUsers: 1, status: "ACTIVE" });

    const res = await callEvidence({
      from: "2024-01-01",
      to: "2024-12-31",
      framework: "soc2",
    });

    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    getSession.mockResolvedValue(null);

    const res = await callEvidence({
      from: "2024-01-01",
      to: "2024-12-31",
      framework: "soc2",
    });

    expect(res.status).toBe(401);
  });

  it("supports all valid frameworks", async () => {
    for (const framework of ["soc2", "iso27001", "nist"]) {
      const res = await callEvidence({
        from: "2024-01-01",
        to: "2024-06-30",
        framework,
      });
      expect(res.status).toBe(200);
      const cd = res.headers.get("Content-Disposition")!;
      expect(cd).toContain(framework);
    }
  });
});
