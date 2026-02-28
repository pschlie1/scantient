"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ssoEmail, setSsoEmail] = useState("");
  const [ssoLoading, setSsoLoading] = useState(false);
  const [ssoError, setSsoError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        router.push("/dashboard");
      } else {
        const data = await res.json() as { error?: string };
        setError(data.error ?? "Login failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSsoSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSsoError("");
    setSsoLoading(true);
    try {
      const domain = ssoEmail.split("@")[1]?.toLowerCase();
      if (!domain) {
        setSsoError("Please enter a valid work email");
        setSsoLoading(false);
        return;
      }
      window.location.href = `/api/auth/sso/init?domain=${encodeURIComponent(domain)}`;
    } catch {
      setSsoError("Network error");
    } finally {
      setSsoLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-black">
            <span className="text-xl font-bold text-white">V</span>
          </div>
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="mt-1 text-sm text-gray-500">Sign in to your VibeSafe account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border bg-white p-6 shadow-sm">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Email</label>
            <input type="email" required className="w-full rounded-lg border px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Password</label>
            <input type="password" required className="w-full rounded-lg border px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="text-right">
            <Link href="/forgot-password" className="text-xs text-gray-500 hover:text-black hover:underline">Forgot password?</Link>
          </div>
          <button type="submit" disabled={loading} className="w-full rounded-lg bg-black py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50">
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <div className="flex-1 border-t border-gray-200" />
          <span className="text-xs text-gray-400">— OR —</span>
          <div className="flex-1 border-t border-gray-200" />
        </div>

        <form onSubmit={handleSsoSubmit} className="space-y-3 rounded-xl border bg-white p-6 shadow-sm">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Sign in with SSO</label>
            <input type="email" required placeholder="you@yourcompany.com" className="w-full rounded-lg border px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black" value={ssoEmail} onChange={(e) => setSsoEmail(e.target.value)} />
            <p className="mt-1 text-xs text-gray-500">Enter your work email to sign in via your company&apos;s identity provider.</p>
          </div>
          {ssoError && <p className="text-xs text-red-600">{ssoError}</p>}
          <button type="submit" disabled={ssoLoading} className="w-full rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50">
            {ssoLoading ? "Redirecting…" : "Continue with SSO →"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-500">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium text-black hover:underline">Start free trial</Link>
        </p>
      </div>
    </div>
  );
}
