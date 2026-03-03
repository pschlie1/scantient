"use client";

import { useEffect, useState } from "react";

type OrgData = {
  user: { orgName: string };
  org: {
    limits: { tier: string; status: string; maxApps: number; maxUsers: number; trialEndsAt: string | null; cancelAtPeriodEnd: boolean };
    appCount: number;
    userCount: number;
  };
};

const plans = [
  { key: "FREE", name: "Builder", price: "$49/mo", apps: 1, users: 1, talkToSales: false },
  { key: "STARTER", name: "Starter", price: "$199/mo", apps: 5, users: 2, talkToSales: false },
  { key: "PRO", name: "Pro", price: "$399/mo", apps: 15, users: 10, talkToSales: false },
  { key: "ENTERPRISE", name: "Enterprise", price: "$1,500/mo", apps: 100, users: 50, talkToSales: true },
];

export default function BillingPage() {
  const [data, setData] = useState<OrgData | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then(setData);
  }, []);

  async function handleUpgrade(plan: string) {
    setLoading(plan);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const { url, error } = await res.json();
      if (url) {
        window.location.href = url;
      } else {
        alert(error ?? "Could not create checkout session");
      }
    } finally {
      setLoading(null);
    }
  }

  async function handleManage() {
    setLoading("portal");
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } finally {
      setLoading(null);
    }
  }

  if (!data) return <div className="text-sm text-gray-500">Loading…</div>;

  const { limits } = data.org;

  return (
    <div className="space-y-6">
      {/* Current plan */}
      <div className="rounded-lg border bg-white p-6">
        <h2 className="text-lg font-semibold">Current plan</h2>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Plan" value={limits.tier} />
          <Stat label="Status" value={limits.status} />
          <Stat label="Apps" value={`${data.org.appCount} / ${limits.maxApps}`} />
          <Stat label="Users" value={`${data.org.userCount} / ${limits.maxUsers}`} />
        </div>
        {limits.trialEndsAt && (
          <p className="mt-3 text-sm text-yellow-600">
            Trial ends {new Date(limits.trialEndsAt).toLocaleDateString()}
          </p>
        )}
        {limits.tier !== "FREE" && (
          <button
            onClick={handleManage}
            disabled={loading === "portal"}
            className="mt-4 rounded border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {loading === "portal" ? "Opening…" : "Manage billing"}
          </button>
        )}
      </div>

      {/* Plans */}
      <div className="rounded-lg border bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">Upgrade your plan</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => {
            const isCurrent = plan.key === limits.tier;
            return (
              <div key={plan.key} className={`rounded-lg border p-4 ${isCurrent ? "border-black" : ""}`}>
                <h3 className="font-semibold">{plan.name}</h3>
                <p className="text-2xl font-bold">{plan.price}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {plan.apps >= 999 ? "Unlimited" : plan.apps} apps · {plan.users >= 999 ? "Unlimited" : plan.users} users
                </p>
                {isCurrent ? (
                  <p className="mt-3 text-xs font-medium text-green-600">Current plan</p>
                ) : plan.talkToSales ? (
                  <a
                    href="mailto:sales@scantient.com"

                    className="mt-3 block w-full rounded border border-black py-1.5 text-center text-sm font-medium text-black hover:bg-gray-50"
                  >
                    Talk to sales
                  </a>
                ) : (
                  <button
                    onClick={() => handleUpgrade(plan.key)}
                    disabled={loading === plan.key}
                    className="mt-3 w-full rounded bg-black py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    {loading === plan.key ? "Loading…" : "Upgrade"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold capitalize">{value}</p>
    </div>
  );
}
