"use client";

import { useState } from "react";

type Props = {
  findingId: string;
  currentStatus: string;
};

const statuses = [
  { value: "OPEN", label: "Open", color: "text-red-600" },
  { value: "ACKNOWLEDGED", label: "Acknowledged", color: "text-yellow-600" },
  { value: "IN_PROGRESS", label: "In Progress", color: "text-blue-600" },
  { value: "RESOLVED", label: "Resolved", color: "text-green-600" },
  { value: "IGNORED", label: "Ignored", color: "text-gray-500" },
];

export function FindingActions({ findingId, currentStatus }: Props) {
  const [status, setStatus] = useState(currentStatus);
  const [updating, setUpdating] = useState(false);

  async function handleChange(newStatus: string) {
    if (newStatus === status) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/findings/${findingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setStatus(newStatus);
      }
    } finally {
      setUpdating(false);
    }
  }

  const isResolved = status === "RESOLVED";
  const isIgnored = status === "IGNORED";
  const isOpen = status === "OPEN" || status === "IN_PROGRESS" || status === "ACKNOWLEDGED";

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Quick-action buttons for open findings */}
      {isOpen && (
        <>
          <button
            type="button"
            onClick={() => handleChange("RESOLVED")}
            disabled={updating}
            className="rounded border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50"
            title="Mark this finding as fixed"
          >
            ✓ Mark as fixed
          </button>
          <button
            type="button"
            onClick={() => handleChange("IGNORED")}
            disabled={updating}
            className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50"
            title="Accept this as a known risk"
          >
            Accept risk
          </button>
        </>
      )}

      {/* Reopen button for resolved/ignored findings */}
      {(isResolved || isIgnored) && (
        <button
          type="button"
          onClick={() => handleChange("OPEN")}
          disabled={updating}
          className="rounded border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          Reopen
        </button>
      )}

      {/* Full status dropdown for fine-grained control */}
      <select
        value={status}
        onChange={(e) => handleChange(e.target.value)}
        disabled={updating}
        className={`rounded border px-2 py-0.5 text-xs font-medium disabled:opacity-50 ${
          statuses.find((s) => s.value === status)?.color ?? ""
        }`}
      >
        {statuses.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}
