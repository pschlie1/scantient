"use client";

import { useState } from "react";

type Step = 1 | 2 | 3 | 4;

type FindingSummary = {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
};

export function OnboardingWizard() {
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [findings, setFindings] = useState<FindingSummary>({ total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 });
  const [slackUrl, setSlackUrl] = useState("");
  const [alertEmail, setAlertEmail] = useState("");
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("scantient-onboarding-done") === "true";
    }
    return false;
  });

  if (dismissed) return null;

  function complete() {
    localStorage.setItem("scantient-onboarding-done", "true");
    setDismissed(true);
    window.location.reload();
  }

  async function handleAddApp() {
    setError("");
    if (!name.trim() || !url.trim()) {
      setError("Name and URL are required.");
      return;
    }
    try {
      const res = await fetch("/api/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message || data.error || "Failed to add app");
        return;
      }
      setStep(2);
      triggerScan(data.app.id);
    } catch {
      setError("Network error. Please try again.");
    }
  }

  async function triggerScan(id: string) {
    try {
      const res = await fetch(`/api/scan/${id}`, { method: "POST" });
      if (res.ok) {
        // Poll for results
        pollScan(id);
      } else {
        // Even if scan fails, move forward
        setStep(3);
      }
    } catch {
      setStep(3);
    }
  }

  async function pollScan(id: string) {
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const res = await fetch(`/api/apps/${id}`);
        if (!res.ok) continue;
        const data = await res.json();
        const run = data.app?.monitorRuns?.[0];
        if (run && run.status !== "RUNNING") {
          const f = run.findings || [];
          setFindings({
            total: f.length,
            critical: f.filter((x: { severity: string }) => x.severity === "CRITICAL").length,
            high: f.filter((x: { severity: string }) => x.severity === "HIGH").length,
            medium: f.filter((x: { severity: string }) => x.severity === "MEDIUM").length,
            low: f.filter((x: { severity: string }) => x.severity === "LOW").length,
            info: f.filter((x: { severity: string }) => x.severity === "INFO").length,
          });
          setStep(3);
          return;
        }
      } catch { /* continue polling */ }
    }
    setStep(3);
  }

  async function handleSaveAlerts() {
    // Save alert configs if provided
    if (slackUrl.trim()) {
      await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "SLACK", destination: slackUrl.trim() }),
      }).catch(() => {});
    }
    if (alertEmail.trim()) {
      await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "EMAIL", destination: alertEmail.trim() }),
      }).catch(() => {});
    }
    complete();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl">
        {/* Progress */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-1.5 w-12 rounded-full transition-colors ${
                s <= step ? "bg-black" : "bg-gray-200"
              }`}
            />
          ))}
        </div>

        {/* Step 1: Add app */}
        {step === 1 && (
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Add your first app</h2>
            <p className="mt-1 text-sm text-gray-500">
              We&apos;ll scan it for security issues in seconds.
            </p>
            <div className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">App name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My App"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">URL</label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                onClick={handleAddApp}
                className="w-full rounded-lg bg-black py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
              >
                Scan now →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Scanning */}
        {step === 2 && (
          <div className="text-center">
            <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-black" />
            <h2 className="text-xl font-semibold tracking-tight">Running first scan…</h2>
            <p className="mt-2 text-sm text-gray-500">
              Checking headers, TLS, cookies, and more.
            </p>
          </div>
        )}

        {/* Step 3: Results */}
        {step === 3 && (
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Here&apos;s what we found</h2>
            <p className="mt-1 text-sm text-gray-500">
              {findings.total === 0
                ? "No issues detected — your app looks great!"
                : `${findings.total} finding${findings.total === 1 ? "" : "s"} across your app.`}
            </p>
            {findings.total > 0 && (
              <div className="mt-6 grid grid-cols-5 gap-2">
                {[
                  { label: "Critical", count: findings.critical, color: "bg-red-50 text-red-700" },
                  { label: "High", count: findings.high, color: "bg-orange-50 text-orange-700" },
                  { label: "Medium", count: findings.medium, color: "bg-yellow-50 text-yellow-700" },
                  { label: "Low", count: findings.low, color: "bg-blue-50 text-blue-700" },
                  { label: "Info", count: findings.info, color: "bg-gray-50 text-gray-600" },
                ].map((s) => (
                  <div key={s.label} className={`rounded-lg px-3 py-3 text-center ${s.color}`}>
                    <p className="text-lg font-bold">{s.count}</p>
                    <p className="text-xs font-medium">{s.label}</p>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setStep(4)}
              className="mt-6 w-full rounded-lg bg-black py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
            >
              Set up alerts →
            </button>
          </div>
        )}

        {/* Step 4: Alerts */}
        {step === 4 && (
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Set up alerts</h2>
            <p className="mt-1 text-sm text-gray-500">
              Get notified when new issues are found. Optional — you can do this later.
            </p>
            <div className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Slack webhook URL</label>
                <input
                  type="url"
                  value={slackUrl}
                  onChange={(e) => setSlackUrl(e.target.value)}
                  placeholder="https://hooks.slack.com/services/..."
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  value={alertEmail}
                  onChange={(e) => setAlertEmail(e.target.value)}
                  placeholder="alerts@yourteam.com"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleSaveAlerts}
                  className="flex-1 rounded-lg bg-black py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
                >
                  Save & finish
                </button>
                <button
                  onClick={complete}
                  className="rounded-lg border px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Skip
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
