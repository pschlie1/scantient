"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "vs_onboarding_dismissed";

type ChecklistState = {
  accountCreated: boolean;
  hasApp: boolean;
  hasScanned: boolean;
  hasAlert: boolean;
  hasTeammate: boolean;
};

const steps = [
  {
    key: "accountCreated" as keyof ChecklistState,
    title: "Create your account",
    desc: "Welcome to Scantient! Your account is ready.",
    ctaLabel: null,
    ctaHref: null,
  },
  {
    key: "hasApp" as keyof ChecklistState,
    title: "Add your first app",
    desc: "Register an app to start continuous security monitoring.",
    ctaLabel: "Add an app",
    ctaHref: "/dashboard",
  },
  {
    key: "hasScanned" as keyof ChecklistState,
    title: "Run your first scan",
    desc: "Trigger a scan to get your first security score.",
    ctaLabel: "Go to dashboard",
    ctaHref: "/dashboard",
  },
  {
    key: "hasAlert" as keyof ChecklistState,
    title: "Set up an alert",
    desc: "Get notified when new security issues are found.",
    ctaLabel: "Configure alerts",
    ctaHref: "/settings/alerts",
  },
  {
    key: "hasTeammate" as keyof ChecklistState,
    title: "Invite a teammate",
    desc: "Collaborate with your team on security findings.",
    ctaLabel: "Invite team",
    ctaHref: "/settings/team",
  },
];

export function OnboardingChecklist() {
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [state, setState] = useState<ChecklistState>({
    accountCreated: true,
    hasApp: false,
    hasScanned: false,
    hasAlert: false,
    hasTeammate: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") {
      setDismissed(true);
      return;
    }
    setDismissed(false);
    void fetchState();
  }, []);

  async function fetchState() {
    setLoading(true);
    try {
      const [appsRes, alertsRes, teamRes] = await Promise.allSettled([
        fetch("/api/apps"),
        fetch("/api/alerts"),
        fetch("/api/auth/me"),
      ]);

      const newState: ChecklistState = {
        accountCreated: true,
        hasApp: false,
        hasScanned: false,
        hasAlert: false,
        hasTeammate: false,
      };

      if (appsRes.status === "fulfilled" && appsRes.value.ok) {
        const data = await appsRes.value.json() as { apps?: Array<{ status: string }> };
        const apps = data.apps ?? [];
        newState.hasApp = apps.length > 0;
        newState.hasScanned = apps.some((a) => a.status !== "UNKNOWN");
      }

      if (alertsRes.status === "fulfilled" && alertsRes.value.ok) {
        const data = await alertsRes.value.json() as { configs?: unknown[] };
        newState.hasAlert = (data.configs ?? []).length > 0;
      }

      if (teamRes.status === "fulfilled" && teamRes.value.ok) {
        const data = await teamRes.value.json() as { org?: { userCount?: number } };
        newState.hasTeammate = (data.org?.userCount ?? 1) > 1;
      }

      setState(newState);
    } catch {
      // silently fail — checklist just shows as incomplete
    } finally {
      setLoading(false);
    }
  }

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "true");
    setDismissed(true);
  }

  // Don't render until we know dismissed state (avoids flash)
  if (dismissed === null) return null;
  if (dismissed) return null;

  const completedCount = steps.filter((s) => state[s.key]).length;
  const allComplete = completedCount === steps.length;
  const progressPct = (completedCount / steps.length) * 100;

  return (
    <div className="mb-6 min-w-0 overflow-hidden rounded-lg border border-alabaster-grey-200 bg-surface shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="text-sm font-semibold text-ink-black-900 hover:text-prussian-blue-700 focus:outline-none"
          >
            {allComplete ? "🎉 You're all set!" : `Getting started · ${completedCount}/5 complete`}
          </button>
          {!collapsed && !allComplete && (
            <span className="text-xs text-muted">{collapsed ? "Show" : "Hide"}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!allComplete && (
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="rounded px-2 py-1 text-xs text-muted hover:bg-surface-raised"
              aria-label={collapsed ? "Expand checklist" : "Collapse checklist"}
            >
              {collapsed ? "▸ Show" : "▾ Hide"}
            </button>
          )}
          <button
            onClick={dismiss}
            className="rounded px-2 py-1 text-xs text-muted hover:bg-surface-raised hover:text-body"
            aria-label="Dismiss checklist"
          >
            Dismiss
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {!collapsed && (
        <>
          <div className="mx-5 mb-4 h-1.5 overflow-hidden rounded-full bg-alabaster-grey-100">
            <div
              className="h-full rounded-full bg-prussian-blue-600 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* Steps */}
          {allComplete ? (
            <div className="px-5 pb-5 text-center">
              <p className="text-sm text-dusty-denim-700">
                You&apos;ve completed setup! Scantient is monitoring your apps. 🚀
              </p>
              <button
                onClick={dismiss}
                className="mt-3 rounded-lg bg-success px-4 py-2 text-sm font-medium text-white hover:bg-success transition-colors"
              >
                Got it, dismiss
              </button>
            </div>
          ) : loading ? (
            <div className="px-5 pb-5 text-sm text-muted">Checking your progress…</div>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {steps.map((step) => {
                const complete = state[step.key];
                const ctaMatchesCurrentPage = Boolean(step.ctaHref && (pathname === step.ctaHref || pathname.startsWith(`${step.ctaHref}/`)));
                const showInlineHint = !complete && step.key === "hasScanned" && ctaMatchesCurrentPage;

                return (
                  <li key={step.key} className="flex min-w-0 items-center justify-between gap-4 px-5 py-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          complete
                            ? "bg-prussian-blue-100 text-prussian-blue-700"
                            : "bg-alabaster-grey-100 text-dusty-denim-500"
                        }`}
                      >
                        {complete ? "✓" : "○"}
                      </span>
                      <div className="min-w-0">
                        <p className={`break-words text-sm font-medium ${complete ? "text-dusty-denim-500 line-through" : "text-ink-black-900"}`}>
                          {step.title}
                        </p>
                        {!complete && (
                          <p className="break-words text-xs text-dusty-denim-600">{step.desc}</p>
                        )}
                        {showInlineHint && (
                          <p className="mt-1 break-words text-xs font-medium text-prussian-blue-700">Use the “Run scan” button in the Monitored apps table below.</p>
                        )}
                      </div>
                    </div>
                    {!complete && step.ctaLabel && step.ctaHref && !ctaMatchesCurrentPage && (
                      <Link
                        href={step.ctaHref}
                        className="shrink-0 rounded border border-alabaster-grey-200 px-3 py-1 text-xs font-medium text-dusty-denim-700 hover:bg-alabaster-grey-50 transition-colors"
                      >
                        {step.ctaLabel} →
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
