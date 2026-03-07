"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type BulkResult = {
  created: number;
  skipped: number;
  errors: Array<{ url: string; reason: string }>;
};

type CsvRow = {
  url: string;
  name: string;
  owner_email: string;
  criticality: string;
};

const SAMPLE_CSV =
  "data:text/csv;charset=utf-8,url,name,owner_email,criticality\r\nhttps://app.company.com,Customer Portal,owner@company.com,high\r\nhttps://portal.company.com,Admin Portal,admin@company.com,critical\r\nhttps://tool.company.com,Internal Tool,team@company.com,low";

function parseCSV(text: string): CsvRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const urlIdx = headers.indexOf("url");
  const nameIdx = headers.indexOf("name");
  const emailIdx = headers.indexOf("owner_email");
  const critIdx = headers.indexOf("criticality");

  if (urlIdx === -1) return [];

  return lines
    .slice(1)
    .filter((line) => line.trim())
    .map((line) => {
      const cols = line.split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
      return {
        url: cols[urlIdx] ?? "",
        name: nameIdx !== -1 ? (cols[nameIdx] ?? "") : "",
        owner_email: emailIdx !== -1 ? (cols[emailIdx] ?? "") : "",
        criticality: critIdx !== -1 ? (cols[critIdx] ?? "") : "",
      };
    })
    .filter((row) => row.url);
}

export default function BulkAddPage() {
  const [activeTab, setActiveTab] = useState<"paste" | "csv">("paste");
  const [userEmail, setUserEmail] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [defaultEmail, setDefaultEmail] = useState("");
  const [defaultCriticality, setDefaultCriticality] = useState("medium");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // CSV tab state
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvSubmitting, setCsvSubmitting] = useState(false);
  const [csvResult, setCsvResult] = useState<BulkResult | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user?.email) {
          setUserEmail(data.user.email);
          setDefaultEmail(data.user.email);
        }
      });
  }, []);

  async function handlePasteSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);

    const lines = pasteText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      setError("Please enter at least one URL.");
      setSubmitting(false);
      return;
    }

    const apps = lines.map((url) => ({
      url,
      ownerEmail: defaultEmail || userEmail || undefined,
      criticality: defaultCriticality,
    }));

    try {
      const res = await fetch("/api/apps/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apps }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Failed to add apps");
      } else {
        setResult(data as BulkResult);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setCsvError(null);
    setCsvRows([]);
    setCsvResult(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".csv")) {
      setCsvError("Please select a .csv file");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length === 0) {
        setCsvError("No valid rows found. Make sure your CSV has a 'url' column.");
        return;
      }
      setCsvRows(rows);
    };
    reader.readAsText(file);
  }

  async function handleCsvSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (csvRows.length === 0) return;
    setCsvError(null);
    setCsvResult(null);
    setCsvSubmitting(true);

    const apps = csvRows.map((row) => ({
      url: row.url,
      name: row.name || undefined,
      ownerEmail: row.owner_email || userEmail || undefined,
      criticality: row.criticality || undefined,
    }));

    try {
      const res = await fetch("/api/apps/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apps }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCsvError(data.error?.message ?? "Failed to add apps");
      } else {
        setCsvResult(data as BulkResult);
      }
    } catch {
      setCsvError("Network error. Please try again.");
    } finally {
      setCsvSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl py-8">
      <div className="mb-6">
        <Link href="/dashboard" className="text-sm text-muted hover:text-heading">
          ← Back to dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Bulk Add Apps</h1>
        <p className="text-sm text-muted">Import multiple apps at once via URL list or CSV upload</p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg border bg-surface-raised p-1">
        <button
          type="button"
          onClick={() => setActiveTab("paste")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
            activeTab === "paste" ? "bg-surface shadow-sm" : "text-muted hover:text-heading"
          }`}
        >
          Paste URLs
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("csv")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
            activeTab === "csv" ? "bg-surface shadow-sm" : "text-muted hover:text-heading"
          }`}
        >
          CSV Upload
        </button>
      </div>

      {/* Paste URLs Tab */}
      {activeTab === "paste" && (
        <div className="rounded-lg border bg-surface p-6">
          <form onSubmit={handlePasteSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-heading">
                App URLs
              </label>
              <p className="mb-2 text-xs text-muted">Enter one URL per line. Max 50 at a time.</p>
              <textarea
                className="w-full rounded-md border border-border px-3 py-2 font-mono text-sm focus:border-primary-hover focus:outline-none focus:ring-1 focus:ring-primary-hover"
                rows={8}
                placeholder={"https://app.company.com\nhttps://portal.company.com\nhttps://tool.company.com"}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-heading">
                  Default owner email (optional)
                </label>
                <input
                  type="email"
                  className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary-hover focus:outline-none focus:ring-1 focus:ring-primary-hover"
                  placeholder={userEmail}
                  value={defaultEmail}
                  onChange={(e) => setDefaultEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-heading">
                  Default criticality
                </label>
                <select
                  className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary-hover focus:outline-none focus:ring-1 focus:ring-primary-hover"
                  value={defaultCriticality}
                  onChange={(e) => setDefaultCriticality(e.target.value)}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-error/10 px-3 py-2 text-sm text-error">{error}</div>
            )}

            {result && (
              <div className="rounded-md bg-success/10 px-4 py-3">
                <p className="text-sm font-medium text-success">
                  {result.created} app{result.created !== 1 ? "s" : ""} added
                  {result.skipped > 0 && `, ${result.skipped} skipped (already exist)`}
                  {result.errors.length > 0 && `, ${result.errors.length} error${result.errors.length !== 1 ? "s" : ""}`}
                </p>
                {result.errors.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {result.errors.map((e) => (
                      <li key={e.url} className="text-xs text-error">
                        <span className="font-mono">{e.url}</span>: {e.reason}
                      </li>
                    ))}
                  </ul>
                )}
                {result.created > 0 && (
                  <Link
                    href="/dashboard"
                    className="mt-2 inline-block text-xs font-medium text-success underline"
                  >
                    View dashboard →
                  </Link>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
            >
              {submitting ? "Adding apps…" : "Add apps"}
            </button>
          </form>
        </div>
      )}

      {/* CSV Upload Tab */}
      {activeTab === "csv" && (
        <div className="rounded-lg border bg-surface p-6">
          <div className="mb-4">
            <p className="text-sm text-body">
              Upload a CSV file with your apps. Columns:{" "}
              <code className="rounded bg-surface-raised px-1 text-xs">url</code> (required),{" "}
              <code className="rounded bg-surface-raised px-1 text-xs">name</code>,{" "}
              <code className="rounded bg-surface-raised px-1 text-xs">owner_email</code>,{" "}
              <code className="rounded bg-surface-raised px-1 text-xs">criticality</code>
            </p>
            <a
              href={SAMPLE_CSV}
              download="scantient-bulk-import-template.csv"
              className="mt-1 inline-block text-xs text-info hover:underline"
            >
              ↓ Download sample CSV template
            </a>
          </div>

          <form onSubmit={handleCsvSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-heading">CSV File</label>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="block w-full text-sm text-muted file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-primary-hover"
              />
            </div>

            {csvError && (
              <div className="rounded-md bg-error/10 px-3 py-2 text-sm text-error">{csvError}</div>
            )}

            {csvRows.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-heading">
                  Preview — {csvRows.length} row{csvRows.length !== 1 ? "s" : ""} found
                  {csvRows.length > 10 && " (showing first 10)"}
                </p>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-raised">
                      <tr>
                        <th className="px-3 py-2 font-medium text-body">URL</th>
                        <th className="px-3 py-2 font-medium text-body">Name</th>
                        <th className="px-3 py-2 font-medium text-body">Owner Email</th>
                        <th className="px-3 py-2 font-medium text-body">Criticality</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {csvRows.slice(0, 10).map((row, i) => (
                        <tr key={i} className="hover:bg-surface-raised">
                          <td className="max-w-[160px] truncate px-3 py-2 font-mono text-heading">
                            {row.url}
                          </td>
                          <td className="px-3 py-2 text-body">{row.name || "—"}</td>
                          <td className="px-3 py-2 text-body">{row.owner_email || "—"}</td>
                          <td className="px-3 py-2 capitalize text-body">
                            {row.criticality || "medium"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {csvResult && (
              <div className="rounded-md bg-success/10 px-4 py-3">
                <p className="text-sm font-medium text-success">
                  {csvResult.created} app{csvResult.created !== 1 ? "s" : ""} added
                  {csvResult.skipped > 0 && `, ${csvResult.skipped} skipped (already exist)`}
                  {csvResult.errors.length > 0 &&
                    `, ${csvResult.errors.length} error${csvResult.errors.length !== 1 ? "s" : ""}`}
                </p>
                {csvResult.errors.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {csvResult.errors.map((e) => (
                      <li key={e.url} className="text-xs text-error">
                        <span className="font-mono">{e.url}</span>: {e.reason}
                      </li>
                    ))}
                  </ul>
                )}
                {csvResult.created > 0 && (
                  <Link
                    href="/dashboard"
                    className="mt-2 inline-block text-xs font-medium text-success underline"
                  >
                    View dashboard →
                  </Link>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={csvSubmitting || csvRows.length === 0}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
            >
              {csvSubmitting ? "Importing…" : `Import ${csvRows.length > 0 ? csvRows.length : ""} apps`}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
