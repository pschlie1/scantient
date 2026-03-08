"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    setSubmitted(true);
    setLoading(false);
  }

  return (
    <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-raised">
            <span className="text-xl font-bold text-white">V</span>
          </div>
          <h1 className="text-2xl font-bold">Reset your password</h1>
          <p className="mt-1 text-sm text-muted">Enter your email and we&apos;ll send a reset link</p>
        </div>

        {submitted ? (
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm text-center">
            <p className="text-sm text-heading">
              If that email exists, we sent a reset link. Check your inbox.
            </p>
            <Link
              href="/login"
              className="mt-4 inline-block text-sm font-medium text-heading hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-surface p-6 shadow-sm">
            <div>
              <label className="mb-1 block text-xs font-medium text-heading">Email</label>
              <input
                type="email"
                required
                className="w-full rounded-lg border px-3 py-2 text-sm focus:border-primary-hover focus:outline-none focus:ring-1 focus:ring-primary-hover"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        <p className="mt-4 text-center text-sm text-muted">
          Remembered your password?{" "}
          <Link href="/login" className="font-medium text-heading hover:underline">
            Sign in
          </Link>
        </p>
    </div>
  );
}
