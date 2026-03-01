/**
 * jira-url-construction.test.ts
 *
 * Tests that Jira API URLs are constructed correctly — no double-protocol (CB-3).
 * The stored URL already includes the protocol (https://myorg.atlassian.net).
 * Routes must NOT prepend another https://.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const requireRole = vi.fn();
vi.mock("@/lib/auth", () => ({ requireRole, getSession: vi.fn() }));

const integrationConfigFindUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    integrationConfig: {
      findUnique: integrationConfigFindUnique,
    },
    integration: { findUnique: vi.fn() },
    finding: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

// deobfuscate must return the original value (simulating no-op in tests)
vi.mock("@/lib/crypto-util", () => ({
  obfuscate: (v: string) => v,
  deobfuscate: (v: string) => v,
}));

// Track fetch calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSession() {
  return { id: "user-1", orgId: "org-1", role: "OWNER" };
}

function makeJiraConfig(url = "https://myorg.atlassian.net") {
  return {
    id: "int-1",
    orgId: "org-1",
    type: "jira",
    config: {
      url,
      projectKey: "SEC",
      email: "user@example.com",
      apiToken: "jira-token-123",
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function postReq() {
  return new Request("http://localhost/api/integrations/jira/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  requireRole.mockResolvedValue(makeSession());
  integrationConfigFindUnique.mockResolvedValue(makeJiraConfig());
  mockFetch.mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({ displayName: "Test User" }),
    text: vi.fn().mockResolvedValue(""),
    status: 200,
  });
});

describe("Jira test route — URL construction (CB-3)", () => {
  it("calls Jira /rest/api/3/myself without double-protocol", async () => {
    const { POST } = await import("@/app/api/integrations/jira/test/route");
    await POST(postReq());

    expect(mockFetch).toHaveBeenCalled();
    const calledUrl = mockFetch.mock.calls[0][0] as string;

    // Must NOT have double protocol
    expect(calledUrl).not.toContain("https://https://");
    expect(calledUrl).not.toContain("http://https://");
    // Must reach the correct host and path
    expect(calledUrl).toContain("myorg.atlassian.net");
    expect(calledUrl).toContain("/rest/api/3/myself");
  });

  it("URL contains https:// exactly once", async () => {
    const { POST } = await import("@/app/api/integrations/jira/test/route");
    await POST(postReq());

    expect(mockFetch).toHaveBeenCalled();
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    const httpsCount = (calledUrl.match(/https:\/\//g) || []).length;
    expect(httpsCount).toBe(1);
  });

  it("strips trailing slash from stored URL to avoid double-slash paths", async () => {
    integrationConfigFindUnique.mockResolvedValue(
      makeJiraConfig("https://myorg.atlassian.net/"),
    );

    const { POST } = await import("@/app/api/integrations/jira/test/route");
    await POST(postReq());

    expect(mockFetch).toHaveBeenCalled();
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    // Should not have //rest (double slash from trailing-slash URL + path)
    expect(calledUrl).not.toContain("//rest");
    expect(calledUrl).toContain("/rest/api/3/myself");
  });

  it("returns ok:true when Jira responds 200", async () => {
    const { POST } = await import("@/app/api/integrations/jira/test/route");
    const res = await POST(postReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("returns 404 when Jira integration not configured", async () => {
    integrationConfigFindUnique.mockResolvedValue(null);
    const { POST } = await import("@/app/api/integrations/jira/test/route");
    const res = await POST(postReq());
    expect(res.status).toBe(404);
  });
});
