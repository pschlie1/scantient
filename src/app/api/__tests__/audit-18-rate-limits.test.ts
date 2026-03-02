/**
 * audit-18-rate-limits.test.ts
 * Audit 18: Verify that newly rate-limited endpoints return 429 with a
 * Retry-After header when checkRateLimit denies the request.
 *
 * Endpoints tested:
 *   - GET  /api/auth/verify-email  (IP-based, 10/min)
 *   - POST /api/auth/logout        (IP-based, 10/min)
 *   - POST /api/stripe/checkout    (user-based, 5/min)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Rate-limit mocks ──────────────────────────────────────────────────────────
const checkRateLimit = vi.fn();
const getClientIp = vi.fn();

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit, getClientIp }));

// ── Shared DB + auth mocks ────────────────────────────────────────────────────
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    organization: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
  destroySession: vi.fn().mockResolvedValue(undefined),
  requireRole: vi.fn(),
  createSession: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn(),
  PLANS: { STARTER: { priceId: "price_123" }, PRO: { priceId: "price_456" }, ENTERPRISE: { priceId: "price_789" }, ENTERPRISE_PLUS: { priceId: "price_012" } },
}));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  getClientIp.mockReturnValue("10.0.0.1");
});

// ── verify-email ──────────────────────────────────────────────────────────────
describe("GET /api/auth/verify-email — rate limit (Audit 18)", () => {
  it("returns 429 with Retry-After when rate limit is exceeded", async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 45 });

    const { GET } = await import("@/app/api/auth/verify-email/route");
    const req = new Request("http://localhost/api/auth/verify-email?token=abc", {
      method: "GET",
      headers: { "x-forwarded-for": "10.0.0.1" },
    });

    const res = await GET(req);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("45");
  });

  it("proceeds normally when rate limit is not exceeded", async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: true });
    // No token → 400 (but NOT rate-limited)
    const { GET } = await import("@/app/api/auth/verify-email/route");
    const req = new Request("http://localhost/api/auth/verify-email", {
      method: "GET",
      headers: { "x-forwarded-for": "10.0.0.1" },
    });

    const res = await GET(req);
    expect(res.status).not.toBe(429);
  });

  it("uses IP-based rate limit key for verify-email", async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: true });
    const { GET } = await import("@/app/api/auth/verify-email/route");
    const req = new Request("http://localhost/api/auth/verify-email", {
      method: "GET",
      headers: { "x-forwarded-for": "192.168.1.1" },
    });
    getClientIp.mockReturnValueOnce("192.168.1.1");

    await GET(req);

    expect(checkRateLimit).toHaveBeenCalledOnce();
    const [key, config] = checkRateLimit.mock.calls[0];
    expect(key).toContain("192.168.1.1");
    expect(config.maxAttempts).toBe(10);
    expect(config.windowMs).toBe(60_000);
  });
});

// ── logout ────────────────────────────────────────────────────────────────────
describe("POST /api/auth/logout — rate limit (Audit 18)", () => {
  it("returns 429 with Retry-After when rate limit is exceeded", async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 30 });

    const { POST } = await import("@/app/api/auth/logout/route");
    const req = new Request("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { "x-forwarded-for": "10.0.0.1" },
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
  });

  it("falls back to Retry-After: 60 when retryAfterSeconds is undefined", async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: false });

    const { POST } = await import("@/app/api/auth/logout/route");
    const req = new Request("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { "x-forwarded-for": "10.0.0.1" },
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
  });

  it("uses IP-based rate limit key for logout", async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: true });
    const { getSession, destroySession } = await import("@/lib/auth");
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    (destroySession as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

    const { POST } = await import("@/app/api/auth/logout/route");
    const req = new Request("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { "x-forwarded-for": "10.0.0.2" },
    });
    getClientIp.mockReturnValueOnce("10.0.0.2");

    await POST(req);

    expect(checkRateLimit).toHaveBeenCalledOnce();
    const [key, config] = checkRateLimit.mock.calls[0];
    expect(key).toContain("10.0.0.2");
    expect(config.maxAttempts).toBe(10);
    expect(config.windowMs).toBe(60_000);
  });
});

// ── stripe/checkout ───────────────────────────────────────────────────────────
describe("POST /api/stripe/checkout — rate limit (Audit 18)", () => {
  it("returns 429 with Retry-After when rate limit is exceeded", async () => {
    const { getSession } = await import("@/lib/auth");
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "user-1",
      orgId: "org-1",
      email: "test@example.com",
    });
    checkRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 55 });

    const { POST } = await import("@/app/api/stripe/checkout/route");
    const req = new Request("http://localhost/api/stripe/checkout", {
      method: "POST",
      body: JSON.stringify({ plan: "PRO" }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("55");
  });

  it("uses user-id-based rate limit key for checkout", async () => {
    const { getSession } = await import("@/lib/auth");
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "user-42",
      orgId: "org-1",
      email: "test@example.com",
    });
    checkRateLimit.mockResolvedValueOnce({ allowed: true });
    // After rate limit passes, it will try to parse body and hit db — mock to avoid error
    const { db } = await import("@/lib/db");
    (db.organization.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const { POST } = await import("@/app/api/stripe/checkout/route");
    const req = new Request("http://localhost/api/stripe/checkout", {
      method: "POST",
      body: JSON.stringify({ plan: "PRO" }),
      headers: { "content-type": "application/json" },
    });

    await POST(req);

    expect(checkRateLimit).toHaveBeenCalledOnce();
    const [key, config] = checkRateLimit.mock.calls[0];
    expect(key).toContain("user-42");
    expect(config.maxAttempts).toBe(5);
    expect(config.windowMs).toBe(60_000);
  });

  it("returns 401 (not 429) when session is missing", async () => {
    const { getSession } = await import("@/lib/auth");
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const { POST } = await import("@/app/api/stripe/checkout/route");
    const req = new Request("http://localhost/api/stripe/checkout", {
      method: "POST",
      body: JSON.stringify({ plan: "PRO" }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    // checkRateLimit should NOT have been called (no session to key off)
    expect(checkRateLimit).not.toHaveBeenCalled();
  });
});
