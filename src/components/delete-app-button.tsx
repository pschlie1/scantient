"use client";

import { useState } from "react";

export function DeleteAppButton({ appId, appName }: { appId: string; appName: string }) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`Remove "${appName}" from monitoring? This deletes all scan history.`)) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/apps/${appId}`, { method: "DELETE" });
      if (res.ok) {
        window.location.href = "/";
      } else {
        alert("Failed to delete app");
      }
    } catch {
      alert("Network error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="rounded border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
    >
      {deleting ? "Removing…" : "Remove"}
    </button>
  );
}
