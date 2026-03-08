"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Missing reset token. Please request a new reset link.");
    }
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (res.ok) {
        router.push("/login?reset=1");
      } else {
        const data = await res.json();
        setError(data.error ?? "Failed to reset password");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-raised">
            <span className="text-xl font-bold text-white">V</span>
          </div>
          <h1 className="text-2xl font-bold">Set new password</h1>
          <p className="mt-1 text-sm text-muted">Enter a new password for your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-surface p-6 shadow-sm">
          <div>
            <label className="mb-1 block text-xs font-medium text-heading">New password</label>
            <input
              type="password"
              required
              minLength={8}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-primary-hover focus:outline-none focus:ring-1 focus:ring-primary-hover"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-heading">Confirm new password</label>
            <input
              type="password"
              required
              minLength={8}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-primary-hover focus:outline-none focus:ring-1 focus:ring-primary-hover"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>

          {error && <p className="text-xs text-error">{error}</p>}

          <button
            type="submit"
            disabled={loading || !token}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
          >
            {loading ? "Updating…" : "Reset password"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-muted">
          <Link href="/login" className="font-medium text-heading hover:underline">
            Back to sign in
          </Link>
        </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div>Loading…</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
