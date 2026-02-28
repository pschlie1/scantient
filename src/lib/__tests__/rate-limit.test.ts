import { describe, expect, it } from "vitest";
import { checkRateLimit } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  it("blocks requests beyond max attempts in window", async () => {
    const key = `test:${Date.now()}`;
    const cfg = { maxAttempts: 2, windowMs: 10_000 };

    expect((await checkRateLimit(key, cfg)).allowed).toBe(true);
    expect((await checkRateLimit(key, cfg)).allowed).toBe(true);

    const third = await checkRateLimit(key, cfg);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });
});
