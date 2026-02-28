"use client";

import { useEffect, useState } from "react";

export default function SSOPage() {
  const [tier, setTier] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/org/limits")
      .then((res) => res.json())
      .then((data) => setTier(data.tier ?? "FREE"))
      .catch(() => setTier("FREE"));
  }, []);

  if (tier === null) {
    return <div className="p-8 text-center text-gray-500">Loading…</div>;
  }

  const isEnterprise = tier === "ENTERPRISE";

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <h2 className="text-xl font-semibold">SSO / SAML Integration</h2>
        <span className="rounded-full bg-purple-100 px-3 py-0.5 text-xs font-semibold text-purple-700">
          Enterprise
        </span>
      </div>

      {!isEnterprise ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-purple-100">
            <svg className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          </div>
          <h3 className="mb-2 text-lg font-semibold text-gray-900">SSO is available on the Enterprise plan</h3>
          <p className="mb-6 text-sm text-gray-600">
            Enable SAML-based single sign-on to let your team authenticate through your identity provider (Okta, Azure AD, Google Workspace, etc.).
          </p>
          <a
            href="/settings/billing"
            className="inline-block rounded-lg bg-black px-6 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition"
          >
            Upgrade to Enterprise
          </a>
        </div>
      ) : (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
            <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <h3 className="mb-2 text-lg font-semibold text-gray-900">Coming Soon</h3>
          <p className="text-sm text-gray-600">
            SSO/SAML integration is under development. We&apos;ll notify you when it&apos;s ready.
          </p>
        </div>
      )}
    </div>
  );
}
