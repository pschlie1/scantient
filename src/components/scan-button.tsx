"use client";

import { useState } from "react";

export function ScanButton({ appId }: { appId: string }) {
  const [scanning, setScanning] = useState(false);

  async function handleScan() {
    setScanning(true);
    try {
      const res = await fetch(`/api/scan/${appId}`, { method: "POST" });
      if (res.ok) {
        window.location.reload();
      } else {
        const data = await res.json();
        alert(`Scan failed: ${data.error ?? "Unknown error"}`);
      }
    } catch {
      alert("Network error: could not reach scanner");
    } finally {
      setScanning(false);
    }
  }

  return (
    <button
      onClick={handleScan}
      disabled={scanning}
      className="rounded border border-gray-300 px-2.5 py-1 text-xs font-medium transition hover:bg-gray-100 disabled:opacity-50"
    >
      {scanning ? (
        <span className="flex items-center gap-1">
          <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Scanning…
        </span>
      ) : (
        "Run scan"
      )}
    </button>
  );
}
