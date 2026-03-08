"use client";

/**
 * Top-level error boundary (Next.js App Router).
 *
 * Catches unhandled React rendering errors in any route segment under /app.
 * Prevents raw stack traces from being shown to users and gives them a
 * recoverable path (try again / go home).
 *
 * audit-10: Added because no error boundaries existed, meaning client-side
 * rendering errors showed raw error messages to users.
 * audit-14: Sentry.captureException is now called so errors reach the DSN.
 */

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    // Report to Sentry — only fires if NEXT_PUBLIC_SENTRY_DSN is set
    Sentry.captureException(error);
    console.error("[GlobalError]", error.digest ?? error.name);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-page p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-error/10">
        <svg
          className="h-6 w-6 text-error"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
          />
        </svg>
      </div>
      <div>
        <h1 className="text-xl font-semibold text-heading">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">
          An unexpected error occurred. Our team has been notified.
        </p>
        {error.digest && (
          <p className="mt-1 font-mono text-xs text-muted">Error ID: {error.digest}</p>
        )}
      </div>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
        >
          Try again
        </button>
        <a
          href="/dashboard"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-heading hover:bg-surface-raised"
        >
          Go to dashboard
        </a>
      </div>
    </div>
  );
}
