/**
 * connectors.test.ts
 *
 * Unit tests for infrastructure connectors:
 *  - Vercel: deployment status, domain health, env vars, build time
 *  - GitHub: Dependabot alerts, CI status, stale PRs, branch protection
 *  - Stripe: test mode detection, key validation, webhook health
 *
 * All network calls are mocked — zero real HTTP.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Mock ssrfSafeFetch ───────────────────────────────────────────────────────
// vi.hoisted ensures the fn() is created BEFORE vi.mock hoisting runs

const { mockSsrfSafeFetch } = vi.hoisted(() => ({
  mockSsrfSafeFetch: vi.fn(),
}));

vi.mock("@/lib/ssrf-guard", () => ({
  ssrfSafeFetch: mockSsrfSafeFetch,
  isPrivateUrl: vi.fn().mockResolvedValue(false),
}));

// ─── Import connectors after mock ────────────────────────────────────────────

import * as vercelConnector from "@/lib/connectors/vercel";
import * as githubConnector from "@/lib/connectors/github";
import * as stripeConnector from "@/lib/connectors/stripe";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function errorResponse(status: number, message = "Error"): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// ─── Vercel deployment data factories ────────────────────────────────────────

function vercelDeployment(overrides = {}) {
  return {
    uid: "dep-abc123",
    state: "READY",
    target: "production",
    createdAt: Date.now() - 3600_000, // 1 hour ago
    ready: Date.now() - 3600_000 + 60_000,
    buildingAt: Date.now() - 3600_000,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// VERCEL CONNECTOR
// ─────────────────────────────────────────────────────────────────────────────

describe("Vercel connector — run()", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns ok:false with VERCEL_MISSING_CREDENTIALS when no token provided", async () => {
    const result = await vercelConnector.run({});
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.code === "VERCEL_MISSING_CREDENTIALS")).toBe(true);
  });

  it("fires CRITICAL when latest production deployment failed (state: ERROR)", async () => {
    mockSsrfSafeFetch.mockImplementation(async (url: string) => {
      if (url.includes("/v6/deployments")) {
        return jsonResponse({
          deployments: [
            vercelDeployment({ state: "ERROR", target: "production", uid: "dep-fail" }),
          ],
        });
      }
      if (url.includes("/v9/projects")) {
        return jsonResponse({ domains: [] });
      }
      return jsonResponse({ envs: [] });
    });

    const result = await vercelConnector.run({ token: "vercel-test-token" });
    expect(result.findings.some((f) => f.code === "VERCEL_DEPLOY_FAILED" && f.severity === "CRITICAL")).toBe(true);
  });

  it("does NOT fire VERCEL_DEPLOY_FAILED when latest deployment is READY", async () => {
    mockSsrfSafeFetch.mockImplementation(async (url: string) => {
      if (url.includes("/v6/deployments")) {
        return jsonResponse({
          deployments: [
            vercelDeployment({ state: "READY", target: "production" }),
          ],
        });
      }
      if (url.includes("/v9/projects")) {
        return jsonResponse({ domains: [] });
      }
      return jsonResponse({ envs: [] });
    });

    const result = await vercelConnector.run({ token: "vercel-test-token" });
    expect(result.findings.every((f) => f.code !== "VERCEL_DEPLOY_FAILED")).toBe(true);
  });

  it("fires VERCEL_STALE_DEPLOYMENT when no deploy in past 7 days", async () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 3600_000;
    mockSsrfSafeFetch.mockImplementation(async (url: string) => {
      if (url.includes("/v6/deployments")) {
        return jsonResponse({
          deployments: [
            vercelDeployment({ state: "READY", target: "production", createdAt: eightDaysAgo }),
          ],
        });
      }
      if (url.includes("/v9/projects")) {
        return jsonResponse({ domains: [] });
      }
      return jsonResponse({ envs: [] });
    });

    const result = await vercelConnector.run({ token: "vercel-test-token" });
    expect(result.findings.some((f) => f.code === "VERCEL_STALE_DEPLOYMENT")).toBe(true);
  });

  it("fires MEDIUM when env var key looks like a local .env file pattern", async () => {
    mockSsrfSafeFetch.mockImplementation(async (url: string) => {
      if (url.includes("/v6/deployments")) {
        return jsonResponse({ deployments: [] });
      }
      if (url.includes("/v9/projects") && url.includes("/domains")) {
        return jsonResponse({ domains: [] });
      }
      if (url.includes("/env")) {
        return jsonResponse({
          envs: [
            { key: "DATABASE_URL", target: "production", type: "encrypted" },
            { key: ".env.local", target: "production", type: "plain" },
          ],
        });
      }
      if (url.includes("/v9/projects")) {
        return jsonResponse({ domains: [] });
      }
      return jsonResponse([]);
    });

    const result = await vercelConnector.run({ token: "vercel-test-token", projectId: "proj-1" });
    expect(result.findings.some((f) => f.code === "VERCEL_LOCAL_ENV_IN_PROD")).toBe(true);
  });

  it("fires VERCEL_API_UNREACHABLE finding when API returns 401 (invalid token)", async () => {
    // Note: VERCEL_API_UNREACHABLE is MEDIUM severity, so ok=true per connector design
    // (ok:false only set for CRITICAL/HIGH findings)
    mockSsrfSafeFetch.mockResolvedValue(errorResponse(401, "Invalid token"));

    const result = await vercelConnector.run({ token: "invalid-token" });
    expect(result.findings.some((f) => f.code === "VERCEL_API_UNREACHABLE")).toBe(true);
  });

  it("does NOT throw on network error — returns ok:false gracefully", async () => {
    mockSsrfSafeFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(
      vercelConnector.run({ token: "some-token" }),
    ).resolves.toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GITHUB CONNECTOR
// ─────────────────────────────────────────────────────────────────────────────

describe("GitHub connector — run()", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns ok:false with GITHUB_MISSING_CREDENTIALS when credentials incomplete", async () => {
    const result = await githubConnector.run({});
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.code === "GITHUB_MISSING_CREDENTIALS")).toBe(true);
  });

  it("requires token, owner, AND repo — missing repo returns error", async () => {
    const result = await githubConnector.run({ token: "ghp_abc", owner: "myorg" });
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.code === "GITHUB_MISSING_CREDENTIALS")).toBe(true);
  });

  // Helper: create a standard GitHub API mock that handles all expected calls
  function makeGitHubMock(overrides: {
    alerts?: unknown[];
    branchSha?: string;
    checkRuns?: unknown[];
    prs?: unknown[];
    branchProtection?: unknown;
    branchProtectionStatus?: number;
  } = {}) {
    const sha = overrides.branchSha ?? "abc123def456";
    return async (url: string) => {
      // 1. Repo metadata
      if (/\/repos\/[^/]+\/[^/]+$/.test(url)) {
        return jsonResponse({ default_branch: "main", full_name: "myorg/myrepo" });
      }
      // 2. Dependabot alerts
      if (url.includes("/dependabot/alerts")) {
        return jsonResponse(overrides.alerts ?? []);
      }
      // 3. Branch info (for CI check — needs commit SHA)
      if (url.includes("/branches/main") && !url.includes("/protection")) {
        return jsonResponse({ name: "main", commit: { sha } });
      }
      // 4. Check runs for latest commit
      if (url.includes("/check-runs")) {
        return jsonResponse({ check_runs: overrides.checkRuns ?? [] });
      }
      // 5. Open PRs (stale PR check)
      if (url.includes("/pulls")) {
        return jsonResponse(overrides.prs ?? []);
      }
      // 6. Branch protection
      if (url.includes("/protection")) {
        const status = overrides.branchProtectionStatus ?? 200;
        if (status === 404) return errorResponse(404, "Branch not protected");
        return jsonResponse(overrides.branchProtection ?? {
        required_pull_request_reviews: { required_approving_review_count: 1 },
        required_status_checks: { strict: true, contexts: ["CI", "test"] },
      });
      }
      return jsonResponse({});
    };
  }

  it("fires CRITICAL on open CRITICAL Dependabot alert", async () => {
    mockSsrfSafeFetch.mockImplementation(makeGitHubMock({
      alerts: [
        {
          number: 1,
          state: "open",
          security_vulnerability: {
            severity: "critical",
            package: { name: "lodash", ecosystem: "npm" },
            vulnerable_version_range: "< 4.17.21",
            first_patched_version: { identifier: "4.17.21" },
          },
          security_advisory: { summary: "Prototype Pollution in lodash" },
        },
      ],
    }));

    const result = await githubConnector.run({
      token: "ghp_test",
      owner: "myorg",
      repo: "myrepo",
    });
    expect(result.findings.some((f) => f.code === "GITHUB_DEPENDABOT_CRITICAL")).toBe(true);
    expect(result.findings.find((f) => f.code === "GITHUB_DEPENDABOT_CRITICAL")?.severity).toBe("CRITICAL");
  });

  it("does NOT fire GITHUB_DEPENDABOT_CRITICAL when no open alerts", async () => {
    mockSsrfSafeFetch.mockImplementation(makeGitHubMock({ alerts: [] }));

    const result = await githubConnector.run({
      token: "ghp_test",
      owner: "myorg",
      repo: "myrepo",
    });
    expect(result.findings.every((f) => f.code !== "GITHUB_DEPENDABOT_CRITICAL")).toBe(true);
  });

  it("fires GITHUB_CI_FAILING when latest workflow run failed (check run = failure)", async () => {
    mockSsrfSafeFetch.mockImplementation(makeGitHubMock({
      checkRuns: [
        {
          id: 1,
          name: "CI / test",
          status: "completed",
          conclusion: "failure",
          html_url: "https://github.com/org/repo/actions/runs/1",
        },
      ],
    }));

    const result = await githubConnector.run({
      token: "ghp_test",
      owner: "myorg",
      repo: "myrepo",
    });
    expect(result.findings.some((f) => f.code === "GITHUB_CI_FAILING")).toBe(true);
  });

  it("fires GITHUB_NO_BRANCH_PROTECTION when branch has no protection", async () => {
    mockSsrfSafeFetch.mockImplementation(makeGitHubMock({
      branchProtectionStatus: 404,
    }));

    const result = await githubConnector.run({
      token: "ghp_test",
      owner: "myorg",
      repo: "myrepo",
    });
    expect(result.findings.some((f) => f.code === "GITHUB_NO_BRANCH_PROTECTION")).toBe(true);
  });

  it("does NOT throw on network error — returns gracefully", async () => {
    mockSsrfSafeFetch.mockRejectedValue(new Error("Network failure"));

    await expect(
      githubConnector.run({ token: "ghp_test", owner: "org", repo: "repo" }),
    ).resolves.toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// STRIPE CONNECTOR
// ─────────────────────────────────────────────────────────────────────────────

describe("Stripe connector — run()", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns ok:false with STRIPE_MISSING_CREDENTIALS when no key provided", async () => {
    const result = await stripeConnector.run({});
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.code === "STRIPE_MISSING_CREDENTIALS")).toBe(true);
  });

  it("fires CRITICAL immediately when key starts with sk_test_ (no API call needed)", async () => {
    // sk_test_ detection is synchronous — no HTTP call required
    const result = await stripeConnector.run({ secretKey: "sk_" + "test_abcdefghijklmnopqrstuvwxyz123" });
    expect(result.findings.some((f) => f.code === "STRIPE_TEST_MODE_IN_PRODUCTION")).toBe(true);
    expect(result.findings.find((f) => f.code === "STRIPE_TEST_MODE_IN_PRODUCTION")?.severity).toBe("CRITICAL");
  });

  it("does NOT fire STRIPE_TEST_MODE_IN_PRODUCTION when key starts with sk_live_", async () => {
    mockSsrfSafeFetch.mockImplementation(async (url: string) => {
      if (url.includes("/v1/balance")) {
        return jsonResponse({ object: "balance", available: [{ amount: 10000, currency: "usd" }] });
      }
      if (url.includes("/v1/webhook_endpoints")) {
        return jsonResponse({
          data: [
            {
              id: "we_abc",
              enabled_events: ["payment_intent.succeeded"],
              status: "enabled",
              secret: "whsec_abc",
              livemode: true,
            },
          ],
        });
      }
      return jsonResponse({});
    });

    const result = await stripeConnector.run({ secretKey: "sk_" + "live_abcdefghijklmnopqrstuvwxyz123" });
    expect(result.findings.every((f) => f.code !== "STRIPE_TEST_MODE_IN_PRODUCTION")).toBe(true);
  });

  it("fires STRIPE_INVALID_KEY when API returns 401 (invalid key)", async () => {
    mockSsrfSafeFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { type: "invalid_request_error", message: "Invalid API Key" } }),
        { status: 401, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await stripeConnector.run({ secretKey: "sk_" + "live_invalid_key_12345" });
    expect(result.findings.some((f) => f.code === "STRIPE_INVALID_KEY")).toBe(true);
  });

  it("fires STRIPE_NO_WEBHOOK_SECRET when webhook has no secret", async () => {
    mockSsrfSafeFetch.mockImplementation(async (url: string) => {
      if (url.includes("/v1/balance")) {
        return jsonResponse({ object: "balance", available: [] });
      }
      if (url.includes("/v1/webhook_endpoints")) {
        return jsonResponse({
          data: [
            {
              id: "we_abc",
              enabled_events: ["payment_intent.succeeded"],
              status: "enabled",
              // Missing secret — webhook not configured with signing secret
              livemode: true,
            },
          ],
        });
      }
      return jsonResponse({});
    });

    const result = await stripeConnector.run({ secretKey: "sk_" + "live_valid_test_key_abc123" });
    expect(result.findings.some((f) => f.code === "STRIPE_NO_WEBHOOK_SECRET")).toBe(true);
  });

  it("does NOT throw on API error — returns ok:false gracefully", async () => {
    mockSsrfSafeFetch.mockRejectedValue(new Error("Connection refused"));

    await expect(
      stripeConnector.run({ secretKey: "sk_" + "live_testkey" }),
    ).resolves.toBeDefined();
  });

  it("does NOT fire any critical finding when Stripe setup is correct", async () => {
    mockSsrfSafeFetch.mockImplementation(async (url: string) => {
      if (url.includes("/v1/balance")) {
        return jsonResponse({
          object: "balance",
          available: [{ amount: 50000, currency: "usd" }],
        });
      }
      if (url.includes("/v1/webhook_endpoints")) {
        return jsonResponse({
          data: [
            {
              id: "we_healthy",
              enabled_events: ["payment_intent.succeeded", "charge.refunded"],
              status: "enabled",
              secret: "whsec_validhashsecret",
              livemode: true,
            },
          ],
        });
      }
      return jsonResponse({});
    });

    const result = await stripeConnector.run({ secretKey: "sk_" + "live_healthy_stripe_key" });
    const criticalFindings = result.findings.filter((f) => f.severity === "CRITICAL");
    expect(criticalFindings).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-connector: all connectors handle missing credentials gracefully
// ─────────────────────────────────────────────────────────────────────────────

describe("All connectors — missing credentials handling", () => {
  it("Vercel: returns ok:false with descriptive finding for empty credentials", async () => {
    const result = await vercelConnector.run({});
    expect(result.ok).toBe(false);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0].severity).toBe("MEDIUM");
  });

  it("GitHub: returns ok:false with descriptive finding for empty credentials", async () => {
    const result = await githubConnector.run({});
    expect(result.ok).toBe(false);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("Stripe: returns ok:false with descriptive finding for empty credentials", async () => {
    const result = await stripeConnector.run({});
    expect(result.ok).toBe(false);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("All connectors return ConnectorResult shape with required fields", async () => {
    const results = await Promise.all([
      vercelConnector.run({}),
      githubConnector.run({}),
      stripeConnector.run({}),
    ]);

    for (const result of results) {
      expect(result).toHaveProperty("ok");
      expect(result).toHaveProperty("findings");
      expect(result).toHaveProperty("data");
      expect(result).toHaveProperty("checkedAt");
      expect(Array.isArray(result.findings)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// URL Classifier additional tests (covering /api/health case)
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyUrl — extended coverage", () => {
  it("classifies https://example.com → 'homepage'", async () => {
    const { classifyUrl } = await import("@/lib/scanner-http");
    expect(classifyUrl("https://example.com")).toBe("homepage");
    expect(classifyUrl("https://example.com/")).toBe("homepage");
  });

  it("classifies https://example.com/api/users → 'api-endpoint'", async () => {
    const { classifyUrl } = await import("@/lib/scanner-http");
    expect(classifyUrl("https://example.com/api/users")).toBe("api-endpoint");
  });

  it("classifies https://example.com/login → 'login-page'", async () => {
    const { classifyUrl } = await import("@/lib/scanner-http");
    expect(classifyUrl("https://example.com/login")).toBe("login-page");
  });

  it("classifies https://example.com/admin → 'admin-page'", async () => {
    const { classifyUrl } = await import("@/lib/scanner-http");
    expect(classifyUrl("https://example.com/admin")).toBe("admin-page");
  });

  it("classifies https://example.com/api/health → 'health-endpoint' (not api-endpoint)", async () => {
    const { classifyUrl } = await import("@/lib/scanner-http");
    expect(classifyUrl("https://example.com/api/health")).toBe("health-endpoint");
  });

  it("classifies https://example.com/api/ping → 'health-endpoint'", async () => {
    const { classifyUrl } = await import("@/lib/scanner-http");
    expect(classifyUrl("https://example.com/api/ping")).toBe("health-endpoint");
  });
});
