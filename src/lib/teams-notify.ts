/**
 * Microsoft Teams notification via Adaptive Cards.
 * Sends rich notifications to Teams channels via incoming webhook URLs.
 */

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#dc2626", // red
  high: "#f97316",     // orange
  medium: "#eab308",   // yellow
  info: "#3b82f6",     // blue
};

export async function sendTeamsNotification(
  webhookUrl: string,
  payload: {
    title: string;
    text: string;
    severity?: "critical" | "high" | "medium" | "info";
    appName?: string;
    appUrl?: string;
    dashboardUrl?: string;
  },
): Promise<boolean> {
  const color = SEVERITY_COLORS[payload.severity ?? "info"];

  const facts: { title: string; value: string }[] = [];
  if (payload.appName) facts.push({ title: "App", value: payload.appName });
  if (payload.appUrl) facts.push({ title: "URL", value: payload.appUrl });
  if (payload.severity) facts.push({ title: "Severity", value: payload.severity.toUpperCase() });

  const bodyItems: unknown[] = [
    {
      type: "TextBlock",
      size: "Medium",
      weight: "Bolder",
      text: payload.title,
      color: payload.severity === "critical" ? "Attention" : payload.severity === "high" ? "Warning" : "Default",
    },
    {
      type: "TextBlock",
      text: payload.text,
      wrap: true,
      color: "Default",
    },
  ];

  if (facts.length > 0) {
    bodyItems.push({
      type: "FactSet",
      facts: facts.map((f) => ({ title: f.title, value: f.value })),
    });
  }

  if (payload.dashboardUrl) {
    bodyItems.push({
      type: "ActionSet",
      actions: [
        {
          type: "Action.OpenUrl",
          title: "View in Dashboard",
          url: payload.dashboardUrl,
          style: "positive",
        },
      ],
    });
  }

  const card = {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          msteams: { width: "Full" },
          body: bodyItems,
          // accent color via container style
          style: color,
        },
      },
    ],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(card),
    });
    return res.ok || res.status === 200;
  } catch {
    return false;
  }
}
