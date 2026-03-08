"use client";

import { useState } from "react";

const STORAGE_KEY = "scantient_spa_banner_dismissed";

export function SpaBanner() {
  const [visible, setVisible] = useState<boolean>(() => {
    try {
      return typeof localStorage !== "undefined" && !localStorage.getItem(STORAGE_KEY);
    } catch {
      return false;
    }
  });

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="mb-6 flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning">
      <span className="mt-0.5 text-base leading-none">⚠️</span>
      <p className="flex-1 leading-relaxed">
        <strong>Scanner note:</strong> For best results, add public-facing URLs. Single-page apps
        (React, Vue, Next.js CSR) may show partial results since our scanner does not execute
        JavaScript. For internal apps behind auth, configure auth headers per app or use the Scan
        Agent.
      </p>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="ml-2 shrink-0 rounded p-0.5 text-warning hover:bg-warning/20 hover:text-heading focus:outline-none"
      >
        ✕
      </button>
    </div>
  );
}
