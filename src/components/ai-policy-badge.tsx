"use client";

import { useState } from "react";
import type { AiPolicyMeta, AiPolicyStatus } from "@/lib/ai-policy-scanner";

interface Props {
  findingId: string;
  meta: AiPolicyMeta;
}

const policyOptions: { value: AiPolicyStatus; label: string; color: string }[] = [
  { value: "unclassified", label: "Unclassified", color: "bg-warning/10 text-warning border-warning" },
  { value: "approved", label: "Approved", color: "bg-success/10 text-success border-success" },
  { value: "restricted", label: "Restricted", color: "bg-warning/10 text-warning border-warning/30" },
  { value: "prohibited", label: "Prohibited", color: "bg-error/10 text-error border-error" },
];

export function AiPolicyBadge({ findingId, meta }: Props) {
  const [status, setStatus] = useState<AiPolicyStatus>(meta.policyStatus);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const current = policyOptions.find((o) => o.value === status) ?? policyOptions[0];

  async function handleSetPolicy(newStatus: AiPolicyStatus) {
    setSaving(true);
    try {
      // Persist the new policy status by updating the finding notes field via PATCH
      const res = await fetch(`/api/findings/${findingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: `ai_policy_status:${newStatus}` }),
      });
      if (res.ok) {
        setStatus(newStatus);
        setOpen(false);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative inline-block">
      <div className="flex items-center gap-1.5">
        {/* AI tool badge */}
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary border border-primary/30">
          <span>🤖</span>
          <span>{meta.aiTool}</span>
        </span>

        {/* Policy status badge + dropdown trigger */}
        <button
          onClick={() => setOpen((v) => !v)}
          disabled={saving}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition hover:opacity-80 disabled:opacity-50 ${current.color}`}
          title="Set AI usage policy for this tool"
        >
          {status === "unclassified" && <span>⚠️</span>}
          {status === "approved" && <span>✅</span>}
          {status === "restricted" && <span>⚠️</span>}
          {status === "prohibited" && <span>🚫</span>}
          <span>{current.label}</span>
          <span>▾</span>
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-lg border bg-surface shadow-lg">
          <p className="border-b px-3 py-1.5 text-xs font-semibold text-muted uppercase tracking-wider">
            Set Policy
          </p>
          {policyOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleSetPolicy(opt.value)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition hover:bg-surface-raised ${
                opt.value === status ? "font-semibold" : ""
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  opt.value === "unclassified"
                    ? "bg-warning"
                    : opt.value === "approved"
                    ? "bg-success"
                    : opt.value === "restricted"
                    ? "bg-orange-400"
                    : "bg-error"
                }`}
              />
              {opt.label}
              {opt.value === status && <span className="ml-auto">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
