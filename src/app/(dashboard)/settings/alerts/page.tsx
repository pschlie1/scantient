"use client";

import { useEffect, useState } from "react";

type AlertConfig = {
  id: string;
  channel: string;
  destination: string;
  minSeverity: string;
  enabled: boolean;
};

export default function AlertsPage() {
  const [configs, setConfigs] = useState<AlertConfig[]>([]);
  const [form, setForm] = useState({ channel: "EMAIL", destination: "", minSeverity: "HIGH" });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/alerts").then((r) => r.json()).then((d) => setConfigs(d.configs ?? []));
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // Teams is stored as WEBHOOK (detected by URL pattern in alerts.ts)
      const payload = { ...form, channel: form.channel === "TEAMS" ? "WEBHOOK" : form.channel };
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const d = await res.json();
        setConfigs((prev) => [...prev, d.config]);
        setForm({ channel: "EMAIL", destination: "", minSeverity: "HIGH" });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(id: string, enabled: boolean) {
    await fetch(`/api/alerts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !enabled }),
    });
    setConfigs((prev) => prev.map((c) => (c.id === id ? { ...c, enabled: !enabled } : c)));
  }

  async function handleTest(id: string) {
    setTesting(id);
    try {
      const res = await fetch("/api/alerts/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configId: id }),
      });
      if (res.ok) {
        alert("Test notification sent!");
      } else {
        const d = await res.json();
        alert(`Failed: ${d.error ?? "Unknown error"}`);
      }
    } catch {
      alert("Failed to send test notification");
    } finally {
      setTesting(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this alert channel?")) return;
    await fetch(`/api/alerts/${id}`, { method: "DELETE" });
    setConfigs((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">Alert channels</h2>
        {configs.length === 0 ? (
          <p className="text-sm text-gray-500">No alert channels configured. Add one below.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="pb-2">Channel</th>
                <th className="pb-2">Destination</th>
                <th className="pb-2">Min severity</th>
                <th className="pb-2">Status</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {configs.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 font-medium">{c.channel}</td>
                  <td className="py-2 text-gray-600 truncate max-w-[200px]">{c.destination}</td>
                  <td className="py-2 text-xs">{c.minSeverity}</td>
                  <td className="py-2">
                    <button
                      onClick={() => handleToggle(c.id, c.enabled)}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.enabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}
                    >
                      {c.enabled ? "Active" : "Paused"}
                    </button>
                  </td>
                  <td className="py-2 space-x-2">
                    <button
                      onClick={() => handleTest(c.id)}
                      disabled={testing === c.id}
                      className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                    >
                      {testing === c.id ? "Sending…" : "Test"}
                    </button>
                    <button onClick={() => handleDelete(c.id)} className="text-xs text-red-500 hover:underline">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-lg border bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">Add alert channel</h2>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-3">
          <select
            className="rounded-lg border px-3 py-2 text-sm"
            value={form.channel}
            onChange={(e) => setForm({ ...form, channel: e.target.value })}
          >
            <option value="EMAIL">Email</option>
            <option value="SLACK">Slack webhook</option>
            <option value="TEAMS">Microsoft Teams</option>
            <option value="WEBHOOK">Custom webhook</option>
          </select>
          <input
            required
            placeholder={form.channel === "EMAIL" ? "alerts@company.com" : form.channel === "TEAMS" ? "https://outlook.webhook.office.com/..." : "https://hooks.slack.com/..."}
            className="flex-1 rounded-lg border px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
            value={form.destination}
            onChange={(e) => setForm({ ...form, destination: e.target.value })}
          />
          <select
            className="rounded-lg border px-3 py-2 text-sm"
            value={form.minSeverity}
            onChange={(e) => setForm({ ...form, minSeverity: e.target.value })}
          >
            <option value="CRITICAL">Critical only</option>
            <option value="HIGH">High+</option>
            <option value="MEDIUM">Medium+</option>
            <option value="LOW">All</option>
          </select>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {saving ? "Adding…" : "Add channel"}
          </button>
        </form>
      </div>
    </div>
  );
}
