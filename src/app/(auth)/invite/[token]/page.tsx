"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface InviteDetails {
  email: string;
  orgName: string;
  role: string;
}

export default function InviteAcceptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [fetchError, setFetchError] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchInvite() {
      try {
        const res = await fetch(`/api/auth/invite/${encodeURIComponent(token)}`);
        const data = await res.json() as InviteDetails & { error?: string };
        if (data.error) {
          setFetchError(data.error);
        } else {
          setInvite(data);
        }
      } catch {
        setFetchError("Failed to load invite details");
      }
    }

    void fetchInvite();
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`/api/auth/invite/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });

      if (res.ok) {
        router.push("/dashboard");
      } else {
        const data = await res.json() as { error?: string };
        setError(data.error ?? "Failed to accept invite");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-black">
            <span className="text-xl font-bold text-white">V</span>
          </div>

          {fetchError ? (
            <>
              <h1 className="text-2xl font-bold text-red-600">Invite unavailable</h1>
              <p className="mt-1 text-sm text-gray-500">{fetchError}</p>
              <Link
                href="/login"
                className="mt-4 inline-block text-sm font-medium text-black hover:underline"
              >
                Back to sign in
              </Link>
            </>
          ) : invite ? (
            <>
              <h1 className="text-2xl font-bold">You&apos;ve been invited!</h1>
              <p className="mt-1 text-sm text-gray-500">
                Join <strong>{invite.orgName}</strong> as{" "}
                <span className="capitalize">{invite.role.toLowerCase()}</span>
              </p>
              <p className="mt-1 text-xs text-gray-400">{invite.email}</p>
            </>
          ) : (
            <h1 className="text-2xl font-bold">Loading invite…</h1>
          )}
        </div>

        {invite && !fetchError && (
          <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border bg-white p-6 shadow-sm">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Your name</label>
              <input
                type="text"
                required
                minLength={2}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Password</label>
              <input
                type="password"
                required
                minLength={8}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-black py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
            >
              {loading ? "Creating account…" : "Accept invite & join"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
