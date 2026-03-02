/**
 * security-audit-19.test.ts
 *
 * Tests for Audit-19 security fixes:
 *  1. Email enumeration in forgot-password — always returns 200 (already fixed, now tested)
 *  2. HTML injection in alert email templates — escapeHtml() applied to buildAlertHtml()
 *  3. Session invalidation after password reset — getSession() returns null when
 *     user.updatedAt > token.iat (in the DB-refresh path)
 *  4. Invite token expiry enforcement — GET /invite/[token] returns 410 for expired invites
 *  5. Cache-Control: no-store on sensitive API routes — set by middleware
 *  6. Unverified email login — login returns 403 if emailVerified is false
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));

const TEST_JWT_SECRET = "test-jwt-secret-audit-19";

beforeAll(() => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
});

// ─── DB mocks ─────────────────────────────────────────────────────────────────
const userFindFirst = vi.fn();
const userFindUnique = vi.fn();
const userUpdate = vi.fn();
const inviteFindUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    user: { findFirst: userFindFirst, findUnique: userFindUnique, update: userUpdate },
    invite: { findUnique: inviteFindUnique },
  },
}));

// ─── Auth mocks (for route-level tests that import auth helpers) ──────────────
// Include verifyPassword so login route works correctly in tests
const hashPassword = vi.fn().mockResolvedValue("hashed-pw");
const createSession = vi.fn().mockResolvedValue({ id: "u1", email: "test@example.com" });
const verifyPassword = vi.fn().mockResolvedValue(true);

vi.mock("@/lib/auth", () => ({ hashPassword, createSession, verifyPassword }));

// ─── Rate limit mocks ─────────────────────────────────────────────────────────
const checkRateLimit = vi.fn();
const getClientIp = vi.fn().mockReturnValue("1.2.3.4");

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit, getClientIp }));

// ─── Tenant mocks ─────────────────────────────────────────────────────────────
const canAddUser = vi.fn();
const logAudit = vi.fn();
vi.mock("@/lib/tenant", () => ({ canAddUser, logAudit }));

// ─── next/headers cookies mock (for real getSession behavioral tests) ─────────
const cookiesGet = vi.fn();
const cookiesSet = vi.fn();
const cookiesDelete = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: cookiesGet, set: cookiesSet, delete: cookiesDelete }),
}));

// ─── Prevent real fetch (email sending) ──────────────────────────────────────
vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));

beforeEach(() => {
  vi.clearAllMocks();
  // Restore defaults after clearAllMocks
  hashPassword.mockResolvedValue("hashed-pw");
  createSession.mockResolvedValue({ id: "u1", email: "test@example.com" });
  verifyPassword.mockResolvedValue(true);
  checkRateLimit.mockResolvedValue({ allowed: true });
  getClientIp.mockReturnValue("1.2.3.4");
  canAddUser.mockResolvedValue({ allowed: true });
  logAudit.mockResolvedValue(undefined);
  cookiesGet.mockReturnValue(undefined);
  cookiesSet.mockResolvedValue(undefined);
  cookiesDelete.mockResolvedValue(undefined);
});

// Helper
function makeReq(body: unknown, method = "POST") {
  return new Request("http://localhost", {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
  });
}

// Helper to build a JWT that will trigger the DB-refresh path (age > REFRESH_THRESHOLD = 5min)
function makeOldToken(
  userId: string,
  orgId: string,
  minutesAgo = 10,
): string {
  const iatInPast = Math.floor(Date.now() / 1000) - minutesAgo * 60;
  return jwt.sign(
    {
      id: userId,
      email: `${userId}@example.com`,
      name: "Test User",
      role: "MEMBER",
      orgId,
      orgName: "TestOrg",
      orgSlug: "testorg",
      iat: iatInPast,
    },
    TEST_JWT_SECRET,
    {
      algorithm: "HS256",
      expiresIn: "24h",
      issuer: "scantient",
      audience: "scantient-app",
    },
  );
}

// =============================================================================
// 1. Email Enumeration — forgot-password always returns 200
// =============================================================================
describe("A19-1: Forgot-password email enumeration prevention", () => {
  it("returns 200 { ok: true } when email does NOT exist in DB", async () => {
    userFindFirst.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/auth/forgot-password/route");
    const res = await POST(makeReq({ email: "ghost@example.com" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 200 { ok: true } when email exists in DB (no different response)", async () => {
    userFindFirst.mockResolvedValueOnce({ id: "u1", email: "real@example.com" });
    const { POST } = await import("@/app/api/auth/forgot-password/route");
    const res = await POST(makeReq({ email: "real@example.com" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 200 { ok: true } for invalid email format (no leak)", async () => {
    const { POST } = await import("@/app/api/auth/forgot-password/route");
    const res = await POST(makeReq({ email: "not-an-email" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 200 { ok: true } when rate-limited (no 429 leak)", async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: false });
    const { POST } = await import("@/app/api/auth/forgot-password/route");
    const res = await POST(makeReq({ email: "a@b.com" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

// =============================================================================
// 2. HTML Injection in Alert Email Templates — escapeHtml + buildAlertHtml
// =============================================================================
describe("A19-2: escapeHtml utility", () => {
  it("is exported from @/lib/alerts", async () => {
    // Use importActual to bypass any mock of alerts
    const alerts = await vi.importActual<typeof import("@/lib/alerts")>("@/lib/alerts");
    expect(typeof alerts.escapeHtml).toBe("function");
  });

  it("escapes ampersand", async () => {
    const { escapeHtml } = await vi.importActual<typeof import("@/lib/alerts")>("@/lib/alerts");
    expect(escapeHtml("foo & bar")).toBe("foo &amp; bar");
  });

  it("escapes less-than and greater-than", async () => {
    const { escapeHtml } = await vi.importActual<typeof import("@/lib/alerts")>("@/lib/alerts");
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes double quotes", async () => {
    const { escapeHtml } = await vi.importActual<typeof import("@/lib/alerts")>("@/lib/alerts");
    expect(escapeHtml('"quoted"')).toBe("&quot;quoted&quot;");
  });

  it("escapes single quotes", async () => {
    const { escapeHtml } = await vi.importActual<typeof import("@/lib/alerts")>("@/lib/alerts");
    expect(escapeHtml("it's")).toBe("it&#x27;s");
  });

  it("escapes full XSS payload (no raw HTML tags remain)", async () => {
    const { escapeHtml } = await vi.importActual<typeof import("@/lib/alerts")>("@/lib/alerts");
    const payload = '<img src=x onerror="alert(1)">';
    const escaped = escapeHtml(payload);
    expect(escaped).not.toContain("<");
    expect(escaped).not.toContain(">");
    expect(escaped).not.toContain('"');
    expect(escaped).toContain("&lt;");
    expect(escaped).toContain("&gt;");
    expect(escaped).toContain("&quot;");
  });

  it("leaves safe text unchanged", async () => {
    const { escapeHtml } = await vi.importActual<typeof import("@/lib/alerts")>("@/lib/alerts");
    expect(escapeHtml("Hello, world! 123")).toBe("Hello, world! 123");
  });
});

describe("A19-2: buildAlertHtml XSS prevention (source inspection)", () => {
  it("alerts.ts source exports escapeHtml function", () => {
    const src = readFileSync(resolve(__dir, "../../../lib/alerts.ts"), "utf8");
    expect(src).toMatch(/export function escapeHtml/);
  });

  it("buildAlertHtml applies escapeHtml to appName", () => {
    const src = readFileSync(resolve(__dir, "../../../lib/alerts.ts"), "utf8");
    expect(src).toContain("escapeHtml(appName)");
  });

  it("buildAlertHtml applies escapeHtml to appUrl", () => {
    const src = readFileSync(resolve(__dir, "../../../lib/alerts.ts"), "utf8");
    expect(src).toContain("escapeHtml(appUrl)");
  });

  it("buildAlertHtml applies escapeHtml to finding title", () => {
    const src = readFileSync(resolve(__dir, "../../../lib/alerts.ts"), "utf8");
    expect(src).toContain("escapeHtml(f.title)");
  });

  it("buildAlertHtml applies escapeHtml to finding description", () => {
    const src = readFileSync(resolve(__dir, "../../../lib/alerts.ts"), "utf8");
    expect(src).toContain("escapeHtml(f.description)");
  });
});

// =============================================================================
// 3. Session Invalidation After Password Reset
// =============================================================================
describe("A19-3: reset-password route touches updatedAt", () => {
  it("reset-password/route.ts source includes updatedAt in the db.user.update data", () => {
    const src = readFileSync(resolve(__dir, "../auth/reset-password/route.ts"), "utf8");
    expect(src).toContain("updatedAt");
    // Verify it's in the data object of an update call
    expect(src).toMatch(/data:\s*\{[^}]*updatedAt/);
  });
});

describe("A19-3: auth.ts source — session invalidation logic present", () => {
  it("contains the updatedAt > tokenIssuedAt comparison", () => {
    const src = readFileSync(resolve(__dir, "../../../lib/auth.ts"), "utf8");
    expect(src).toContain("user.updatedAt > tokenIssuedAt");
  });

  it("contains a comment explaining the session invalidation pattern", () => {
    const src = readFileSync(resolve(__dir, "../../../lib/auth.ts"), "utf8");
    expect(src).toMatch(/[Ss]ession invalidation/);
  });

  it("returns null when user.updatedAt > tokenIssuedAt", () => {
    // Verify the control flow: after the check, return null
    const src = readFileSync(resolve(__dir, "../../../lib/auth.ts"), "utf8");
    const checkIdx = src.indexOf("user.updatedAt > tokenIssuedAt");
    const returnNullIdx = src.indexOf("return null", checkIdx);
    expect(checkIdx).toBeGreaterThan(-1);
    expect(returnNullIdx).toBeGreaterThan(checkIdx);
  });
});

describe("A19-3: getSession() behavioral — invalidation when user.updatedAt > token.iat", () => {
  it("returns null when user was updated after token was issued (password reset scenario)", async () => {
    // Create a token issued 10 minutes ago → triggers DB-refresh path (age > 5min REFRESH_THRESHOLD)
    const token = makeOldToken("user_1", "org_1", 10);
    const decoded = jwt.decode(token) as { iat: number };
    const tokenIat = decoded.iat;

    // Mock cookie with this old token
    cookiesGet.mockReturnValue({ value: token });

    // User was updated AFTER the token was issued → session should be invalidated
    userFindUnique.mockResolvedValueOnce({
      id: "user_1",
      email: "user_1@example.com",
      name: "Test User",
      role: "MEMBER",
      orgId: "org_1",
      updatedAt: new Date((tokenIat + 60) * 1000), // 1 min after token issue
      org: { id: "org_1", name: "TestOrg", slug: "testorg" },
    });

    // Use the real getSession (auth module is mocked but we importActual to get real impl)
    const { getSession } = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
    const result = await getSession();

    expect(result).toBeNull();
  });

  it("returns a valid session when user.updatedAt is before tokenIssuedAt", async () => {
    const token = makeOldToken("user_2", "org_2", 10);
    const decoded = jwt.decode(token) as { iat: number };
    const tokenIat = decoded.iat;

    cookiesGet.mockReturnValue({ value: token });

    // User was updated BEFORE the token was issued → session is still valid
    userFindUnique.mockResolvedValueOnce({
      id: "user_2",
      email: "user_2@example.com",
      name: "Test User",
      role: "MEMBER",
      orgId: "org_2",
      updatedAt: new Date((tokenIat - 3600) * 1000), // 1 hour before token issue
      org: { id: "org_2", name: "OkOrg", slug: "okorg" },
    });

    const { getSession } = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
    const result = await getSession();

    expect(result).not.toBeNull();
    expect(result?.id).toBe("user_2");
  });
});

// =============================================================================
// 4. Invite Token Expiry Enforcement — GET /invite/[token]
// =============================================================================
describe("A19-4: Invite token expiry enforcement (GET)", () => {
  it("GET returns 404 when invite not found", async () => {
    inviteFindUnique.mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/auth/invite/[token]/route");
    const res = await GET(
      new Request("http://localhost", { headers: { "x-forwarded-for": "1.2.3.4" } }),
      { params: Promise.resolve({ token: "no-such-token" }) },
    );
    expect(res.status).toBe(404);
  });

  it("GET returns 410 when invite is expired", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      token: "expired-token",
      email: "expired@example.com",
      role: "MEMBER",
      orgId: "org_1",
      expiresAt: new Date(Date.now() - 86_400_000), // 1 day ago
      org: { id: "org_1", name: "TestOrg" },
    });
    const { GET } = await import("@/app/api/auth/invite/[token]/route");
    const res = await GET(
      new Request("http://localhost", { headers: { "x-forwarded-for": "1.2.3.4" } }),
      { params: Promise.resolve({ token: "expired-token" }) },
    );
    expect(res.status).toBe(410);
  });

  it("GET returns 200 with invite details when invite is valid and not expired", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      token: "valid-token",
      email: "new@example.com",
      role: "MEMBER",
      orgId: "org_1",
      expiresAt: new Date(Date.now() + 86_400_000), // 1 day from now
      org: { id: "org_1", name: "TestOrg" },
    });
    const { GET } = await import("@/app/api/auth/invite/[token]/route");
    const res = await GET(
      new Request("http://localhost", { headers: { "x-forwarded-for": "1.2.3.4" } }),
      { params: Promise.resolve({ token: "valid-token" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBe("new@example.com");
    expect(body.orgName).toBe("TestOrg");
  });
});

describe("A19-4: Invite token expiry enforcement (POST)", () => {
  it("POST returns 410 when invite is expired", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      token: "expired-token",
      email: "expired@example.com",
      role: "MEMBER",
      orgId: "org_1",
      expiresAt: new Date(Date.now() - 86_400_000),
      org: { id: "org_1", name: "TestOrg" },
    });
    const { POST } = await import("@/app/api/auth/invite/[token]/route");
    const res = await POST(makeReq({ name: "Alice", password: "password123456" }), {
      params: Promise.resolve({ token: "expired-token" }),
    });
    expect(res.status).toBe(410);
  });

  it("POST returns 404 when invite not found", async () => {
    inviteFindUnique.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/auth/invite/[token]/route");
    const res = await POST(makeReq({ name: "Alice", password: "password123456" }), {
      params: Promise.resolve({ token: "no-such" }),
    });
    expect(res.status).toBe(404);
  });
});

// =============================================================================
// 5. Cache-Control Headers on Sensitive API Routes (middleware source check)
// =============================================================================
describe("A19-5: Cache-Control headers on sensitive API routes", () => {
  it("middleware.ts sets Cache-Control with no-store for API routes", () => {
    const src = readFileSync(resolve(__dir, "../../../middleware.ts"), "utf8");
    expect(src).toContain("no-store");
    expect(src).toContain("Cache-Control");
  });

  it("middleware.ts applies Cache-Control conditionally to API routes (isApiRoute check)", () => {
    const src = readFileSync(resolve(__dir, "../../../middleware.ts"), "utf8");
    expect(src).toContain("isApiRoute");
  });

  it("middleware.ts also sets Pragma: no-cache for maximum CDN compatibility", () => {
    const src = readFileSync(resolve(__dir, "../../../middleware.ts"), "utf8");
    expect(src).toContain("Pragma");
    expect(src).toContain("no-cache");
  });

  it("middleware.ts sets private in Cache-Control to block shared caches", () => {
    const src = readFileSync(resolve(__dir, "../../../middleware.ts"), "utf8");
    expect(src).toContain("private");
  });
});

// =============================================================================
// 6. Unverified Email Login Gate
// =============================================================================
describe("A19-6: Login blocks unverified email accounts", () => {
  it("returns 403 with helpful message when emailVerified is false", async () => {
    userFindFirst.mockResolvedValueOnce({
      id: "u1",
      email: "unverified@example.com",
      passwordHash: "hash",
      emailVerified: false,
      org: { id: "org_1" },
    });
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(makeReq({ email: "unverified@example.com", password: "password123!" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/verify.*email|email.*verify/i);
  });

  it("returns 401 (not 403) when user is not found — no info leak about verification status", async () => {
    userFindFirst.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(makeReq({ email: "ghost@example.com", password: "password123!" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when password is wrong for verified account", async () => {
    userFindFirst.mockResolvedValueOnce({
      id: "u1",
      email: "user@example.com",
      passwordHash: "hash",
      emailVerified: true,
      org: { id: "org_1" },
    });
    verifyPassword.mockResolvedValueOnce(false);
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(makeReq({ email: "user@example.com", password: "wrongpassword!" }));
    expect(res.status).toBe(401);
  });

  it("login route source checks emailVerified before allowing login", () => {
    const src = readFileSync(resolve(__dir, "../auth/login/route.ts"), "utf8");
    expect(src).toContain("emailVerified");
    expect(src).toContain("403");
  });
});
