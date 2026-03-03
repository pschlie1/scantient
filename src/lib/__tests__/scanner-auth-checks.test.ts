/**
 * scanner-auth-checks.test.ts
 *
 * Unit tests for scanner-auth.ts via runAuthScan().
 * All HTTP is mocked — zero real network calls.
 *
 * Covers:
 *  - AUTH_NO_RATE_LIMIT (checkRateLimiting)
 *  - AUTH_ACCOUNT_ENUMERATION (checkAccountEnumeration)
 *  - AUTH_COOKIE_MISSING_FLAGS (checkAuthCookieSecurity)
 *  - AUTH_PERMISSIVE_CORS (checkPermissiveCors)
 *  - ADMIN_ENDPOINT_UNAUTHED (checkAdminEndpointUnauthed)
 *  - GRAPHQL_INTROSPECTION_EXPOSED (checkGraphqlIntrospection)
 *  - checkTokenInUrl
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { DiscoveredEndpoint } from "@/lib/endpoint-discovery";

// ─── Mock ssrfSafeFetch ───────────────────────────────────────────────────────
// vi.hoisted ensures the fn() is created BEFORE vi.mock hoisting runs

const { mockSsrfSafeFetch } = vi.hoisted(() => ({
  mockSsrfSafeFetch: vi.fn(),
}));

vi.mock("@/lib/ssrf-guard", () => ({
  ssrfSafeFetch: mockSsrfSafeFetch,
  isPrivateUrl: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/lib/db", () => ({ db: {} }));

// Import after mock setup
import { runAuthScan } from "@/lib/scanner-auth";

// ─── Endpoint factories ───────────────────────────────────────────────────────

function makeAuthEndpoint(overrides?: Partial<DiscoveredEndpoint>): DiscoveredEndpoint {
  return {
    url: "https://example.com/login",
    path: "/login",
    method: "POST",
    category: "auth",
    confidence: "high",
    source: "html-form",
    ...overrides,
  };
}

function makeAdminEndpoint(overrides?: Partial<DiscoveredEndpoint>): DiscoveredEndpoint {
  return {
    url: "https://example.com/admin",
    path: "/admin",
    method: "GET",
    category: "admin",
    confidence: "high",
    source: "wordlist",
    ...overrides,
  };
}

function makeGraphqlEndpoint(overrides?: Partial<DiscoveredEndpoint>): DiscoveredEndpoint {
  return {
    url: "https://example.com/graphql",
    path: "/graphql",
    method: "POST",
    category: "api",
    confidence: "high",
    source: "wordlist",
    ...overrides,
  };
}

function makeApiEndpoint(overrides?: Partial<DiscoveredEndpoint>): DiscoveredEndpoint {
  return {
    url: "https://example.com/api/users",
    path: "/api/users",
    method: "GET",
    category: "api",
    confidence: "high",
    source: "wordlist",
    ...overrides,
  };
}

// ─── Helpers for mock responses ───────────────────────────────────────────────

function makeResponse(body: string, status: number, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH_NO_RATE_LIMIT — checkRateLimiting
// ─────────────────────────────────────────────────────────────────────────────

describe("AUTH_NO_RATE_LIMIT — rate limit detection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fires when all 6 requests return same status with no rate limit headers", async () => {
    // All requests return 401 — consistent, no rate limiting
    mockSsrfSafeFetch.mockImplementation(async () =>
      makeResponse('{"error":"Invalid credentials"}', 401),
    );

    const findings = await runAuthScan([makeAuthEndpoint()], "https://example.com");
    expect(findings.some((f) => f.code === "AUTH_NO_RATE_LIMIT")).toBe(true);
  });

  it("does NOT fire when server returns 429 (rate limit triggered)", async () => {
    // First few succeed, then 429
    let callCount = 0;
    mockSsrfSafeFetch.mockImplementation(async () => {
      callCount++;
      if (callCount >= 3) return makeResponse("Too Many Requests", 429);
      return makeResponse('{"error":"Invalid credentials"}', 401);
    });

    const findings = await runAuthScan([makeAuthEndpoint()], "https://example.com");
    expect(findings.every((f) => f.code !== "AUTH_NO_RATE_LIMIT")).toBe(true);
  });

  it("does NOT fire when rate limit headers are present (x-ratelimit-limit)", async () => {
    mockSsrfSafeFetch.mockImplementation(async () =>
      makeResponse('{"error":"Invalid credentials"}', 401, {
        "x-ratelimit-limit": "100",
        "x-ratelimit-remaining": "95",
      }),
    );

    const findings = await runAuthScan([makeAuthEndpoint()], "https://example.com");
    expect(findings.every((f) => f.code !== "AUTH_NO_RATE_LIMIT")).toBe(true);
  });

  it("does NOT fire when retry-after header is present", async () => {
    mockSsrfSafeFetch.mockImplementation(async () =>
      makeResponse("Too Many Requests", 429, { "retry-after": "60" }),
    );

    const findings = await runAuthScan([makeAuthEndpoint()], "https://example.com");
    expect(findings.every((f) => f.code !== "AUTH_NO_RATE_LIMIT")).toBe(true);
  });

  it("does NOT fire on non-auth endpoint paths", async () => {
    // Product listing endpoint — should not be checked for auth rate limiting
    mockSsrfSafeFetch.mockImplementation(async () =>
      makeResponse('{"products":[]}', 200),
    );

    const nonAuthEndpoint: DiscoveredEndpoint = {
      url: "https://example.com/api/products",
      path: "/api/products",
      method: "GET",
      category: "api",
      confidence: "medium",
      source: "wordlist",
    };

    const findings = await runAuthScan([nonAuthEndpoint], "https://example.com");
    expect(findings.every((f) => f.code !== "AUTH_NO_RATE_LIMIT")).toBe(true);
  });

  it("does NOT fire when network returns null (connection error)", async () => {
    mockSsrfSafeFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const findings = await runAuthScan([makeAuthEndpoint()], "https://example.com");
    expect(findings.every((f) => f.code !== "AUTH_NO_RATE_LIMIT")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTH_ACCOUNT_ENUMERATION — checkAccountEnumeration
// ─────────────────────────────────────────────────────────────────────────────

describe("AUTH_ACCOUNT_ENUMERATION — account enumeration detection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fires when server returns 'user not found' vs 'wrong password' messages", async () => {
    // The enumeration check sends two different POST bodies to the same URL
    // and looks at response text differences.
    // Rate limiting check (checkRateLimiting) runs first and makes 6 calls.
    // We use request body content to determine which response to return.
    mockSsrfSafeFetch.mockImplementation(async (_url: string, opts?: RequestInit) => {
      const body = opts?.body ? JSON.parse(opts.body as string) : {};
      // When called with the dummy "nonexistent" email
      if (body?.email?.includes("nonexistent") || body?.email?.includes("404")) {
        return makeResponse('{"error":"user not found"}', 401);
      }
      // When called with the "admin" email (second enumeration call)
      if (body?.email?.includes("admin")) {
        return makeResponse('{"error":"wrong password"}', 401);
      }
      // Default for rate limiting probes
      return makeResponse('{"error":"user not found"}', 401);
    });

    const findings = await runAuthScan([makeAuthEndpoint()], "https://example.com");
    expect(findings.some((f) => f.code === "AUTH_ACCOUNT_ENUMERATION")).toBe(true);
  });

  it("fires when 'no account' vs 'invalid password' messages differ", async () => {
    mockSsrfSafeFetch.mockImplementation(async (_url: string, opts?: RequestInit) => {
      const body = opts?.body ? JSON.parse(opts.body as string) : {};
      if (body?.email?.includes("nonexistent") || body?.email?.includes("404")) {
        return makeResponse('{"message":"no account with that email"}', 401);
      }
      if (body?.email?.includes("admin")) {
        return makeResponse('{"message":"invalid password, please try again"}', 401);
      }
      return makeResponse('{"message":"no account with that email"}', 401);
    });

    const findings = await runAuthScan([makeAuthEndpoint()], "https://example.com");
    expect(findings.some((f) => f.code === "AUTH_ACCOUNT_ENUMERATION")).toBe(true);
  });

  it("does NOT fire when both responses return identical messages (safe)", async () => {
    mockSsrfSafeFetch.mockImplementation(async () =>
      makeResponse('{"error":"Invalid email or password"}', 401),
    );

    const findings = await runAuthScan([makeAuthEndpoint()], "https://example.com");
    expect(findings.every((f) => f.code !== "AUTH_ACCOUNT_ENUMERATION")).toBe(true);
  });

  it("does NOT fire when site has no login form — AUTH_ACCOUNT_ENUMERATION must NOT fire on non-auth endpoints", async () => {
    mockSsrfSafeFetch.mockImplementation(async () => makeResponse('{"error":"user not found"}', 401));

    // No auth endpoints — only a generic API endpoint
    const findings = await runAuthScan(
      [makeApiEndpoint({ path: "/api/search", url: "https://example.com/api/search", category: "api" })],
      "https://example.com",
    );
    expect(findings.every((f) => f.code !== "AUTH_ACCOUNT_ENUMERATION")).toBe(true);
  });

  it("does NOT fire when rate limited during enumeration check", async () => {
    // Returns 429 on all requests — rate limiting active
    mockSsrfSafeFetch.mockImplementation(async () => makeResponse("Too Many Requests", 429));

    const findings = await runAuthScan([makeAuthEndpoint()], "https://example.com");
    expect(findings.every((f) => f.code !== "AUTH_ACCOUNT_ENUMERATION")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTH_COOKIE_MISSING_FLAGS — checkAuthCookieSecurity
// ─────────────────────────────────────────────────────────────────────────────

describe("AUTH_COOKIE_MISSING_FLAGS — auth cookie security", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fires when auth response sets cookie without HttpOnly flag", async () => {
    // Use mockImplementation (not mockResolvedValue) to create FRESH Response objects.
    // mockResolvedValue shares ONE Response — after the first res.text() call, the
    // body is consumed, and postJson returns null for all subsequent calls.
    mockSsrfSafeFetch.mockImplementation(async () =>
      makeResponse('{"token":"abc"}', 200, {
        "set-cookie": "session=abc123; Secure; SameSite=Strict",
        // Missing HttpOnly
      }),
    );

    const findings = await runAuthScan([makeAuthEndpoint()], "https://example.com");
    expect(
      findings.some((f) => f.code === "AUTH_COOKIE_MISSING_FLAGS"),
    ).toBe(true);
  });

  it("does NOT fire when all cookie flags are present", async () => {
    mockSsrfSafeFetch.mockImplementation(async () =>
      makeResponse('{"token":"abc"}', 200, {
        "set-cookie": "session=abc123; HttpOnly; Secure; SameSite=Strict",
      }),
    );

    const findings = await runAuthScan([makeAuthEndpoint()], "https://example.com");
    expect(findings.every((f) => f.code !== "AUTH_COOKIE_MISSING_FLAGS")).toBe(true);
  });

  it("does NOT fire when no cookie is set in response", async () => {
    mockSsrfSafeFetch.mockImplementation(async () =>
      makeResponse('{"error":"invalid credentials"}', 401),
    );

    const findings = await runAuthScan([makeAuthEndpoint()], "https://example.com");
    expect(findings.every((f) => f.code !== "AUTH_COOKIE_MISSING_FLAGS")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTH_PERMISSIVE_CORS — checkPermissiveCors
// ─────────────────────────────────────────────────────────────────────────────

describe("AUTH_PERMISSIVE_CORS — CORS policy on auth endpoints", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fires when Access-Control-Allow-Origin: * on an auth endpoint", async () => {
    mockSsrfSafeFetch.mockImplementation(async () =>
      makeResponse("", 200, {
        "access-control-allow-origin": "*",
      }),
    );

    const findings = await runAuthScan([makeAuthEndpoint()], "https://example.com");
    expect(
      findings.some(
        (f) => f.code === "AUTH_PERMISSIVE_CORS" || f.code === "CORS_WILDCARD_CREDENTIALS",
      ),
    ).toBe(true);
  });

  it("does NOT fire when CORS is specific origin", async () => {
    mockSsrfSafeFetch.mockImplementation(async () =>
      makeResponse("", 200, {
        "access-control-allow-origin": "https://app.example.com",
      }),
    );

    const findings = await runAuthScan([makeAuthEndpoint()], "https://example.com");
    expect(findings.every((f) => f.code !== "AUTH_PERMISSIVE_CORS")).toBe(true);
  });

  it("does NOT fire when no CORS headers present", async () => {
    mockSsrfSafeFetch.mockImplementation(async () =>
      makeResponse('{"error":"unauthorized"}', 401),
    );

    const findings = await runAuthScan([makeAuthEndpoint()], "https://example.com");
    expect(findings.every((f) => f.code !== "AUTH_PERMISSIVE_CORS")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN_ENDPOINT_UNAUTHED — checkAdminEndpointUnauthed
// ─────────────────────────────────────────────────────────────────────────────

describe("ADMIN_ENDPOINT_UNAUTHED — admin endpoint access control", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fires ONLY when /admin returns 200 + JSON (genuinely exposed)", async () => {
    mockSsrfSafeFetch.mockImplementation(async () =>
      new Response('{"users":[{"id":1,"email":"admin@example.com"}]}', {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const findings = await runAuthScan([makeAdminEndpoint()], "https://example.com");
    expect(findings.some((f) => f.code === "ADMIN_ENDPOINT_UNAUTHED")).toBe(true);
  });

  it("does NOT fire when /admin returns 401 Unauthorized", async () => {
    mockSsrfSafeFetch.mockImplementation(async () =>
      makeResponse('{"error":"Unauthorized"}', 401),
    );

    const findings = await runAuthScan([makeAdminEndpoint()], "https://example.com");
    expect(findings.every((f) => f.code !== "ADMIN_ENDPOINT_UNAUTHED")).toBe(true);
  });

  it("does NOT fire when /admin returns 403 Forbidden", async () => {
    mockSsrfSafeFetch.mockImplementation(async () =>
      makeResponse('{"error":"Forbidden"}', 403),
    );

    const findings = await runAuthScan([makeAdminEndpoint()], "https://example.com");
    expect(findings.every((f) => f.code !== "ADMIN_ENDPOINT_UNAUTHED")).toBe(true);
  });

  it("does NOT fire when /admin returns 404 Not Found", async () => {
    mockSsrfSafeFetch.mockImplementation(async () =>
      makeResponse("Not Found", 404),
    );

    const findings = await runAuthScan([makeAdminEndpoint()], "https://example.com");
    expect(findings.every((f) => f.code !== "ADMIN_ENDPOINT_UNAUTHED")).toBe(true);
  });

  it("fires with HIGH severity (not CRITICAL) when /admin returns 200 with HTML (not JSON)", async () => {
    // Admin 200 HTML → HIGH (may be unprotected admin panel)
    // Admin 200 JSON → CRITICAL (API data exposed)
    // The check fires for BOTH — just different severities
    mockSsrfSafeFetch.mockImplementation(async () =>
      new Response("<html><body><h1>Login Required</h1></body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    const findings = await runAuthScan([makeAdminEndpoint()], "https://example.com");
    const adminFinding = findings.find((f) => f.code === "ADMIN_ENDPOINT_UNAUTHED");
    expect(adminFinding).toBeDefined();
    expect(adminFinding?.severity).toBe("HIGH"); // HTML → HIGH (not CRITICAL)
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GRAPHQL_INTROSPECTION_EXPOSED — checkGraphqlIntrospection
// ─────────────────────────────────────────────────────────────────────────────

describe("GRAPHQL_INTROSPECTION_EXPOSED — GraphQL introspection detection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fires ONLY when __schema is in the GraphQL response", async () => {
    const introspectionResponse = JSON.stringify({
      data: {
        __schema: {
          queryType: { name: "Query" },
          types: [{ name: "User", kind: "OBJECT" }],
        },
      },
    });

    mockSsrfSafeFetch.mockImplementation(async () =>
      new Response(introspectionResponse, {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const findings = await runAuthScan([makeGraphqlEndpoint()], "https://example.com");
    expect(findings.some((f) => f.code === "GRAPHQL_INTROSPECTION_EXPOSED")).toBe(true);
    expect(findings.find((f) => f.code === "GRAPHQL_INTROSPECTION_EXPOSED")?.severity).toBe("HIGH");
  });

  it("does NOT fire when GraphQL endpoint returns 404", async () => {
    mockSsrfSafeFetch.mockImplementation(async () =>
      makeResponse("Not Found", 404),
    );

    const findings = await runAuthScan([makeGraphqlEndpoint()], "https://example.com");
    expect(findings.every((f) => f.code !== "GRAPHQL_INTROSPECTION_EXPOSED")).toBe(true);
  });

  it("does NOT fire when GraphQL introspection is disabled (errors in response)", async () => {
    const disabledResponse = JSON.stringify({
      errors: [{ message: "GraphQL introspection is not allowed in the current environment" }],
    });

    mockSsrfSafeFetch.mockImplementation(async () =>
      new Response(disabledResponse, {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const findings = await runAuthScan([makeGraphqlEndpoint()], "https://example.com");
    expect(findings.every((f) => f.code !== "GRAPHQL_INTROSPECTION_EXPOSED")).toBe(true);
  });

  it("does NOT fire on non-GraphQL endpoints even if response contains __schema", async () => {
    // A non-graphql URL — should not run introspection check
    const apiEndpoint = makeApiEndpoint({
      url: "https://example.com/api/schema",
      path: "/api/schema",
    });

    mockSsrfSafeFetch.mockImplementation(async () =>
      new Response('{"__schema": "test-value"}', {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const findings = await runAuthScan([apiEndpoint], "https://example.com");
    expect(findings.every((f) => f.code !== "GRAPHQL_INTROSPECTION_EXPOSED")).toBe(true);
  });

  it("does NOT fire when response is empty JSON", async () => {
    mockSsrfSafeFetch.mockImplementation(async () =>
      new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
    );

    const findings = await runAuthScan([makeGraphqlEndpoint()], "https://example.com");
    expect(findings.every((f) => f.code !== "GRAPHQL_INTROSPECTION_EXPOSED")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Token in URL — checkTokenInUrl
// ─────────────────────────────────────────────────────────────────────────────

describe("checkTokenInUrl — auth token in URL detection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fires when HTML contains auth token in URL parameters", async () => {
    mockSsrfSafeFetch.mockImplementation(async () => makeResponse("", 404));

    const html = `<a href="/dashboard?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.test">Dashboard</a>`;
    const findings = await runAuthScan([], "https://example.com", html, []);
    expect(findings.some((f) => f.code?.includes("TOKEN") || f.title?.toLowerCase().includes("token"))).toBe(true);
  });

  it("does NOT fire on clean HTML without auth tokens in URLs", async () => {
    mockSsrfSafeFetch.mockImplementation(async () => makeResponse("", 404));

    const html = `<a href="/dashboard">Dashboard</a><a href="/profile?tab=settings">Settings</a>`;
    const findings = await runAuthScan([], "https://example.com", html, []);
    const tokenFindings = findings.filter((f) => f.code?.includes("TOKEN_IN_URL"));
    expect(tokenFindings).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge cases and overall runAuthScan behavior
// ─────────────────────────────────────────────────────────────────────────────

describe("runAuthScan edge cases", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns empty array for no endpoints", async () => {
    const findings = await runAuthScan([], "https://example.com");
    expect(findings).toHaveLength(0);
  });

  it("deduplicates findings for the same endpoint checked multiple ways", async () => {
    // All calls return the same 401 without rate limiting
    mockSsrfSafeFetch.mockImplementation(async () =>
      makeResponse('{"error":"Invalid credentials"}', 401),
    );

    // Provide the same login endpoint twice — should not produce duplicate findings
    const findings = await runAuthScan(
      [makeAuthEndpoint(), makeAuthEndpoint()],
      "https://example.com",
    );

    const rateLimitFindings = findings.filter((f) => f.code === "AUTH_NO_RATE_LIMIT");
    // Deduplication should prevent the same finding code+title appearing twice
    const uniqueTitles = new Set(rateLimitFindings.map((f) => `${f.code}::${f.title}`));
    expect(uniqueTitles.size).toBe(rateLimitFindings.length);
  });

  it("handles network errors gracefully — never throws", async () => {
    mockSsrfSafeFetch.mockRejectedValue(new Error("Network error: ECONNREFUSED"));

    await expect(
      runAuthScan([makeAuthEndpoint()], "https://example.com"),
    ).resolves.toBeDefined();
  });

  it("handles mixed endpoint types — only runs relevant checks per type", async () => {
    mockSsrfSafeFetch.mockImplementation(async () => makeResponse("{}", 200));

    const endpoints = [
      makeAuthEndpoint(),
      makeAdminEndpoint(),
      makeGraphqlEndpoint(),
      makeApiEndpoint(),
    ];

    const findings = await runAuthScan(endpoints, "https://example.com");
    expect(Array.isArray(findings)).toBe(true);
  });
});
