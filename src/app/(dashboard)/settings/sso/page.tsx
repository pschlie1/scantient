"use client";

import { useEffect, useState } from "react";

type UiProvider = "okta" | "azure" | "google" | "custom";

interface SSOFormData {
  uiProvider: UiProvider;
  clientId: string;
  clientSecret: string;
  tenantId: string;
  domain: string;
  discoveryUrl: string;
  enabled: boolean;
}

interface SSOConfig {
  id: string;
  provider: string;
  clientId: string | null;
  clientSecret: string | null;
  tenantId: string | null;
  domain: string;
  discoveryUrl: string | null;
  enabled: boolean;
}

export default function SSOPage() {
  const [tier, setTier] = useState<string | null>(null);
  const [config, setConfig] = useState<SSOConfig | null>(null);
  const [form, setForm] = useState<SSOFormData>({
    uiProvider: "custom", clientId: "", clientSecret: "", tenantId: "", domain: "", discoveryUrl: "", enabled: true,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveOk, setSaveOk] = useState(false);

  useEffect(() => {
    fetch("/api/org/limits").then((r) => r.json()).then((d) => setTier((d as { tier?: string }).tier ?? "FREE")).catch(() => setTier("FREE"));
    fetch("/api/integrations/sso").then((r) => r.json()).then((d) => {
      if (d) {
        const cfg = d as SSOConfig;
        setConfig(cfg);
        setForm((f) => ({ ...f, clientId: cfg.clientId ?? "", tenantId: cfg.tenantId ?? "", domain: cfg.domain ?? "", discoveryUrl: cfg.discoveryUrl ?? "", enabled: cfg.enabled }));
      }
    }).catch(() => {});
  }, []);

  if (tier === null) return <div className="p-8 text-center text-gray-500">Loading…</div>;

  const isEnterprise = tier === "ENTERPRISE";
  if (!isEnterprise) {
    return (
      <div>
        <div className="mb-6 flex items-center gap-3">
          <h2 className="text-xl font-semibold">SSO / OIDC Integration</h2>
          <span className="rounded-full bg-purple-100 px-3 py-0.5 text-xs font-semibold text-purple-700">Enterprise</span>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
          <h3 className="mb-2 text-lg font-semibold text-gray-900">SSO is available on the Enterprise plan</h3>
          <p className="mb-6 text-sm text-gray-600">Enable OIDC-based single sign-on with Okta, Azure AD, Google Workspace, or any standards-compliant IdP.</p>
          <a href="/settings/billing" className="inline-block rounded-lg bg-black px-6 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition">Upgrade to Enterprise</a>
        </div>
      </div>
    );
  }

  function getDiscoveryUrl(provider: UiProvider, tenantId: string, domain: string): string {
    if (provider === "okta") return domain ? `https://${domain}.okta.com/.well-known/openid-configuration` : "";
    if (provider === "azure") return tenantId ? `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration` : "";
    if (provider === "google") return "https://accounts.google.com/.well-known/openid-configuration";
    return form.discoveryUrl;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setSaveError(""); setSaveOk(false);
    try {
      const res = await fetch("/api/integrations/sso", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "oidc", clientId: form.clientId, clientSecret: form.clientSecret || undefined, tenantId: form.tenantId || undefined, domain: form.domain, discoveryUrl: form.discoveryUrl || undefined, enabled: form.enabled }),
      });
      if (res.ok) { setSaveOk(true); }
      else { const d = await res.json() as { error?: string }; setSaveError(d.error ?? "Save failed"); }
    } catch { setSaveError("Network error"); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirm("Remove SSO configuration?")) return;
    setDeleting(true);
    try { await fetch("/api/integrations/sso", { method: "DELETE" }); setConfig(null); }
    catch { /* ignore */ } finally { setDeleting(false); }
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <h2 className="text-xl font-semibold">SSO / OIDC Integration</h2>
        <span className="rounded-full bg-purple-100 px-3 py-0.5 text-xs font-semibold text-purple-700">Enterprise</span>
        {config?.enabled && <span className="rounded-full bg-green-100 px-3 py-0.5 text-xs font-semibold text-green-700">Active</span>}
      </div>

      <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm">
        <strong className="text-blue-800">Callback URL to register with your IdP:</strong>
        <code className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-900">https://vibesafe-two.vercel.app/api/auth/sso/callback</code>
      </div>

      <form onSubmit={handleSave} className="space-y-4 rounded-lg border bg-white p-6">
        <div>
          <label className="mb-2 block text-xs font-medium text-gray-700">Identity Provider</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["okta", "azure", "google", "custom"] as UiProvider[]).map((p) => (
              <button key={p} type="button"
                onClick={() => setForm((f) => ({ ...f, uiProvider: p, discoveryUrl: getDiscoveryUrl(p, f.tenantId, f.domain) }))}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${form.uiProvider === p ? "border-black bg-black text-white" : "border-gray-200 hover:border-gray-400"}`}>
                {p === "okta" ? "Okta" : p === "azure" ? "Azure AD" : p === "google" ? "Google Workspace" : "Custom OIDC"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Email Domain</label>
          <input type="text" required placeholder="acme.com" value={form.domain}
            onChange={(e) => { const domain = e.target.value; const discoveryUrl = form.uiProvider === "okta" ? (domain ? `https://${domain}.okta.com/.well-known/openid-configuration` : "") : form.discoveryUrl; setForm((f) => ({ ...f, domain, discoveryUrl })); }}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">OIDC Discovery URL</label>
          <input type="url" required placeholder="https://..." value={form.discoveryUrl} onChange={(e) => setForm({ ...form, discoveryUrl: e.target.value })}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Client ID</label>
          <input type="text" required placeholder="your-client-id" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Client Secret{config ? " (leave blank to keep existing)" : ""}</label>
          <input type="password" required={!config} placeholder={config?.clientSecret ? "••••••••" : "your-client-secret"} value={form.clientSecret} onChange={(e) => setForm({ ...form, clientSecret: e.target.value })}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black" />
        </div>
        {(form.uiProvider === "azure" || form.uiProvider === "okta") && (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">{form.uiProvider === "azure" ? "Azure AD Tenant ID" : "Okta Domain"}</label>
            <input type="text" placeholder={form.uiProvider === "azure" ? "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" : "myorg"} value={form.tenantId}
              onChange={(e) => { const tenantId = e.target.value; const discoveryUrl = form.uiProvider === "azure" ? (tenantId ? `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration` : "") : form.discoveryUrl; setForm((f) => ({ ...f, tenantId, discoveryUrl })); }}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black" />
          </div>
        )}
        <div className="flex items-center gap-3">
          <input type="checkbox" id="sso-enabled" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="h-4 w-4 rounded border-gray-300" />
          <label htmlFor="sso-enabled" className="text-sm text-gray-700">Enable SSO</label>
        </div>
        {saveError && <p className="text-xs text-red-600">{saveError}</p>}
        {saveOk && <p className="text-xs text-green-600">✓ SSO configuration saved.</p>}
        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={saving} className="rounded-lg bg-black px-5 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
            {saving ? "Saving…" : config ? "Update" : "Save"}
          </button>
          {config && (
            <button type="button" onClick={handleDelete} disabled={deleting} className="ml-auto rounded-lg border border-red-300 px-5 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
              {deleting ? "Removing…" : "Remove SSO"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
