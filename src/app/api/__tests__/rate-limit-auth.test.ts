import { beforeEach, describe, expect, it, vi } from "vitest";

const checkRateLimit = vi.fn();
const getClientIp = vi.fn();

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit, getClientIp }));
vi.mock("@/lib/db", () => ({ db: { user: { findFirst: vi.fn() }, organization: { create: vi.fn() } } }));
vi.mock("@/lib/auth", () => ({ verifyPassword: vi.fn(), createSession: vi.fn(), hashPassword: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

describe("auth rate-limit behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClientIp.mockReturnValue("1.2.3.4");
  });

  it("login returns 429 with Retry-After header", async () => {
    checkRateLimit.mockReturnValueOnce({ allowed: false, retryAfterSeconds: 120 });
    const { POST } = await import("@/app/api/auth/login/route");

    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ email: "a@b.com", password: "x" }),
      headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("120");
  });

  it("signup returns safe default Retry-After when limiter omits value", async () => {
    checkRateLimit.mockReturnValueOnce({ allowed: false });
    const { POST } = await import("@/app/api/auth/signup/route");

    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ email: "a@b.com", password: "password123", name: "A", orgName: "Org" }),
      headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
  });
});
