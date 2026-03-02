/**
 * api-auth-prevalidation.test.ts
 * Audit 22 Focus 3: API key format pre-validation (prefix + length check)
 * before any DB lookup is attempted.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── DB mocks ──────────────────────────────────────────────────────────────────
const apiKeyFindFirst = vi.fn();
const subscriptionFindUnique = vi.fn();
const apiKeyUpdate = vi.fn();
const auditLogCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    apiKey: { findFirst: apiKeyFindFirst, update: apiKeyUpdate },
    subscription: { findUnique: subscriptionFindUnique },
    auditLog: { create: auditLogCreate },
  },
}));

// A valid key: "vs_" + 43 base64url chars = 46 chars total
const VALID_KEY = "vs_" + "a".repeat(43); // 46 chars
const BEARER_VALID = `Bearer ${VALID_KEY}`;

beforeEach(() => {
  vi.clearAllMocks();
  apiKeyFindFirst.mockResolvedValue(null);
  subscriptionFindUnique.mockResolvedValue(null);
  apiKeyUpdate.mockResolvedValue({});
  auditLogCreate.mockResolvedValue({});
});

describe("authenticateApiKey — Bearer token format pre-validation (Audit 22)", () => {
  it("returns null and does NOT hit DB when key is missing", async () => {
    const { authenticateApiKey } = await import("@/lib/api-auth");
    const req = new Request("http://localhost");
    const result = await authenticateApiKey(req);
    expect(result).toBeNull();
    expect(apiKeyFindFirst).not.toHaveBeenCalled();
  });

  it("returns null and does NOT hit DB when key lacks vs_ prefix", async () => {
    const { authenticateApiKey } = await import("@/lib/api-auth");
    const req = new Request("http://localhost", {
      headers: { Authorization: "Bearer sk_" + "a".repeat(43) },
    });
    const result = await authenticateApiKey(req);
    expect(result).toBeNull();
    expect(apiKeyFindFirst).not.toHaveBeenCalled();
  });

  it("returns null and does NOT hit DB when key is too long (> 46 chars)", async () => {
    const { authenticateApiKey } = await import("@/lib/api-auth");
    const longKey = "vs_" + "a".repeat(100); // way too long
    const req = new Request("http://localhost", {
      headers: { Authorization: `Bearer ${longKey}` },
    });
    const result = await authenticateApiKey(req);
    expect(result).toBeNull();
    // DB must not be queried for oversized keys
    expect(apiKeyFindFirst).not.toHaveBeenCalled();
  });

  it("returns null and does NOT hit DB when key is too short", async () => {
    const { authenticateApiKey } = await import("@/lib/api-auth");
    const shortKey = "vs_" + "a".repeat(5); // too short
    const req = new Request("http://localhost", {
      headers: { Authorization: `Bearer ${shortKey}` },
    });
    const result = await authenticateApiKey(req);
    expect(result).toBeNull();
    expect(apiKeyFindFirst).not.toHaveBeenCalled();
  });

  it("hits DB when key has correct prefix and length (46 chars)", async () => {
    const { authenticateApiKey } = await import("@/lib/api-auth");
    const req = new Request("http://localhost", {
      headers: { Authorization: BEARER_VALID },
    });
    await authenticateApiKey(req);
    // The key passed format validation — DB should be queried
    expect(apiKeyFindFirst).toHaveBeenCalledOnce();
  });

  it("returns null when key passes format check but is not in DB", async () => {
    apiKeyFindFirst.mockResolvedValue(null);
    const { authenticateApiKey } = await import("@/lib/api-auth");
    const req = new Request("http://localhost", {
      headers: { Authorization: BEARER_VALID },
    });
    const result = await authenticateApiKey(req);
    expect(result).toBeNull();
  });
});

describe("authenticateApiKeyHeader — X-API-Key format pre-validation (Audit 22)", () => {
  it("returns null and does NOT hit DB when key lacks vs_ prefix", async () => {
    const { authenticateApiKeyHeader } = await import("@/lib/api-auth");
    const req = new Request("http://localhost", {
      headers: { "x-api-key": "sk_" + "a".repeat(43) },
    });
    const result = await authenticateApiKeyHeader(req);
    expect(result).toBeNull();
    expect(apiKeyFindFirst).not.toHaveBeenCalled();
  });

  it("returns null and does NOT hit DB for an extremely long x-api-key", async () => {
    const { authenticateApiKeyHeader } = await import("@/lib/api-auth");
    const req = new Request("http://localhost", {
      headers: { "x-api-key": "vs_" + "x".repeat(10_000) },
    });
    const result = await authenticateApiKeyHeader(req);
    expect(result).toBeNull();
    expect(apiKeyFindFirst).not.toHaveBeenCalled();
  });

  it("hits DB when x-api-key has correct format", async () => {
    const { authenticateApiKeyHeader } = await import("@/lib/api-auth");
    const req = new Request("http://localhost", {
      headers: { "x-api-key": VALID_KEY },
    });
    await authenticateApiKeyHeader(req);
    expect(apiKeyFindFirst).toHaveBeenCalledOnce();
  });
});
