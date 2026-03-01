"use client";

import { useState, useEffect } from "react";

interface TimelineEvent {
  timestamp: string;
  actor: string;
  action: string;
  details?: string;
}

interface LinkedPR {
  url: string;
  title?: string;
  linkedAt: string;
  linkedBy: string;
}

interface TimelineData {
  findingId: string;
  lifecycleStage: string;
  priority: string | null;
  timeline: TimelineEvent[];
  linkedPRs: LinkedPR[];
}

const ACTION_ICONS: Record<string, string> = {
  detected: "🔍",
  triaged: "📋",
  assigned: "👤",
  status_change: "🔄",
  pr_linked: "🔗",
  verification_failed: "❌",
  verified_closed: "✅",
};

const STAGE_COLORS: Record<string, string> = {
  DETECTED: "bg-red-100 text-red-700",
  TRIAGED: "bg-yellow-100 text-yellow-700",
  ASSIGNED: "bg-blue-100 text-blue-700",
  FIX_IN_PROGRESS: "bg-purple-100 text-purple-700",
  VERIFICATION: "bg-orange-100 text-orange-700",
  CLOSED: "bg-green-100 text-green-700",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function FindingTimeline({ findingId }: { findingId: string }) {
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    setLoading(true);
    fetch(`/api/findings/${findingId}/timeline`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [findingId, expanded]);

  async function handleLinkPR() {
    if (!linkUrl.trim()) return;
    setLinking(true);
    try {
      await fetch(`/api/findings/${findingId}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: linkUrl, title: linkTitle || undefined }),
      });
      setLinkUrl("");
      setLinkTitle("");
      setShowLinkForm(false);
      // Refresh timeline
      const r = await fetch(`/api/findings/${findingId}/timeline`);
      setData(await r.json());
    } finally {
      setLinking(false);
    }
  }

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs font-medium text-indigo-600 hover:underline"
        >
          {expanded ? "Hide timeline" : "Show timeline"}
        </button>
        <button
          onClick={() => { setShowLinkForm(!showLinkForm); if (!expanded) setExpanded(true); }}
          className="text-xs font-medium text-green-600 hover:underline"
        >
          🔗 Link PR
        </button>
      </div>

      {expanded && (
        <div className="mt-3 rounded-lg border bg-gray-50 p-3">
          {loading ? (
            <p className="text-xs text-gray-500">Loading timeline...</p>
          ) : !data ? (
            <p className="text-xs text-gray-500">Failed to load timeline.</p>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STAGE_COLORS[data.lifecycleStage] ?? "bg-gray-100 text-gray-700"}`}>
                  {data.lifecycleStage.replace(/_/g, " ")}
                </span>
                {data.priority && (
                  <span className="text-xs font-medium text-gray-500">{data.priority}</span>
                )}
              </div>

              {/* Linked PRs */}
              {data.linkedPRs.length > 0 && (
                <div className="mb-3">
                  <p className="mb-1 text-xs font-semibold text-gray-700">Linked PRs</p>
                  {data.linkedPRs.map((pr, i) => (
                    <a
                      key={i}
                      href={pr.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-xs text-blue-600 hover:underline"
                    >
                      🔗 {pr.title ?? pr.url}
                    </a>
                  ))}
                </div>
              )}

              {/* Timeline */}
              <div className="space-y-2">
                {data.timeline.map((event, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="mt-0.5 text-sm">{ACTION_ICONS[event.action] ?? "•"}</span>
                    <div className="flex-1">
                      <p className="text-xs text-gray-900">
                        <span className="font-medium">{event.action.replace(/_/g, " ")}</span>
                        {event.details && <span className="text-gray-600"> - {event.details}</span>}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {formatTime(event.timestamp)} · {event.actor === "system" ? "System" : event.actor}
                      </p>
                    </div>
                  </div>
                ))}
                {data.timeline.length === 0 && (
                  <p className="text-xs text-gray-400">No lifecycle events yet.</p>
                )}
              </div>
            </>
          )}

          {/* Link PR form */}
          {showLinkForm && (
            <div className="mt-3 space-y-2 rounded border bg-white p-2">
              <input
                type="url"
                placeholder="GitHub PR or commit URL"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className="w-full rounded border px-2 py-1 text-xs"
              />
              <input
                type="text"
                placeholder="Title (optional)"
                value={linkTitle}
                onChange={(e) => setLinkTitle(e.target.value)}
                className="w-full rounded border px-2 py-1 text-xs"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleLinkPR}
                  disabled={linking || !linkUrl.trim()}
                  className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {linking ? "Linking..." : "Link"}
                </button>
                <button
                  onClick={() => setShowLinkForm(false)}
                  className="text-xs text-gray-500 hover:underline"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
