"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">(
    token ? "loading" : "error",
  );
  const [errorMessage, setErrorMessage] = useState(
    token ? "" : "No verification token found. Please check your email link.",
  );

  useEffect(() => {
    if (!token) return;

    async function verify() {
      try {
        const res = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(token!)}`, {
          method: "GET",
        });

        if (res.ok) {
          setStatus("success");
          setTimeout(() => router.push("/dashboard"), 2000);
        } else {
          const data = await res.json() as { error?: string };
          setStatus("error");
          setErrorMessage(data.error ?? "Verification failed. The link may have expired.");
        }
      } catch {
        setStatus("error");
        setErrorMessage("Network error. Please try again.");
      }
    }

    void verify();
  }, [token, router]);

  return (
    <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-raised">
          <span className="text-xl font-bold text-white">V</span>
        </div>

        {status === "loading" && (
          <>
            <h1 className="text-2xl font-bold">Verifying your email…</h1>
            <p className="mt-2 text-sm text-muted">Please wait</p>
          </>
        )}

        {status === "success" && (
          <>
            <h1 className="text-2xl font-bold text-success">Email verified!</h1>
            <p className="mt-2 text-sm text-muted">
              Your email has been verified. Redirecting to dashboard…
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <h1 className="text-2xl font-bold text-error">Verification failed</h1>
            <p className="mt-2 text-sm text-muted">{errorMessage}</p>
            <Link
              href="/login"
              className="mt-4 inline-block text-sm font-medium text-heading hover:underline"
            >
              Back to sign in
            </Link>
          </>
        )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div>Loading…</div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
