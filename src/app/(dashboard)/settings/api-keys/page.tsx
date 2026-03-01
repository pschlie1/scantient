"use client";

import { useEffect, useState } from "react";

type ApiKeyInfo = { id: string; name: string; keyPrefix: string; lastUsedAt: string | null; createdAt: string };

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/keys").then((r) => r.json()).then((d) => setKeys(d.keys ?? []));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setNewKey(null);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const d = await res.json();
        setNewKey(d.plainKey);
        setKeys((prev) => [d.key, ...prev]);
        setName("");
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm("Revoke this API key? This cannot be undone.")) return;
    await fetch(`/api/keys/${id}`, { method: "DELETE" });
    setKeys((prev) => prev.filter((k) => k.id !== id));
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-white p-6">
        <h2 className="mb-2 text-lg font-semibold">API keys</h2>
        <p className="mb-4 text-sm text-gray-500">
          Use API keys to integrate Scantient with your CI/CD pipeline, agents, or custom tooling.
        </p>

        {newKey && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="mb-1 text-sm font-medium text-green-800">Your new API key (copy now — it won&apos;t be shown again):</p>
            <code className="block rounded bg-white p-2 text-sm font-mono">{newKey}</code>
          </div>
        )}

        {keys.length === 0 ? (
          <p className="text-sm text-gray-500">No API keys created yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="pb-2">Name</th>
                <th className="pb-2">Key</th>
                <th className="pb-2">Last used</th>
                <th className="pb-2">Created</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {keys.map((k) => (
                <tr key={k.id}>
                  <td className="py-2 font-medium">{k.name}</td>
                  <td className="py-2 font-mono text-xs text-gray-500">{k.keyPrefix}…</td>
                  <td className="py-2 text-xs text-gray-500">
                    {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "Never"}
                  </td>
                  <td className="py-2 text-xs text-gray-500">{new Date(k.createdAt).toLocaleDateString()}</td>
                  <td className="py-2">
                    <button onClick={() => handleRevoke(k.id)} className="text-xs text-red-500 hover:underline">
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-lg border bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">Create API key</h2>
        <form onSubmit={handleCreate} className="flex gap-3">
          <input
            required
            placeholder="Key name (e.g., CI Pipeline)"
            className="flex-1 rounded-lg border px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create key"}
          </button>
        </form>
      </div>

      <div className="rounded-lg border bg-gray-50 p-6">
        <h3 className="mb-2 font-semibold">API usage</h3>
        <pre className="overflow-x-auto rounded bg-gray-900 p-4 text-xs text-green-400">{`# List your monitored apps
curl -H "Authorization: Bearer vs_YOUR_KEY" \\
  https://your-scantient.vercel.app/api/v1/apps

# Trigger a scan
curl -X POST -H "Authorization: Bearer vs_YOUR_KEY" \\
  https://your-scantient.vercel.app/api/v1/scan/APP_ID

# Get dashboard summary
curl -H "Authorization: Bearer vs_YOUR_KEY" \\
  https://your-scantient.vercel.app/api/v1/dashboard`}</pre>
      </div>
    </div>
  );
}
