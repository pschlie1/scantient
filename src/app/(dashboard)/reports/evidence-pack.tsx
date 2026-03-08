"use client";

import { useState } from "react";

const FRAMEWORKS = [
  { value: "soc2", label: "SOC 2 Type II" },
  { value: "iso27001", label: "ISO 27001:2022" },
  { value: "nist", label: "NIST CSF 2.0" },
];

export function EvidencePackSection() {
  const [framework, setFramework] = useState("soc2");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGenerate = () => {
    if (!from || !to) return;
    setLoading(true);
    window.location.href = `/api/reports/evidence?framework=${framework}&from=${from}&to=${to}`;
    setTimeout(() => setLoading(false), 3000);
  };

  return (
    <div className="mt-10 rounded-lg border bg-white p-6">
      <h2 className="text-lg font-bold">Evidence Pack</h2>
      <p className="mt-1 text-sm text-muted">
        Audit-ready evidence packs map your security posture to compliance frameworks.
        Share with auditors, include in board presentations.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-heading mb-1">Framework</label>
          <select
            value={framework}
            onChange={(e) => setFramework(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm shadow-sm focus:border-primary-hover focus:ring-1 focus:ring-primary-hover"
          >
            {FRAMEWORKS.map((fw) => (
              <option key={fw.value} value={fw.value}>
                {fw.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-heading mb-1">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm shadow-sm focus:border-primary-hover focus:ring-1 focus:ring-primary-hover"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-heading mb-1">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm shadow-sm focus:border-primary-hover focus:ring-1 focus:ring-primary-hover"
          />
        </div>
      </div>

      <button
        onClick={handleGenerate}
        disabled={!from || !to || loading}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Generating...
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Generate Evidence Pack
          </>
        )}
      </button>
    </div>
  );
}
