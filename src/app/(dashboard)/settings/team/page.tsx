"use client";

import { useEffect, useState } from "react";

type Member = { id: string; name: string | null; email: string; role: string; lastLoginAt: string | null };

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch("/api/team").then((r) => r.json()).then((d) => setMembers(d.members ?? []));
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      if (res.ok) {
        setInviteEmail("");
        const d = await res.json();
        setMembers((prev) => [...prev, d.user]);
      } else {
        const err = await res.json();
        alert(err.error ?? "Failed to invite");
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-surface p-6">
        <h2 className="mb-4 text-lg font-semibold">Team members</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-medium uppercase tracking-wider text-muted">
              <th className="pb-2">Name</th>
              <th className="pb-2">Email</th>
              <th className="pb-2">Role</th>
              <th className="pb-2">Last login</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {members.map((m) => (
              <tr key={m.id}>
                <td className="py-2 font-medium">{m.name ?? "—"}</td>
                <td className="py-2 text-body">{m.email}</td>
                <td className="py-2">
                  <span className="rounded bg-surface-raised px-2 py-0.5 text-xs font-medium">{m.role}</span>
                </td>
                <td className="py-2 text-xs text-muted">
                  {m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleDateString() : "Never"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border bg-surface p-6">
        <h2 className="mb-4 text-lg font-semibold">Invite team member</h2>
        <form onSubmit={handleInvite} className="flex gap-3">
          <input
            type="email"
            required
            placeholder="colleague@company.com"
            className="flex-1 rounded-lg border px-3 py-2 text-sm focus:border-primary-hover focus:outline-none focus:ring-1 focus:ring-primary-hover"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <select
            className="rounded-lg border px-3 py-2 text-sm"
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
          >
            <option value="MEMBER">Member</option>
            <option value="ADMIN">Admin</option>
            <option value="VIEWER">Viewer</option>
          </select>
          <button
            type="submit"
            disabled={sending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
          >
            {sending ? "Inviting…" : "Invite"}
          </button>
        </form>
      </div>
    </div>
  );
}
