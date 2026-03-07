"use client";

import { useEffect, useState } from "react";

type ConnectorStatus = {
  connector: string;
  configured: boolean;
  updatedAt: string | null;
};

// ─── Connector definitions ────────────────────────────────────────────────────

const CONNECTORS = [
  {
    id: "vercel",
    name: "Vercel",
    description: "Check deployment status, domain health, environment variable audits, and build time trends.",
    fields: [
      { key: "token", label: "API Token", type: "password", required: true, placeholder: "vercel_pat_..." },
      { key: "projectId", label: "Project ID (optional)", type: "text", required: false, placeholder: "prj_..." },
    ],
  },
  {
    id: "github",
    name: "GitHub",
    description: "Check Dependabot alerts, CI status, stale PRs, and branch protection rules.",
    fields: [
      { key: "token", label: "Personal Access Token", type: "password", required: true, placeholder: "ghp_..." },
      { key: "owner", label: "Repository Owner", type: "text", required: true, placeholder: "your-org or username" },
      { key: "repo", label: "Repository Name", type: "text", required: true, placeholder: "my-app" },
    ],
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Check API key mode, webhook health, signing secret configuration, and livemode status.",
    fields: [
      { key: "secretKey", label: "Secret Key", type: "password", required: true, placeholder: "sk_live_..." },
    ],
  },
] as const;

// ─── ConnectorCard ────────────────────────────────────────────────────────────

function ConnectorCard({
  connector,
  status,
  onSave,
  onRemove,
}: {
  connector: (typeof CONNECTORS)[number];
  status: ConnectorStatus | null;
  onSave: (id: string, values: Record<string, string>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const configured = status?.configured ?? false;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await onSave(connector.id, values);
      setSuccess(true);
      setValues({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!confirm(`Remove ${connector.name} connector credentials?`)) return;
    setRemoving(true);
    try {
      await onRemove(connector.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold">{connector.name}</span>
          {configured ? (
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
              Configured
            </span>
          ) : (
            <span className="rounded-full bg-surface-raised px-2 py-0.5 text-xs font-medium text-muted">
              Not configured
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {configured && status?.updatedAt && (
            <span className="text-xs text-muted">
              Updated {new Date(status.updatedAt).toLocaleDateString()}
            </span>
          )}
          <span className="text-muted">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-5 py-4">
          <p className="mb-4 text-sm text-body">{connector.description}</p>

          <form onSubmit={handleSave} className="space-y-3">
            {connector.fields.map((field) => (
              <div key={field.key}>
                <label htmlFor={`${connector.id}-${field.key}`} className="mb-1 block text-sm font-medium text-heading">
                  {field.label}
                </label>
                <input
                  id={`${connector.id}-${field.key}`}
                  type={field.type}
                  required={field.required}
                  value={values[field.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                  placeholder={
                    configured && field.type === "password"
                      ? "•••••••• (leave blank to keep current)"
                      : field.placeholder
                  }
                  autoComplete="off"
                  className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            ))}

            {error && (
              <p className="text-sm text-error">{error}</p>
            )}
            {success && (
              <p className="text-sm text-success">Credentials saved successfully.</p>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
              >
                {saving ? "Saving…" : configured ? "Update credentials" : "Save credentials"}
              </button>
              {configured && (
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={removing}
                  className="text-sm text-error hover:text-error disabled:opacity-50"
                >
                  {removing ? "Removing…" : "Remove"}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConnectorsSettingsPage() {
  const [statuses, setStatuses] = useState<Record<string, ConnectorStatus>>({});
  const [loading, setLoading] = useState(true);

  async function loadStatuses() {
    const results = await Promise.all(
      CONNECTORS.map(async (c) => {
        try {
          const res = await fetch(`/api/connectors/${c.id}`);
          if (!res.ok) return [c.id, null] as const;
          const data = (await res.json()) as ConnectorStatus;
          return [c.id, data] as const;
        } catch {
          return [c.id, null] as const;
        }
      }),
    );
    const statusMap: Record<string, ConnectorStatus> = {};
    for (const [id, data] of results) {
      if (data) statusMap[id] = data;
    }
    setStatuses(statusMap);
    setLoading(false);
  }

  useEffect(() => {
    // loadStatuses is async — setState calls happen in a Promise, not synchronously in the effect body
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStatuses();
  }, []);

  async function handleSave(connectorId: string, values: Record<string, string>) {
    const res = await fetch(`/api/connectors/${connectorId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      throw new Error(typeof data.error === "string" ? data.error : "Save failed");
    }
    await loadStatuses();
  }

  async function handleRemove(connectorId: string) {
    const res = await fetch(`/api/connectors/${connectorId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Remove failed");
    await loadStatuses();
  }

  if (loading) {
    return <p className="text-sm text-muted">Loading connectors…</p>;
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Infrastructure Connectors</h2>
        <p className="mt-1 text-sm text-muted">
          Connect Scantient to your infrastructure providers. Connectors run automatically after each
          security scan and surface findings alongside your security results.
        </p>
      </div>

      <div className="space-y-3">
        {CONNECTORS.map((connector) => (
          <ConnectorCard
            key={connector.id}
            connector={connector}
            status={statuses[connector.id] ?? null}
            onSave={handleSave}
            onRemove={handleRemove}
          />
        ))}
      </div>
    </div>
  );
}
