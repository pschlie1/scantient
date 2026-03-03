/**
 * probe-client.test.ts
 *
 * Unit tests for probe-client.ts runProbe() function.
 * All network calls are mocked — zero real HTTP.
 *
 * Covers:
 *  - Valid ProbeResult → returns ok ProbeOutcome
 *  - Wrong shape response → returns error (Zod validation failure)
 *  - 401/403 response → returns auth error
 *  - Network timeout → returns timeout error
 *  - SSRF blocked URL → returns SSRF error
 *  - Invalid JSON → returns parse error
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Mock dependencies ────────────────────────────────────────────────────────
// vi.hoisted ensures the fn() is created BEFORE vi.mock hoisting runs

const { mockSsrfSafeFetch, mockIsPrivateUrl } = vi.hoisted(() => ({
  mockSsrfSafeFetch: vi.fn(),
  mockIsPrivateUrl: vi.fn(),
}));

vi.mock("@/lib/ssrf-guard", () => ({
  ssrfSafeFetch: mockSsrfSafeFetch,
  isPrivateUrl: mockIsPrivateUrl,
}));

import { runProbe, ProbeResultSchema } from "@/lib/probe-client";

// ─── Valid probe response factory ─────────────────────────────────────────────

function validProbePayload(overrides = {}) {
  return {
    ok: true,
    respondedAt: new Date().toISOString(),
    latencyMs: 42,
    subsystems: {
      database: { ok: true, latencyMs: 5 },
      auth: { ok: true, latencyMs: 2 },
    },
    version: "1.0.0",
    environment: "production",
    ...overrides,
  };
}

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Valid probe responses
// ─────────────────────────────────────────────────────────────────────────────

describe("runProbe — valid responses", () => {
  beforeEach(() => {
    mockIsPrivateUrl.mockResolvedValue(false);
    vi.resetAllMocks();
    mockIsPrivateUrl.mockResolvedValue(false);
  });

  it("returns ok:true for a valid ProbeResult", async () => {
    const payload = validProbePayload();
    mockSsrfSafeFetch.mockResolvedValue(makeJsonResponse(payload));

    const result = await runProbe("https://app.example.com/api/scantient-probe", "secret-token");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.subsystems).toBeDefined();
    }
  });

  it("sends X-Scan-Token header to probe endpoint", async () => {
    const payload = validProbePayload();
    mockSsrfSafeFetch.mockResolvedValue(makeJsonResponse(payload));

    await runProbe("https://app.example.com/api/scantient-probe", "my-secret-token");

    expect(mockSsrfSafeFetch).toHaveBeenCalledWith(
      "https://app.example.com/api/scantient-probe",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Scan-Token": "my-secret-token",
        }),
      }),
      expect.any(Number),
    );
  });

  it("returns ok:true with all subsystems reported as healthy", async () => {
    const payload = validProbePayload({
      subsystems: {
        database: { ok: true, latencyMs: 3 },
        auth: { ok: true, latencyMs: 1 },
        payments: { ok: true, latencyMs: 10, provider: "stripe" },
        email: { ok: true, latencyMs: 5, provider: "resend" },
        queue: { ok: true, latencyMs: 2, depth: 0 },
        cache: { ok: true, latencyMs: 1 },
      },
    });
    mockSsrfSafeFetch.mockResolvedValue(makeJsonResponse(payload));

    const result = await runProbe("https://app.example.com/api/scantient-probe", "token");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.subsystems.database?.ok).toBe(true);
      expect(result.subsystems.payments?.provider).toBe("stripe");
    }
  });

  it("accepts minimal valid payload (only required fields)", async () => {
    const minimal = {
      ok: true,
      respondedAt: new Date().toISOString(),
      latencyMs: 100,
      subsystems: {},
    };
    mockSsrfSafeFetch.mockResolvedValue(makeJsonResponse(minimal));

    const result = await runProbe("https://app.example.com/api/scantient-probe", "token");
    expect(result.ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Schema validation failures
// ─────────────────────────────────────────────────────────────────────────────

describe("runProbe — schema validation failures (Zod)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockIsPrivateUrl.mockResolvedValue(false);
  });

  it("returns ok:false when response is missing required 'respondedAt' field", async () => {
    const malformed = {
      ok: true,
      latencyMs: 42,
      subsystems: {},
      // Missing: respondedAt
    };
    mockSsrfSafeFetch.mockResolvedValue(makeJsonResponse(malformed));

    const result = await runProbe("https://app.example.com/api/scantient-probe", "token");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("schema invalid");
    }
  });

  it("returns ok:false when 'respondedAt' is not a valid ISO datetime", async () => {
    const malformed = validProbePayload({ respondedAt: "not-a-date" });
    mockSsrfSafeFetch.mockResolvedValue(makeJsonResponse(malformed));

    const result = await runProbe("https://app.example.com/api/scantient-probe", "token");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("schema invalid");
    }
  });

  it("returns ok:false when 'latencyMs' is a string instead of number", async () => {
    const malformed = validProbePayload({ latencyMs: "fast" });
    mockSsrfSafeFetch.mockResolvedValue(makeJsonResponse(malformed));

    const result = await runProbe("https://app.example.com/api/scantient-probe", "token");
    expect(result.ok).toBe(false);
  });

  it("returns ok:false when response body is an empty object {}", async () => {
    mockSsrfSafeFetch.mockResolvedValue(makeJsonResponse({}));

    const result = await runProbe("https://app.example.com/api/scantient-probe", "token");
    expect(result.ok).toBe(false);
  });

  it("returns ok:false when response body is a string (not JSON object)", async () => {
    mockSsrfSafeFetch.mockResolvedValue(
      new Response('"just a string"', { status: 200, headers: { "content-type": "application/json" } }),
    );

    const result = await runProbe("https://app.example.com/api/scantient-probe", "token");
    expect(result.ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HTTP error responses
// ─────────────────────────────────────────────────────────────────────────────

describe("runProbe — HTTP error responses", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockIsPrivateUrl.mockResolvedValue(false);
  });

  it("returns ok:false for 401 Unauthorized response", async () => {
    mockSsrfSafeFetch.mockResolvedValue(
      new Response('{"error":"Unauthorized"}', { status: 401 }),
    );

    const result = await runProbe("https://app.example.com/api/scantient-probe", "wrong-token");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("401");
    }
  });

  it("returns ok:false for 403 Forbidden response", async () => {
    mockSsrfSafeFetch.mockResolvedValue(
      new Response('{"error":"Forbidden"}', { status: 403 }),
    );

    const result = await runProbe("https://app.example.com/api/scantient-probe", "token");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("403");
    }
  });

  it("returns ok:false for 500 Internal Server Error", async () => {
    mockSsrfSafeFetch.mockResolvedValue(
      new Response("Internal Server Error", { status: 500 }),
    );

    const result = await runProbe("https://app.example.com/api/scantient-probe", "token");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("500");
    }
  });

  it("returns ok:false for 404 Not Found (probe endpoint not installed)", async () => {
    mockSsrfSafeFetch.mockResolvedValue(
      new Response("Not Found", { status: 404 }),
    );

    const result = await runProbe("https://app.example.com/api/scantient-probe", "token");
    expect(result.ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Invalid JSON response body
// ─────────────────────────────────────────────────────────────────────────────

describe("runProbe — invalid JSON body", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockIsPrivateUrl.mockResolvedValue(false);
  });

  it("returns ok:false for non-JSON response body", async () => {
    mockSsrfSafeFetch.mockResolvedValue(
      new Response("<html>Not Found</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    const result = await runProbe("https://app.example.com/api/scantient-probe", "token");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("invalid JSON");
    }
  });

  it("returns ok:false for malformed JSON (truncated)", async () => {
    mockSsrfSafeFetch.mockResolvedValue(
      new Response('{"ok":true,"respondedAt":"', {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await runProbe("https://app.example.com/api/scantient-probe", "token");
    expect(result.ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Network timeout
// ─────────────────────────────────────────────────────────────────────────────

describe("runProbe — network timeout", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockIsPrivateUrl.mockResolvedValue(false);
  });

  it("returns ok:false with 'timed out' message on TimeoutError", async () => {
    mockSsrfSafeFetch.mockRejectedValue(
      Object.assign(new Error("TimeoutError: The operation was aborted"), { name: "TimeoutError" }),
    );

    const result = await runProbe("https://app.example.com/api/scantient-probe", "token");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.toLowerCase()).toContain("timed out");
    }
  });

  it("returns ok:false with 'Fetch error' message on connection refused", async () => {
    mockSsrfSafeFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await runProbe("https://app.example.com/api/scantient-probe", "token");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Fetch error");
    }
  });

  it("never throws — always returns a ProbeOutcome", async () => {
    mockSsrfSafeFetch.mockRejectedValue(new Error("Unexpected catastrophic failure"));

    await expect(
      runProbe("https://app.example.com/api/scantient-probe", "token"),
    ).resolves.toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SSRF protection
// ─────────────────────────────────────────────────────────────────────────────

describe("runProbe — SSRF protection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns ok:false with SSRF error when URL resolves to private address", async () => {
    mockIsPrivateUrl.mockResolvedValue(true);

    const result = await runProbe("http://169.254.169.254/latest/meta-data", "token");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.toLowerCase()).toContain("ssrf");
    }
  });

  it("returns ok:false with SSRF error for internal 192.168.x.x addresses", async () => {
    mockIsPrivateUrl.mockResolvedValue(true);

    const result = await runProbe("http://192.168.1.1/admin", "token");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.toLowerCase()).toContain("ssrf");
    }
  });

  it("returns ok:false when SSRF check itself throws an error", async () => {
    mockIsPrivateUrl.mockRejectedValue(new Error("DNS resolution failed"));

    const result = await runProbe("https://attacker.example.com/probe", "token");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("SSRF check failed");
    }
  });

  it("proceeds normally when SSRF check clears URL as safe", async () => {
    mockIsPrivateUrl.mockResolvedValue(false);
    mockSsrfSafeFetch.mockResolvedValue(makeJsonResponse(validProbePayload()));

    const result = await runProbe("https://safe.example.com/api/probe", "token");
    expect(result.ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ProbeResultSchema — direct Zod schema tests
// ─────────────────────────────────────────────────────────────────────────────

describe("ProbeResultSchema — Zod schema validation", () => {
  it("accepts valid minimal payload", () => {
    const result = ProbeResultSchema.safeParse({
      ok: true,
      respondedAt: "2026-03-02T12:00:00.000Z",
      latencyMs: 50,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing respondedAt", () => {
    const result = ProbeResultSchema.safeParse({ ok: true, latencyMs: 50 });
    expect(result.success).toBe(false);
  });

  it("rejects non-datetime respondedAt", () => {
    const result = ProbeResultSchema.safeParse({
      ok: true,
      respondedAt: "not-a-date",
      latencyMs: 50,
    });
    expect(result.success).toBe(false);
  });

  it("accepts zero latencyMs (valid — extremely fast local response)", () => {
    // Note: ProbeResultSchema uses z.number() without minimum constraint
    // so negative and zero values are accepted by the schema.
    // This test documents the current schema behavior.
    const result = ProbeResultSchema.safeParse({
      ok: true,
      respondedAt: "2026-03-02T12:00:00.000Z",
      latencyMs: 0,
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional subsystem fields", () => {
    const result = ProbeResultSchema.safeParse({
      ok: false,
      respondedAt: "2026-03-02T12:00:00.000Z",
      latencyMs: 100,
      subsystems: {
        database: { ok: false, error: "Connection refused" },
      },
    });
    expect(result.success).toBe(true);
  });
});
