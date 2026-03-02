/**
 * security-audit-6.test.ts
 *
 * Tests for audit-6 security fixes:
 *  Fix 1: SSO callback checks user limit before creating new users
 *  Fix 2: SSO callback validates email domain against configured SSO domain
 *  Fix 3: Health endpoint scopes queries to session.orgId
 *  Fix 4: Team invite endpoint rate-limited per org (10/hour)
 *  Fix 5: API key creation capped per tier (PRO=5, ENTERPRISE=20, ENTERPRISE_PLUS=50)
 *  Fix 6: Password reset email throttled per email address (3/hour)
 */

process.env.JWT_SECRET = "test-jwt-secret-for-audit-6";

import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Auth mock ────────────────────────────────────────────────────────────────
const getSession = vi.fn();
const createSession = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/auth", () => ({ getSession, createSession }));

// ─── Tenant mock ──────────────────────────────────────────────────────────────
const canAddUser = vi.fn();
const getOrgLimits = vi.fn();
const logAudit = vi.fn();
vi.mock("@/lib/tenant", () => ({ canAddUser, getOrgLimits, logAudit, canAddApp: vi.fn() }));

// ─── Rate-limit mock ──────────────────────────────────────────────────────────
const checkRateLimit = vi.fn();
const getClientIp = vi.fn().mockReturnValue("1.2.3.4");
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit, getClientIp }));

// ─── openid-client mock ───────────────────────────────────────────────────────
const authorizationCodeGrant = vi.fn();
const discovery = vi.fn().mockResolvedValue({});
vi.mock("openid-client", () => ({
  discovery,
  authorizationCodeGrant,
  randomPKCECodeVerifier: vi.fn().mockReturnValue("verifier"),
  calculatePKCECodeChallenge: vi.fn().mockResolvedValue("challenge"),
  randomState: vi.fn().mockReturnValue("state123"),
  buildAuthorizationUrl: vi.fn().mockReturnValue({ href: "https://idp.example.com/auth" }),
}));

// ─── Crypto util mock ─────────────────────────────────────────────────────────
vi.mock("@/lib/crypto-util", () => ({
  obfuscate: vi.fn((v: string) => Buffer.from(v).toString("base64")),
  deobfuscate: vi.fn((v: string) => Buffer.from(v, "base64").toString("utf8")),
}));

// ─── Cookies mock ─────────────────────────────────────────────────────────────
const cookiesDelete = vi.fn();
const cookiesGet = vi.fn();
const cookiesSet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: cookiesGet,
    set: cookiesSet,
    delete: cookiesDelete,
  }),
}));

// ─── DB mock ──────────────────────────────────────────────────────────────────
const sSOConfigFindFirst = vi.fn();
const userFindFirst = vi.fn();
const userCreate = vi.fn();
const monitoredAppCount = vi.fn();
const monitorRunFindFirst = vi.fn();
const inviteFindFirst = vi.fn();
const inviteCreate = vi.fn();
const userFindMany = vi.fn();
const organizationFindUnique = vi.fn();
const apiKeyCount = vi.fn();
const apiKeyCreate = vi.fn();
const apiKeyFindMany = vi.fn();
const auditLogCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    sSOConfig: { findFirst: sSOConfigFindFirst },
    user: { findFirst: userFindFirst, create: userCreate, findMany: userFindMany },
    monitoredApp: { count: monitoredAppCount, findMany: vi.fn().mockResolvedValue([]) },
    monitorRun: { findFirst: monitorRunFindFirst },
    invite: { findFirst: inviteFindFirst, create: inviteCreate },
    organization: { findUnique: organizationFindUnique },
    apiKey: { count: apiKeyCount, create: apiKeyCreate, findMany: apiKeyFindMany },
    auditLog: { create: auditLogCreate },
    $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
  },
}));

// ─── Observability mock ───────────────────────────────────────────────────────
vi.mock("@/lib/observability", () => ({ logApiError: vi.fn(), logOperationalWarning: vi.fn() }));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeRequest(method: string, body?: unknown, headers?: Record<string, string>) {
  return new Request("http://localhost", {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function makeStateJwt(overrides?: { domain?: string; orgId?: string }) {
  // Build a real JWT to simulate the state cookie
  const payload = {
    codeVerifier: "cv123",
    state: "st123",
    orgId: overrides?.orgId ?? "org_a",
    domain: overrides?.domain ?? "corp.com",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 600,
  };
  // Use Node's built-in Buffer-based base64url to avoid importing jsonwebtoken at test level
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", "test-jwt-secret-for-audit-6")
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

// ─── Session factories ────────────────────────────────────────────────────────
const adminSession = {
  id: "user_admin",
  orgId: "org_a",
  role: "ADMIN",
  email: "admin@example.com",
  name: "Admin",
  orgName: "Acme Corp",
};

beforeEach(() => {
  vi.clearAllMocks();
  logAudit.mockResolvedValue(undefined);
  auditLogCreate.mockResolvedValue({});
  checkRateLimit.mockResolvedValue({ allowed: true });
  getClientIp.mockReturnValue("1.2.3.4");
  canAddUser.mockResolvedValue({ allowed: true });
  getOrgLimits.mockResolvedValue({ tier: "PRO", status: "ACTIVE", maxApps: 15 });
  apiKeyFindMany.mockResolvedValue([]);
  cookiesDelete.mockResolvedValue(undefined);
  cookiesGet.mockReturnValue(undefined);
  createSession.mockResolvedValue(undefined);
  discovery.mockResolvedValue({});
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 1: SSO user limit check
// ─────────────────────────────────────────────────────────────────────────────
describe("Fix 1: SSO callback checks user limit", () => {
  beforeEach(() => {
    cookiesGet.mockReturnValue({ value: makeStateJwt() });
    sSOConfigFindFirst.mockResolvedValue({
      orgId: "org_a",
      domain: "corp.com",
      enabled: true,
      discoveryUrl: "https://idp.corp.com/.well-known/openid-configuration",
      clientId: "client123",
      clientSecret: null,
    });
    authorizationCodeGrant.mockResolvedValue({
      claims: () => ({ email: "alice@corp.com", name: "Alice" }),
    });
    userFindFirst.mockResolvedValue(null);
  });

  it("redirects to user_limit_reached when org is at cap", async () => {
    canAddUser.mockResolvedValue({ allowed: false, reason: "User limit reached" });

    const { GET } = await import("@/app/api/auth/sso/callback/route");
    const req = new Request("http://localhost/api/auth/sso/callback?code=abc&state=st123");
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("error=user_limit_reached");
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("creates user when org is under cap", async () => {
    canAddUser.mockResolvedValue({ allowed: true });
    userCreate.mockResolvedValue({ id: "user_new", email: "alice@corp.com", orgId: "org_a" });

    const { GET } = await import("@/app/api/auth/sso/callback/route");
    const req = new Request("http://localhost/api/auth/sso/callback?code=abc&state=st123");
    const res = await GET(req);

    expect(userCreate).toHaveBeenCalledOnce();
    expect(res.headers.get("location")).toContain("/dashboard");
  });

  it("skips canAddUser check when user already exists", async () => {
    userFindFirst.mockResolvedValue({ id: "user_1", email: "alice@corp.com", orgId: "org_a" });

    const { GET } = await import("@/app/api/auth/sso/callback/route");
    const req = new Request("http://localhost/api/auth/sso/callback?code=abc&state=st123");
    const res = await GET(req);

    expect(canAddUser).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toContain("/dashboard");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 2: SSO email domain validation
// ─────────────────────────────────────────────────────────────────────────────
describe("Fix 2: SSO callback validates email domain", () => {
  beforeEach(() => {
    sSOConfigFindFirst.mockResolvedValue({
      orgId: "org_a",
      domain: "corp.com",
      enabled: true,
      discoveryUrl: "https://idp.corp.com/.well-known/openid-configuration",
      clientId: "client123",
      clientSecret: null,
    });
  });

  it("redirects to sso_domain_mismatch when email domain does not match", async () => {
    cookiesGet.mockReturnValue({ value: makeStateJwt({ domain: "corp.com" }) });
    authorizationCodeGrant.mockResolvedValue({
      claims: () => ({ email: "attacker@evil.com", name: "Attacker" }),
    });

    const { GET } = await import("@/app/api/auth/sso/callback/route");
    const req = new Request("http://localhost/api/auth/sso/callback?code=abc&state=st123");
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("error=sso_domain_mismatch");
    expect(userCreate).not.toHaveBeenCalled();
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it("proceeds when email domain matches configured domain", async () => {
    cookiesGet.mockReturnValue({ value: makeStateJwt({ domain: "corp.com" }) });
    authorizationCodeGrant.mockResolvedValue({
      claims: () => ({ email: "alice@corp.com", name: "Alice" }),
    });
    userFindFirst.mockResolvedValue({ id: "user_1", email: "alice@corp.com", orgId: "org_a" });

    const { GET } = await import("@/app/api/auth/sso/callback/route");
    const req = new Request("http://localhost/api/auth/sso/callback?code=abc&state=st123");
    const res = await GET(req);

    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/dashboard");
    expect(location).not.toContain("error=sso_domain_mismatch");
  });

  it("subdomain email does not match exact domain check", async () => {
    cookiesGet.mockReturnValue({ value: makeStateJwt({ domain: "corp.com" }) });
    authorizationCodeGrant.mockResolvedValue({
      claims: () => ({ email: "alice@sub.corp.com", name: "Alice" }),
    });

    const { GET } = await import("@/app/api/auth/sso/callback/route");
    const req = new Request("http://localhost/api/auth/sso/callback?code=abc&state=st123");
    const res = await GET(req);

    const location = res.headers.get("location") ?? "";
    expect(location).toContain("error=sso_domain_mismatch");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 3: Health endpoint scopes queries to session.orgId
// ─────────────────────────────────────────────────────────────────────────────
describe("Fix 3: Health endpoint scopes queries to orgId", () => {
  it("monitoredApp.count is called with orgId filter", async () => {
    getSession.mockResolvedValue(adminSession);
    monitoredAppCount.mockResolvedValue(3);
    monitorRunFindFirst.mockResolvedValue(null);

    const { GET } = await import("@/app/api/health/route");
    await GET();

    expect(monitoredAppCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orgId: "org_a" }) }),
    );
  });

  it("monitorRun.findFirst is called with orgId filter via app relation", async () => {
    getSession.mockResolvedValue(adminSession);
    monitoredAppCount.mockResolvedValue(3);
    monitorRunFindFirst.mockResolvedValue(null);

    const { GET } = await import("@/app/api/health/route");
    await GET();

    expect(monitorRunFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ app: expect.objectContaining({ orgId: "org_a" }) }),
      }),
    );
  });

  it("unauthenticated caller gets basic liveness response without db queries", async () => {
    getSession.mockResolvedValue(null);

    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    const body = await res.json();

    expect(body.status).toBe("ok");
    expect(monitoredAppCount).not.toHaveBeenCalled();
    expect(monitorRunFindFirst).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 4: Team invite rate limit
// ─────────────────────────────────────────────────────────────────────────────
describe("Fix 4: Team invite POST rate limited per org", () => {
  it("returns 429 when org has exceeded invite rate limit", async () => {
    getSession.mockResolvedValue(adminSession);
    checkRateLimit.mockResolvedValue({ allowed: false });

    const { POST } = await import("@/app/api/team/route");
    const res = await POST(makeRequest("POST", { email: "new@example.com", role: "MEMBER" }));

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain("Too many invitations");
  });

  it("rate limit key is scoped to orgId (not IP)", async () => {
    getSession.mockResolvedValue(adminSession);
    checkRateLimit.mockResolvedValue({ allowed: false });

    const { POST } = await import("@/app/api/team/route");
    await POST(makeRequest("POST", { email: "new@example.com", role: "MEMBER" }));

    expect(checkRateLimit).toHaveBeenCalledWith(
      `team-invite:${adminSession.orgId}`,
      expect.any(Object),
    );
  });

  it("proceeds when under rate limit", async () => {
    getSession.mockResolvedValue(adminSession);
    checkRateLimit.mockResolvedValue({ allowed: true });
    canAddUser.mockResolvedValue({ allowed: true });
    userFindFirst.mockResolvedValue(null);
    inviteFindFirst.mockResolvedValue(null);
    organizationFindUnique.mockResolvedValue({ name: "Acme Corp" });
    inviteCreate.mockResolvedValue({ id: "inv_1", email: "new@example.com", role: "MEMBER" });

    const { POST } = await import("@/app/api/team/route");
    const res = await POST(makeRequest("POST", { email: "new@example.com", role: "MEMBER" }));

    expect(res.status).toBe(201);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 5: API key cap per tier
// ─────────────────────────────────────────────────────────────────────────────
describe("Fix 5: API key creation capped per tier", () => {
  it("PRO org at 5 keys gets 403 on 6th key creation", async () => {
    getSession.mockResolvedValue(adminSession);
    getOrgLimits.mockResolvedValue({ tier: "PRO", status: "ACTIVE" });
    apiKeyCount.mockResolvedValue(5);

    const { POST } = await import("@/app/api/keys/route");
    const res = await POST(makeRequest("POST", { name: "My Key" }));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("PRO");
    expect(body.error).toContain("5");
    expect(apiKeyCreate).not.toHaveBeenCalled();
  });

  it("ENTERPRISE org at 20 keys gets 403 on 21st key creation", async () => {
    getSession.mockResolvedValue(adminSession);
    getOrgLimits.mockResolvedValue({ tier: "ENTERPRISE", status: "ACTIVE" });
    apiKeyCount.mockResolvedValue(20);

    const { POST } = await import("@/app/api/keys/route");
    const res = await POST(makeRequest("POST", { name: "Another Key" }));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("ENTERPRISE");
    expect(body.error).toContain("20");
  });

  it("PRO org under cap creates key successfully", async () => {
    getSession.mockResolvedValue(adminSession);
    getOrgLimits.mockResolvedValue({ tier: "PRO", status: "ACTIVE" });
    apiKeyCount.mockResolvedValue(4);
    apiKeyCreate.mockResolvedValue({
      id: "key_1",
      name: "My Key",
      keyPrefix: "vs_abc12345",
      lastUsedAt: null,
      createdAt: new Date(),
    });

    const { POST } = await import("@/app/api/keys/route");
    const res = await POST(makeRequest("POST", { name: "My Key" }));

    expect(res.status).toBe(201);
    expect(apiKeyCreate).toHaveBeenCalledOnce();
  });

  it("ENTERPRISE_PLUS org at 50 keys gets 403 on 51st key", async () => {
    getSession.mockResolvedValue(adminSession);
    getOrgLimits.mockResolvedValue({ tier: "ENTERPRISE_PLUS", status: "ACTIVE" });
    apiKeyCount.mockResolvedValue(50);

    const { POST } = await import("@/app/api/keys/route");
    const res = await POST(makeRequest("POST", { name: "Key 51" }));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("50");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 6: Password reset per-email throttle
// ─────────────────────────────────────────────────────────────────────────────
describe("Fix 6: Password reset throttled per email address", () => {
  it("4th reset for same email within 1 hour returns 200 without sending email", async () => {
    // IP rate limit passes; email rate limit blocks
    checkRateLimit.mockImplementation(async (key: string) => {
      if (key.startsWith("forgot-password-email:")) return { allowed: false };
      return { allowed: true };
    });

    userFindFirst.mockResolvedValue({ id: "user_1", email: "victim@example.com" });

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { POST } = await import("@/app/api/auth/forgot-password/route");
    const res = await POST(makeRequest("POST", { email: "victim@example.com" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("email rate limit is keyed per email address", async () => {
    checkRateLimit.mockImplementation(async (key: string) => {
      if (key.startsWith("forgot-password-email:")) return { allowed: false };
      return { allowed: true };
    });

    userFindFirst.mockResolvedValue({ id: "user_1", email: "victim@example.com" });
    vi.stubGlobal("fetch", vi.fn());

    const { POST } = await import("@/app/api/auth/forgot-password/route");
    await POST(makeRequest("POST", { email: "victim@example.com" }));

    const calls = (checkRateLimit as ReturnType<typeof vi.fn>).mock.calls;
    const emailLimitCall = calls.find(
      ([key]: [string]) => key === "forgot-password-email:victim@example.com",
    );
    expect(emailLimitCall).toBeDefined();

    vi.unstubAllGlobals();
  });

  it("first reset for an email proceeds normally and sends email", async () => {
    checkRateLimit.mockResolvedValue({ allowed: true });
    userFindFirst.mockResolvedValue({ id: "user_1", email: "victim@example.com" });

    const fetchSpy = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    process.env.RESEND_API_KEY = "test-resend-key";

    const { POST } = await import("@/app/api/auth/forgot-password/route");
    const res = await POST(makeRequest("POST", { email: "victim@example.com" }));

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledOnce();

    delete process.env.RESEND_API_KEY;
    vi.unstubAllGlobals();
  });

  it("non-existent email still returns 200 without sending email (no existence leak)", async () => {
    checkRateLimit.mockResolvedValue({ allowed: true });
    userFindFirst.mockResolvedValue(null);

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { POST } = await import("@/app/api/auth/forgot-password/route");
    const res = await POST(makeRequest("POST", { email: "nobody@example.com" }));

    expect(res.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
