"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

type AppData = {
  id: string;
  name: string;
  url: string;
  ownerEmail: string;
  ownerName: string | null;
  criticality: string;
  probeUrl: string | null;
  // probeToken is never returned by the API (encrypted at rest); we only show a placeholder
};

export default function AppEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [app, setApp] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [probeUrl, setProbeUrl] = useState("");
  const [probeToken, setProbeToken] = useState("");

  useEffect(() => {
    fetch(`/api/apps/${id}`)
      .then((r) => r.json())
      .then((data: { app: AppData }) => {
        setApp(data.app);
        setName(data.app.name);
        setProbeUrl(data.app.probeUrl ?? "");
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load app");
        setLoading(false);
      });
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    const body: Record<string, string | null> = {
      name: name.trim() || (app?.name ?? ""),
      // Only send probeUrl if it changed
      probeUrl: probeUrl.trim() || null,
    };

    // Only include probeToken if the user typed something new
    if (probeToken.trim()) {
      body.probeToken = probeToken.trim();
    }

    try {
      const res = await fetch(`/api/apps/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string | Record<string, unknown> };
        setError(typeof data.error === "string" ? data.error : "Failed to save settings");
      } else {
        setSuccess(true);
        setProbeToken(""); // Clear the token field — never show it back
        // Refresh app data
        const updated = (await res.json()) as { app: AppData };
        setApp(updated.app);
        setProbeUrl(updated.app.probeUrl ?? "");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  if (!app) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <p className="text-sm text-red-500">{error ?? "App not found"}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link
        href={`/apps/${id}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        ← Back to {app.name}
      </Link>

      <h1 className="mb-6 text-xl font-bold">App Settings — {app.name}</h1>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* General */}
        <section className="rounded-lg border bg-white p-6">
          <h2 className="mb-4 text-base font-semibold">General</h2>
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">
              App name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">App URL</label>
            <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
              {app.url}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              URL cannot be changed here — delete and re-add the app to change it.
            </p>
          </div>
        </section>

        {/* Probe Endpoint */}
        <section className="rounded-lg border bg-white p-6">
          <h2 className="mb-1 text-base font-semibold">Probe Endpoint</h2>
          <p className="mb-4 text-sm text-gray-500">
            Add your app&apos;s <code className="rounded bg-gray-100 px-1 text-xs">/api/scantient-probe</code> URL and
            token to enable subsystem health monitoring. Scantient will call this endpoint after each
            security scan to check your database, auth, payments, email, and other subsystems.
          </p>

          <div className="space-y-4">
            <div>
              <label htmlFor="probeUrl" className="mb-1 block text-sm font-medium text-gray-700">
                Probe URL
              </label>
              <input
                id="probeUrl"
                type="url"
                value={probeUrl}
                onChange={(e) => setProbeUrl(e.target.value)}
                placeholder="https://your-app.com/api/scantient-probe"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="probeToken" className="mb-1 block text-sm font-medium text-gray-700">
                Probe Token
              </label>
              <input
                id="probeToken"
                type="password"
                value={probeToken}
                onChange={(e) => setProbeToken(e.target.value)}
                placeholder={app.probeUrl ? "••••••••  (leave blank to keep current)" : "Enter shared secret token"}
                autoComplete="new-password"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                Token is encrypted at rest and never returned by the API. Generate one with:{" "}
                <code className="rounded bg-gray-100 px-1">openssl rand -hex 32</code>
              </p>
            </div>

            {app.probeUrl && (
              <p className="flex items-center gap-1.5 text-xs text-green-600">
                <span>✓</span>
                <span>Probe configured — health data will appear after the next scan</span>
              </p>
            )}
          </div>
        </section>

        {/* Save / feedback */}
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            Settings saved successfully.
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
          <Link
            href={`/apps/${id}`}
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
