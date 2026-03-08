"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { SessionUser } from "@/lib/auth";

const baseNavItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/reports", label: "Reports" },
  { href: "/ops", label: "Ops" },
  { href: "/readiness", label: "Readiness" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [showMsp, setShowMsp] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setUser(data.user));
  }, []);

  useEffect(() => {
    fetch("/api/msp/client-count")
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then((data: { count: number }) => setShowMsp(data.count > 0))
      .catch(() => setShowMsp(false));
  }, []);

  const navItems = showMsp
    ? [
        ...baseNavItems.slice(0, 1),
        { href: "/dashboard/msp", label: "MSP View" },
        ...baseNavItems.slice(1),
      ]
    : baseNavItems;

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <nav className="border-b border-border-subtle bg-surface">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-raised">
              <span className="text-sm font-bold text-heading">V</span>
            </div>
            <span className="text-sm font-bold text-heading">Scantient</span>
          </Link>

          <div className="hidden items-center gap-1 sm:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  pathname.startsWith(item.href)
                    ? "bg-surface-raised font-medium text-heading"
                    : "text-muted hover:text-heading"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {user && (
            <>
              <span className="hidden text-xs text-muted sm:inline">{user.orgName}</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-raised text-xs font-medium text-heading">
                {(user.name ?? user.email)[0].toUpperCase()}
              </div>
              <button
                onClick={handleLogout}
                className="text-xs text-muted hover:text-heading"
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
