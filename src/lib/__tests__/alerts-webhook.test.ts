import { beforeEach, describe, expect, it, vi } from "vitest";

const alertConfigFindUnique = vi.fn();
const notificationCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    alertConfig: { findUnique: alertConfigFindUnique },
    notification: { create: notificationCreate },
  },
}));

vi.mock("@/lib/tenant", () => ({
  getOrgLimits: vi.fn().mockResolvedValue({ tier: "ENTERPRISE", status: "ACTIVE" }),
}));

vi.mock("@/lib/teams-notify", () => ({ sendTeamsNotification: vi.fn() }));
vi.mock("@/lib/pagerduty-notify", () => ({ createPagerDutyIncident: vi.fn() }));
vi.mock("@/lib/webhook-signature", () => ({ signWebhookPayload: vi.fn().mockReturnValue("sig") }));

const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WEBHOOK_MASTER_SECRET = "test-secret";
  alertConfigFindUnique.mockResolvedValue({
    id: "cfg-1",
    orgId: "org-1",
    channel: "WEBHOOK",
    destination: "https://webhook.example.com/hook",
  });
  notificationCreate.mockResolvedValue({});
});

describe("webhook replay guard", () => {
  it("includes webhookId in payload body", async () => {
    const { sendTestNotification } = await import("@/lib/alerts");
    await sendTestNotification("cfg-1");

    const call = fetchMock.mock.calls.find(([u]) => u === "https://webhook.example.com/hook");
    expect(call).toBeTruthy();
    const body = JSON.parse(call![1].body as string);
    expect(body.webhookId).toBeTruthy();
  });

  it("sends X-Scantient-Webhook-Id header matching payload webhookId", async () => {
    const { sendTestNotification } = await import("@/lib/alerts");
    await sendTestNotification("cfg-1");

    const call = fetchMock.mock.calls.find(([u]) => u === "https://webhook.example.com/hook");
    expect(call).toBeTruthy();
    const headers = call![1].headers as Record<string, string>;
    const body = JSON.parse(call![1].body as string);
    expect(headers["X-Scantient-Webhook-Id"]).toBe(body.webhookId);
  });
});
