"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/settings/billing", label: "Billing" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/alerts", label: "Alerts" },
  { href: "/settings/api-keys", label: "API Keys" },
  { href: "/settings/sso", label: "SSO" },
  { href: "/settings/integrations/jira", label: "Jira" },
  { href: "/settings/connectors", label: "Connectors" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="py-8">
      <h1 className="mb-6 text-2xl font-bold text-heading">Settings</h1>
      <div className="mb-6 flex gap-1 border-b border-border-subtle">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition ${
              pathname === tab.href
                ? "border-primary text-heading"
                : "border-transparent text-muted hover:text-heading"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}
