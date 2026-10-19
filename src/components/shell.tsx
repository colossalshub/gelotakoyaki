"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/actions/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Actor } from "@/domain/permissions";

const LINKS = [
  ["/dashboard", "Dashboard"],
  ["/inventory", "Inventory"],
  ["/receive", "Receive stock"],
  ["/usage", "Record usage"],
  ["/transfers", "Transfers"],
  ["/counts", "Stock counts"],
  ["/waste", "Waste"],
  ["/recipes", "Recipes and sales"],
  ["/reports", "Reports"],
  ["/settings", "Settings"],
] as const;

export function Shell({
  actor,
  theme,
  children,
}: {
  actor: Actor;
  theme: "light" | "dark";
  children: React.ReactNode;
}) {
  const path = usePathname();
  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <a className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-paper focus:px-3 focus:py-2" href="#main">
        Skip to content
      </a>
      <aside className="hidden border-r border-line bg-canvas md:flex md:flex-col">
        <div className="border-b border-line px-4 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Gelos Takoyaki</p>
          <p className="mt-1 text-lg font-semibold">Inventory</p>
        </div>
        <nav className="flex-1 py-3" aria-label="Primary">
          {LINKS.map(([href, label]) => (
            <Link key={href} className="nav-link" href={href} aria-current={path.startsWith(href) ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-line p-4 text-sm">
          <p className="font-medium">{actor.name}</p>
          <p className="text-muted">{roleLabel(actor.role)}</p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-paper px-4 py-3">
          <div>
            <p className="text-sm font-semibold md:hidden">Gelos Inventory</p>
            <p className="text-sm text-muted">{actor.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle initial={theme} />
            <Link className="btn btn-small" href="/account">
              Account
            </Link>
            <form action={logoutAction}>
              <button className="btn btn-small" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 md:pb-8">
          {children}
        </main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-paper md:hidden" aria-label="Mobile">
        {[
          ["/dashboard", "Home"],
          ["/inventory", "Stock"],
          ["/receive", "Receive"],
          ["/counts", "Count"],
          ["/more", "More"],
        ].map(([href, label]) => (
          <Link key={href} className="flex min-h-14 items-center justify-center text-sm" href={href} aria-current={path.startsWith(href) ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function roleLabel(role: Actor["role"]) {
  if (role === "OWNER") return "Owner";
  if (role === "BRANCH_MANAGER") return "Branch manager";
  return "Staff";
}
