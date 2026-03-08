"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-body transition hover:bg-surface-raised"
    >
      Export PDF
    </button>
  );
}
