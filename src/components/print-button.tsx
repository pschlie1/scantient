"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
    >
      Export PDF
    </button>
  );
}
