"use client";

import Link from "next/link";
import { useState } from "react";

export default function SignupPage() {
  const [form, setForm] = useState({ name: "", email: "", password: "", orgName: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        setSuccess(true);
      } else {
        const data = await res.json();
        setError(typeof data.error === "string" ? data.error : "Signup failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-surface-raised text-4xl">
            ✉️
          </div>
          <h1 className="text-2xl font-bold">Check your email</h1>
          <p className="mt-3 text-sm text-muted leading-relaxed">
            We sent a verification link to{" "}
            <span className="font-medium text-heading">{form.email}</span>.
            Click it to activate your account.
          </p>
          <p className="mt-6 text-xs text-muted">
            Already verified?{" "}
            <Link href="/dashboard" className="font-medium text-heading hover:underline">
              Go to dashboard →
            </Link>
          </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-raised">
            <span className="text-xl font-bold text-white">V</span>
          </div>
          <h1 className="text-2xl font-bold">Get started with Scantient</h1>
          <p className="mt-1 text-sm text-muted">Setup in 2 minutes. SOC 2 aligned.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-surface p-6 shadow-sm">
          <div>
            <label className="mb-1 block text-xs font-medium text-heading">Your name</label>
            <input
              type="text"
              required
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-primary-hover focus:outline-none focus:ring-1 focus:ring-primary-hover"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-heading">Company name</label>
            <input
              type="text"
              required
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-primary-hover focus:outline-none focus:ring-1 focus:ring-primary-hover"
              value={form.orgName}
              onChange={(e) => setForm({ ...form, orgName: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-heading">Work email</label>
            <input
              type="email"
              required
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-primary-hover focus:outline-none focus:ring-1 focus:ring-primary-hover"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-heading">Password</label>
            <input
              type="password"
              required
              minLength={12}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-primary-hover focus:outline-none focus:ring-1 focus:ring-primary-hover"
              placeholder="Min 12 characters"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>

          {error && <p className="text-xs text-error">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
          >
            {loading ? "Creating account…" : "Get started"}
          </button>

          <p className="text-center text-xs text-muted">
            By signing up, you agree to our Terms of Service
          </p>
        </form>

        <p className="mt-4 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-heading hover:underline">
            Sign in
          </Link>
        </p>
    </div>
  );
}
