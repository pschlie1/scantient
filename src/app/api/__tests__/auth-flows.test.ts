/**
 * auth-flows.test.ts
 * Tests for auth API routes: forgot-password, reset-password, verify-email, invite/[token]
 */
import { beforeEach, beforeAll, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";

const TEST_JWT_SECRET = "test-jwt-secret-auth-flows";

// Set env before any module imports
beforeAll(() => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
});

// --- DB mocks ---
const userFindFirst = vi.fn();
const userFindUnique = vi.fn();
const userUpdate = vi.fn();
const userCreate = vi.fn();
const inviteFindUnique = vi.fn();
const inviteDelete = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findFirst: userFindFirst,
      findUnique: userFindUnique,
      update: userUpdate,
      create: userCreate,
    },
    invite: {
      findUnique: inviteFindUnique,
      delete: inviteDelete,
    },
  },
}));

// --- Auth mocks ---
const hashPassword = vi.fn().mockResolvedValue("hashed-password");
const createSession = vi.fn().mockResolvedValue({ id: "user_1", email: "test@example.com" });

vi.mock("@/lib/auth", () => ({ hashPassword, createSession }));

// --- Rate limit mocks ---
const checkRateLimit = vi.fn();
const getClientIp = vi.fn().mockReturnValue("1.2.3.4");

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit, getClientIp }));

// --- Analytics mock ---
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

// --- Tenant mock (canAddUser used in invite acceptance) ---
const canAddUser = vi.fn();
vi.mock("@/lib/tenant", () => ({ canAddUser }));

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimit.mockResolvedValue({ allowed: true });
  getClientIp.mockReturnValue("1.2.3.4");
  canAddUser.mockResolvedValue({ allowed: true });
});

// Helper to build a Request
function makeReq(body: unknown, method = "POST") {
  return new Request("http://localhost", {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Forgot Password
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/auth/forgot-password", () => {
  it("returns 200 when email does not exist (no user leakage)", async () => {
    userFindFirst.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/auth/forgot-password/route");
    const res = await POST(makeReq({ email: "ghost@example.com" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("returns 200 when user exists (email would be sent)", async () => {
    userFindFirst.mockResolvedValueOnce({ id: "u1", email: "real@example.com" });
    // Prevent real fetch by stubbing global fetch
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const { POST } = await import("@/app/api/auth/forgot-password/route");
    const res = await POST(makeReq({ email: "real@example.com" }));
    expect(res.status).toBe(200);
    fetchSpy.mockRestore();
  });

  it("returns 200 on invalid email format (no user leakage)", async () => {
    const { POST } = await import("@/app/api/auth/forgot-password/route");
    const res = await POST(makeReq({ email: "not-an-email" }));
    expect(res.status).toBe(200);
  });

  it("returns 200 (not 429) when rate limited — avoids email-existence leak", async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: false });
    const { POST } = await import("@/app/api/auth/forgot-password/route");
    const res = await POST(makeReq({ email: "a@b.com" }));
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Reset Password
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/auth/reset-password", () => {
  it("returns 400 on missing token", async () => {
    const { POST } = await import("@/app/api/auth/reset-password/route");
    const res = await POST(makeReq({ password: "newpassword123" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on missing password", async () => {
    const { POST } = await import("@/app/api/auth/reset-password/route");
    const res = await POST(makeReq({ token: "sometoken" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid/expired JWT token", async () => {
    const { POST } = await import("@/app/api/auth/reset-password/route");
    const res = await POST(makeReq({ token: "invalid.jwt.token", password: "newpassword123" }));
    expect(res.status).toBe(400);
  });

  it("returns 200 on valid token + updates passwordHash", async () => {
    const issuedAt = Math.floor(Date.now() / 1000) - 10;
    const token = jwt.sign(
      { sub: "user_1", purpose: "password-reset", iat: issuedAt },
      TEST_JWT_SECRET,
      { expiresIn: "1h" },
    );
    const userUpdatedAt = new Date(issuedAt * 1000 - 5000); // updated before token issue
    userFindUnique.mockResolvedValueOnce({
      id: "user_1",
      email: "test@example.com",
      updatedAt: userUpdatedAt,
    });
    userUpdate.mockResolvedValueOnce({});

    const { POST } = await import("@/app/api/auth/reset-password/route");
    const res = await POST(makeReq({ token, password: "newpassword123" }));
    expect(res.status).toBe(200);
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user_1" }, data: { passwordHash: "hashed-password" } }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Verify Email
// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/auth/verify-email", () => {
  function makeGetReq(token?: string) {
    const url = token
      ? `http://localhost/api/auth/verify-email?token=${encodeURIComponent(token)}`
      : "http://localhost/api/auth/verify-email";
    return new Request(url, { method: "GET" });
  }

  it("returns 400 on missing token", async () => {
    const { GET } = await import("@/app/api/auth/verify-email/route");
    const res = await GET(makeGetReq());
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid JWT token", async () => {
    const { GET } = await import("@/app/api/auth/verify-email/route");
    const res = await GET(makeGetReq("bad.jwt.value"));
    expect(res.status).toBe(400);
  });

  it("sets emailVerified: true on valid token", async () => {
    const token = jwt.sign(
      { sub: "user_2", purpose: "email-verify" },
      TEST_JWT_SECRET,
      { expiresIn: "1h" },
    );
    userFindUnique.mockResolvedValueOnce({ id: "user_2", email: "verify@example.com", emailVerified: false });
    userUpdate.mockResolvedValueOnce({});

    const { GET } = await import("@/app/api/auth/verify-email/route");
    const res = await GET(makeGetReq(token));
    expect(res.status).toBe(200);
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user_2" }, data: { emailVerified: true } }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Invite Accept
// ─────────────────────────────────────────────────────────────────────────────
describe("POST /api/auth/invite/[token]", () => {
  const FUTURE = new Date(Date.now() + 86_400_000);
  const PAST = new Date(Date.now() - 86_400_000);

  it("returns 404 when invite not found", async () => {
    inviteFindUnique.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/auth/invite/[token]/route");
    const res = await POST(makeReq({ name: "Alice", password: "password123456" }), {
      params: Promise.resolve({ token: "no-such-token" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 410 when invite is expired", async () => {
    inviteFindUnique.mockResolvedValueOnce({
      token: "expired-token",
      email: "expired@example.com",
      role: "MEMBER",
      orgId: "org_1",
      expiresAt: PAST,
      org: { name: "TestOrg", id: "org_1" },
    });
    const { POST } = await import("@/app/api/auth/invite/[token]/route");
    const res = await POST(makeReq({ name: "Alice", password: "password123456" }), {
      params: Promise.resolve({ token: "expired-token" }),
    });
    expect(res.status).toBe(410);
  });

  it("returns 201 on successful accept: creates user, deletes invite", async () => {
    const invite = {
      token: "valid-token",
      email: "new@example.com",
      role: "MEMBER",
      orgId: "org_1",
      expiresAt: FUTURE,
      org: { name: "TestOrg", id: "org_1" },
    };
    inviteFindUnique.mockResolvedValueOnce(invite);
    userFindFirst.mockResolvedValueOnce(null); // no existing user
    userCreate.mockResolvedValueOnce({ id: "new_user_1", email: "new@example.com" });
    inviteDelete.mockResolvedValueOnce({});
    createSession.mockResolvedValueOnce({ id: "new_user_1", email: "new@example.com" });

    const { POST } = await import("@/app/api/auth/invite/[token]/route");
    const res = await POST(makeReq({ name: "Alice", password: "password123456" }), {
      params: Promise.resolve({ token: "valid-token" }),
    });
    expect(res.status).toBe(201);
    expect(userCreate).toHaveBeenCalled();
    expect(inviteDelete).toHaveBeenCalledWith({ where: { token: "valid-token" } });
  });
});
