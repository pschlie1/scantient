"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { hasFeature } from "@/lib/tier-capabilities";

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

  if (tier === null) return <div className="p-8 text-center text-muted">Loading…</div>;

  const isPro = tier ? hasFeature(tier, "jira") : false;
  if (!isPro) {
    return (
      <div>
        <div className="mb-6 flex items-center gap-3">
          <h2 className="text-xl font-semibold">Jira Integration</h2>
          <span className="rounded-full bg-info/10 px-3 py-0.5 text-xs font-semibold text-info">Pro</span>
        </div>
        <div className="rounded-lg border border-border bg-surface-raised p-8 text-center">
          <h3 className="mb-2 text-lg font-semibold text-heading">Available on Pro &amp; Enterprise</h3>
          <p className="mb-6 text-sm text-body">Connect Scantient to Jira to automatically create tickets from security findings.</p>
          <Link href="/settings/billing" className="inline-block rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-hover transition">Upgrade to Pro</Link>
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
        {config && <span className="rounded-full bg-success/10 px-3 py-0.5 text-xs font-semibold text-success">Connected</span>}
      </div>

      {config && (
        <div className="mb-6 rounded-lg border border-success/20 bg-success/10 p-4 text-sm text-success">
          <strong>Connected to:</strong> {config.url} | <strong>Email:</strong> {config.email} | <strong>Project:</strong> {config.projectKey} | <strong>Type:</strong> {config.issueType}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4 rounded-lg border bg-surface p-6">
        <div>
          <label className="mb-1 block text-xs font-medium text-heading">Jira Domain (e.g. myorg.atlassian.net)</label>
          <input type="text" required placeholder="myorg.atlassian.net" value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:border-primary-hover focus:outline-none focus:ring-1 focus:ring-primary-hover" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-heading">Jira Email</label>
          <input type="email" required placeholder="you@company.com" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:border-primary-hover focus:outline-none focus:ring-1 focus:ring-primary-hover" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-heading">API Token{config ? " (leave blank to keep existing)" : ""}</label>
          <input type="password" required={!config} placeholder={config ? "••••••••" : "Your Jira API token"} value={form.apiToken}
            onChange={(e) => setForm({ ...form, apiToken: e.target.value })}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:border-primary-hover focus:outline-none focus:ring-1 focus:ring-primary-hover" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-heading">Project Key</label>
          <input type="text" required placeholder="ENG" value={form.projectKey}
            onChange={(e) => setForm({ ...form, projectKey: e.target.value })}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:border-primary-hover focus:outline-none focus:ring-1 focus:ring-primary-hover" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-heading">Issue Type</label>
          <select value={form.issueType} onChange={(e) => setForm({ ...form, issueType: e.target.value })}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:border-primary-hover focus:outline-none focus:ring-1 focus:ring-primary-hover">
            <option>Bug</option><option>Task</option><option>Story</option><option>Security</option>
          </select>
        </div>
        {saveError && <p className="text-xs text-error">{saveError}</p>}
        {saveOk && <p className="text-xs text-success">✓ Jira integration saved.</p>}
        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50">
            {saving ? "Saving…" : config ? "Update" : "Save"}
          </button>
          {config && (
            <>
              <button type="button" onClick={handleTest} disabled={testing} className="rounded-lg border border-border px-5 py-2 text-sm font-medium text-heading hover:bg-surface-raised disabled:opacity-50">
                {testing ? "Testing…" : "Test Connection"}
              </button>
              <button type="button" onClick={handleDisconnect} disabled={deleting} className="ml-auto rounded-lg border border-error/30 px-5 py-2 text-sm font-medium text-error hover:bg-error/10 disabled:opacity-50">
                {deleting ? "Disconnecting…" : "Disconnect"}
              </button>
            </>
          )}
        </div>
      </form>
      {testResult && (
        <div className={`mt-4 rounded-lg border p-4 text-sm ${testResult.ok ? "border-success/20 bg-success/10 text-success" : "border-error/20 bg-error/10 text-error"}`}>
          {testResult.ok ? `✓ Connection successful! Signed in as ${testResult.displayName}` : `✗ Connection failed: ${testResult.error}`}
        </div>
      )}
    </div>
  );
}
