"use client";

import { useEffect, useState } from "react";

interface JiraConfig {
  url: string;
  email: string;
  apiToken: string;
  projectKey: string;
  issueType: string;
}

interface TestResult {
  ok: boolean;
  displayName?: string;
  error?: string;
}

export default function JiraIntegrationPage() {
  const [tier, setTier] = useState<string | null>(null);
  const [config, setConfig] = useState<JiraConfig | null>(null);
  const [form, setForm] = useState<JiraConfig>({ url: "", email: "", apiToken: "", projectKey: "", issueType: "Bug" });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [saveError, setSaveError] = useState("");
  const [saveOk, setSaveOk] = useState(false);

  useEffect(() => {
    fetch("/api/org/limits").then((r) => r.json()).then((d) => setTier(d.tier ?? "FREE")).catch(() => setTier("FREE"));
    fetch("/api/integrations/jira").then((r) => r.json()).then((d) => {
      if (d) { setConfig(d as JiraConfig); setForm({ ...(d as JiraConfig), apiToken: "" }); }
    }).catch(() => {});
  }, []);

  if (tier === null) return <div className="p-8 text-center text-gray-500">Loading…</div>;

  const isPro = tier === "PRO" || tier === "ENTERPRISE";
  if (!isPro) {
    return (
      <div>
        <div className="mb-6 flex items-center gap-3">
          <h2 className="text-xl font-semibold">Jira Integration</h2>
          <span className="rounded-full bg-blue-100 px-3 py-0.5 text-xs font-semibold text-blue-700">Pro</span>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
          <h3 className="mb-2 text-lg font-semibold text-gray-900">Available on Pro &amp; Enterprise</h3>
          <p className="mb-6 text-sm text-gray-600">Connect VibeSafe to Jira to automatically create tickets from security findings.</p>
          <a href="/settings/billing" className="inline-block rounded-lg bg-black px-6 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition">Upgrade to Pro</a>
        </div>
      </div>
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setSaveError(""); setSaveOk(false);
    try {
      const res = await fetch("/api/integrations/jira", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      if (res.ok) { setSaveOk(true); setConfig({ ...form, apiToken: "••••••••" }); }
      else { const d = await res.json() as { error?: string }; setSaveError(d.error ?? "Save failed"); }
    } catch { setSaveError("Network error"); }
    finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch("/api/integrations/jira/test", { method: "POST" });
      setTestResult(await res.json() as TestResult);
    } catch { setTestResult({ ok: false, error: "Network error" }); }
    finally { setTesting(false); }
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect Jira integration?")) return;
    setDeleting(true);
    try {
      await fetch("/api/integrations/jira", { method: "DELETE" });
      setConfig(null); setForm({ url: "", email: "", apiToken: "", projectKey: "", issueType: "Bug" }); setTestResult(null);
    } catch { /* ignore */ }
    finally { setDeleting(false); }
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <h2 className="text-xl font-semibold">Jira Integration</h2>
        {config && <span className="rounded-full bg-green-100 px-3 py-0.5 text-xs font-semibold text-green-700">Connected</span>}
      </div>

      {config && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <strong>Connected to:</strong> {config.url} | <strong>Email:</strong> {config.email} | <strong>Project:</strong> {config.projectKey} | <strong>Type:</strong> {config.issueType}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4 rounded-lg border bg-white p-6">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Jira Domain (e.g. myorg.atlassian.net)</label>
          <input type="text" required placeholder="myorg.atlassian.net" value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Jira Email</label>
          <input type="email" required placeholder="you@company.com" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">API Token{config ? " (leave blank to keep existing)" : ""}</label>
          <input type="password" required={!config} placeholder={config ? "••••••••" : "Your Jira API token"} value={form.apiToken}
            onChange={(e) => setForm({ ...form, apiToken: e.target.value })}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Project Key</label>
          <input type="text" required placeholder="ENG" value={form.projectKey}
            onChange={(e) => setForm({ ...form, projectKey: e.target.value })}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Issue Type</label>
          <select value={form.issueType} onChange={(e) => setForm({ ...form, issueType: e.target.value })}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black">
            <option>Bug</option><option>Task</option><option>Story</option><option>Security</option>
          </select>
        </div>
        {saveError && <p className="text-xs text-red-600">{saveError}</p>}
        {saveOk && <p className="text-xs text-green-600">✓ Jira integration saved.</p>}
        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={saving} className="rounded-lg bg-black px-5 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
            {saving ? "Saving…" : config ? "Update" : "Save"}
          </button>
          {config && (
            <>
              <button type="button" onClick={handleTest} disabled={testing} className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                {testing ? "Testing…" : "Test Connection"}
              </button>
              <button type="button" onClick={handleDisconnect} disabled={deleting} className="ml-auto rounded-lg border border-red-300 px-5 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
                {deleting ? "Disconnecting…" : "Disconnect"}
              </button>
            </>
          )}
        </div>
      </form>
      {testResult && (
        <div className={`mt-4 rounded-lg border p-4 text-sm ${testResult.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}>
          {testResult.ok ? `✓ Connection successful! Signed in as ${testResult.displayName}` : `✗ Connection failed: ${testResult.error}`}
        </div>
      )}
    </div>
  );
}
