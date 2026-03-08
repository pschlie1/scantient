"use client";

import { useState } from "react";

type TeamMember = {
  id: string;
  name: string | null;
  email: string;
};

type Props = {
  findingId: string;
  currentAssigneeId: string | null;
  teamMembers: TeamMember[];
};

export function FindingAssignment({ findingId, currentAssigneeId, teamMembers }: Props) {
  const [assigneeId, setAssigneeId] = useState(currentAssigneeId ?? "");
  const [saving, setSaving] = useState(false);

  async function handleChange(userId: string) {
    setSaving(true);
    setAssigneeId(userId);
    try {
      await fetch(`/api/findings/${findingId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userId || null }),
      });
    } finally {
      setSaving(false);
    }
  }

  const assignee = teamMembers.find((m) => m.id === assigneeId);

  return (
    <div className="flex items-center gap-2">
      {assignee && (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-border text-[10px] font-medium text-body">
          {(assignee.name || assignee.email)[0].toUpperCase()}
        </span>
      )}
      <select
        value={assigneeId}
        onChange={(e) => handleChange(e.target.value)}
        disabled={saving}
        className="rounded border px-2 py-0.5 text-xs text-body disabled:opacity-50"
      >
        <option value="">Unassigned</option>
        {teamMembers.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name || m.email}
          </option>
        ))}
      </select>
    </div>
  );
}
