"use client";

import { useEffect, useState } from "react";

interface Props { findingId: string; }

export function JiraTicketButton({ findingId }: Props) {
  const [jiraEnabled, setJiraEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [ticketUrl, setTicketUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/integrations/jira")
      .then((r) => { if (!r.ok) { setJiraEnabled(false); return null; } return r.json() as Promise<unknown>; })
      .then((d) => setJiraEnabled(d !== null))
      .catch(() => setJiraEnabled(false));
  }, []);

  if (!jiraEnabled) return null;

  if (ticketUrl) {
    return (
      <a href={ticketUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded text-xs font-medium text-blue-600 hover:underline">
        ✓ Jira ticket ↗
      </a>
    );
  }

  async function createTicket() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/integrations/jira/ticket", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ findingId }) });
      const d = await res.json() as { ticketUrl?: string; error?: string };
      if (res.ok && d.ticketUrl) { setTicketUrl(d.ticketUrl); }
      else { setError(d.error ?? "Failed to create ticket"); }
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="inline-flex flex-col items-end gap-0.5">
      <button onClick={createTicket} disabled={loading} className="rounded border border-blue-300 px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50">
        {loading ? "Creating…" : "Create Jira Ticket"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
