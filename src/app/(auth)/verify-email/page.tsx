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
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-black">
          <span className="text-xl font-bold text-white">V</span>
        </div>

        {status === "loading" && (
          <>
            <h1 className="text-2xl font-bold">Verifying your email…</h1>
            <p className="mt-2 text-sm text-gray-500">Please wait</p>
          </>
        )}

        {status === "success" && (
          <>
            <h1 className="text-2xl font-bold text-green-600">Email verified!</h1>
            <p className="mt-2 text-sm text-gray-500">
              Your email has been verified. Redirecting to dashboard…
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <h1 className="text-2xl font-bold text-red-600">Verification failed</h1>
            <p className="mt-2 text-sm text-gray-500">{errorMessage}</p>
            <Link
              href="/login"
              className="mt-4 inline-block text-sm font-medium text-black hover:underline"
            >
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading…</div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
