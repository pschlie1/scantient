/**
 * alerts.test.ts
 * Tests for sendCriticalFindingsAlert and retry behavior.
 *
 * NOTE: withRetry is not exported. Its behavior is tested indirectly through
 * sendCriticalFindingsAlert which uses it internally.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SecurityFinding } from "@/lib/types";

// ── DB mocks ──────────────────────────────────────────────────────────────────
const monitoredAppFindUnique = vi.fn();
const alertConfigFindUnique = vi.fn();
const alertConfigFindMany = vi.fn();
const notificationCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    monitoredApp: { findUnique: monitoredAppFindUnique },
    alertConfig: { findUnique: alertConfigFindUnique, findMany: alertConfigFindMany },
    notification: { create: notificationCreate },
  },
}));

// ── Tenant mocks ──────────────────────────────────────────────────────────────
const getOrgLimits = vi.fn();
vi.mock("@/lib/tenant", () => ({ getOrgLimits }));

// ── Use fake timers so withRetry delays don't slow tests ──────────────────────
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  notificationCreate.mockResolvedValue({});
  // Default to ENTERPRISE so existing tests with configs continue to pass
  getOrgLimits.mockResolvedValue({ tier: "ENTERPRISE", status: "ACTIVE" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const HIGH_FINDING: SecurityFinding = {
  code: "MISSING_HSTS",
  title: "Missing HSTS",
  description: "HSTS header not set",
  severity: "HIGH",
  fixPrompt: "Add Strict-Transport-Security header",
};

const LOW_FINDING: SecurityFinding = {
  code: "MISSING_REFERRER",
  title: "Missing Referrer Policy",
  description: "Referrer-Policy header not set",
  severity: "LOW",
  fixPrompt: "Add Referrer-Policy header",
};

const MOCK_APP = {
  id: "app_1",
  name: "Test App",
  url: "https://example.com",
  orgId: "org_a",
  ownerEmail: "owner@example.com",
  org: { id: "org_a", name: "TestOrg" },
};

// ─────────────────────────────────────────────────────────────────────────────
// sendCriticalFindingsAlert — no-op when no findings
// ─────────────────────────────────────────────────────────────────────────────
describe("sendCriticalFindingsAlert", () => {
  it("returns immediately when findings array is empty", async () => {
    const { sendCriticalFindingsAlert } = await import("@/lib/alerts");
    await sendCriticalFindingsAlert("app_1", []);
    expect(monitoredAppFindUnique).not.toHaveBeenCalled();
  });

  it("returns immediately when app not found in DB", async () => {
    monitoredAppFindUnique.mockResolvedValueOnce(null);
    const { sendCriticalFindingsAlert } = await import("@/lib/alerts");
    await sendCriticalFindingsAlert("nonexistent", [HIGH_FINDING]);
    expect(alertConfigFindMany).not.toHaveBeenCalled();
  });

  it("skips gracefully when no alert configs and no HIGH/CRITICAL findings", async () => {
    monitoredAppFindUnique.mockResolvedValueOnce(MOCK_APP);
    alertConfigFindMany.mockResolvedValueOnce([]);

    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const { sendCriticalFindingsAlert } = await import("@/lib/alerts");
    await sendCriticalFindingsAlert("app_1", [LOW_FINDING]);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("falls back to owner email when no alert configs but HIGH findings exist", async () => {
    process.env.RESEND_API_KEY = "test-key-fallback";
    monitoredAppFindUnique.mockResolvedValueOnce(MOCK_APP);
    alertConfigFindMany.mockResolvedValueOnce([]);

    const mockFetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    const { sendCriticalFindingsAlert } = await import("@/lib/alerts");
    const promise = sendCriticalFindingsAlert("app_1", [HIGH_FINDING]);
    await vi.runAllTimersAsync();
    await promise;

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ method: "POST" }),
    );
    // Check it was sent to the owner email
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.to).toContain("owner@example.com");
  });

  it("sends to configured EMAIL alert channel", async () => {
    process.env.RESEND_API_KEY = "test-key-channel";
    monitoredAppFindUnique.mockResolvedValueOnce(MOCK_APP);
    alertConfigFindMany.mockResolvedValueOnce([
      {
        id: "cfg_1",
        channel: "EMAIL",
        destination: "security@example.com",
        minSeverity: "HIGH",
        enabled: true,
        orgId: "org_a",
      },
    ]);

    const mockFetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    const { sendCriticalFindingsAlert } = await import("@/lib/alerts");
    const promise = sendCriticalFindingsAlert("app_1", [HIGH_FINDING]);
    await vi.runAllTimersAsync();
    await promise;

    expect(mockFetch).toHaveBeenCalled();
    expect(notificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ delivered: true }) }),
    );
  });

  it("skips findings below configured minSeverity threshold", async () => {
    process.env.RESEND_API_KEY = "test-key-threshold";
    monitoredAppFindUnique.mockResolvedValueOnce(MOCK_APP);
    alertConfigFindMany.mockResolvedValueOnce([
      {
        id: "cfg_2",
        channel: "EMAIL",
        destination: "security@example.com",
        minSeverity: "CRITICAL", // only CRITICAL triggers
        enabled: true,
        orgId: "org_a",
      },
    ]);

    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const { sendCriticalFindingsAlert } = await import("@/lib/alerts");
    const promise = sendCriticalFindingsAlert("app_1", [HIGH_FINDING]); // HIGH < CRITICAL threshold
    await vi.runAllTimersAsync();
    await promise;

    // No email should be sent since HIGH doesn't meet CRITICAL threshold
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ── Retry behavior (tested indirectly) ─────────────────────────────────────

  it("withRetry: retries on failure and succeeds on third attempt", async () => {
    process.env.RESEND_API_KEY = "test-key-retry";
    monitoredAppFindUnique.mockResolvedValueOnce(MOCK_APP);
    alertConfigFindMany.mockResolvedValueOnce([]);

    // fetch fails twice then succeeds
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network error 1"))
      .mockRejectedValueOnce(new Error("Network error 2"))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    const { sendCriticalFindingsAlert } = await import("@/lib/alerts");
    const promise = sendCriticalFindingsAlert("app_1", [HIGH_FINDING]);
    await vi.runAllTimersAsync();
    await promise;

    // Should have been called 3 times (2 failures + 1 success)
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("withRetry: gives up after maxAttempts and records delivery failure", async () => {
    process.env.RESEND_API_KEY = "test-key-exhaust";
    monitoredAppFindUnique.mockResolvedValueOnce(MOCK_APP);
    alertConfigFindMany.mockResolvedValueOnce([
      {
        id: "cfg_3",
        channel: "EMAIL",
        destination: "security@example.com",
        minSeverity: "HIGH",
        enabled: true,
        orgId: "org_a",
      },
    ]);

    // fetch fails every time (3 attempts = maxAttempts for withRetry)
    const mockFetch = vi.fn().mockRejectedValue(new Error("Persistent failure"));
    vi.stubGlobal("fetch", mockFetch);

    const { sendCriticalFindingsAlert } = await import("@/lib/alerts");
    const promise = sendCriticalFindingsAlert("app_1", [HIGH_FINDING]);
    await vi.runAllTimersAsync();
    await promise;

    // Should record delivery failure in notification
    expect(notificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ delivered: false, error: "Persistent failure" }),
      }),
    );
  });
});
