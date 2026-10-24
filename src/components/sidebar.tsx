"use client";

import { Ellipsis, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { accentClasses } from "@/components/accent";
import { Wordmark } from "@/components/brand";
import { allNavItems, navGroups, primaryTabHrefs } from "@/components/nav";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The green side menu on tablets and desktops. */
export function Sidebar({ account }: { account: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-y-auto bg-sidebar px-3 py-6 text-sidebar-foreground md:flex">
      <div className="px-3">
        <Wordmark />
      </div>

      <nav aria-label="Main" className="mt-9 flex flex-col gap-6">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-2 text-xs font-medium text-forest-muted">{group.label}</p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-forest-line font-medium text-white"
                          : "text-forest-foreground/80 hover:bg-forest-line/70 hover:text-forest-foreground",
                      )}
                    >
                      <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", accentClasses[item.accent].solid, !active && "opacity-85")}>
                        <Icon className="size-4" aria-hidden />
                      </span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="mt-auto border-t border-sidebar-border px-3 pt-4">{account}</div>
    </aside>
  );
}

/** The slim green bar at the top of a phone screen. */
export function MobileTopBar() {
  return (
    <header className="sticky top-0 z-20 flex items-center bg-forest px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] md:hidden">
      <Wordmark />
    </header>
  );
}

/**
 * Four main screens plus a More sheet, fixed at the bottom of a phone screen
 * where the thumb is. The sheet holds every other screen and the account.
 */
export function MobileTabBar({ account }: { account: React.ReactNode }) {
  const pathname = usePathname();
  // The sheet is open only for the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  const tabs = primaryTabHrefs.map((href) => allNavItems.find((item) => item.href === href)!);
  const more = allNavItems.filter((item) => !(primaryTabHrefs as readonly string[]).includes(item.href));
  const moreActive = more.some((item) => isActive(pathname, item.href));

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenOn(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpenOn(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="More screens"
            className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-card px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 shadow-card"
          >
            <div className="mx-auto h-1 w-10 rounded-full bg-border" aria-hidden />
            <div className="mt-3 flex items-center justify-between">
              <p className="text-base font-semibold">More</p>
              <button
                type="button"
                aria-label="Close menu"
                className="grid size-9 place-items-center rounded-full bg-secondary"
                onClick={() => setOpenOn(null)}
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <ul className="mt-4 grid grid-cols-3 gap-2.5">
              {more.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-full flex-col items-center gap-2 rounded-2xl border px-2 py-3.5 text-center text-sm",
                        active ? "border-primary bg-accent font-medium text-accent-foreground" : "border-border bg-background",
                      )}
                    >
                      <span className={cn("grid size-10 place-items-center rounded-xl", accentClasses[item.accent].solid)}>
                        <Icon className="size-5" aria-hidden />
                      </span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="mt-5 border-t border-border pt-4">{account}</div>
          </div>
        </div>
      ) : null}

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-forest-line bg-forest pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="mx-auto flex max-w-md items-stretch justify-around px-1">
          {tabs.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-xs",
                    active ? "font-medium text-white" : "text-forest-muted",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-7 w-14 place-items-center rounded-full transition-colors",
                      active && accentClasses[item.accent].solid,
                    )}
                  >
                    <Icon className="size-5" aria-hidden />
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={open}
              onClick={() => setOpenOn(pathname)}
              className={cn(
                "flex w-full flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-xs",
                moreActive ? "font-medium text-white" : "text-forest-muted",
              )}
            >
              <span className={cn("grid h-7 w-14 place-items-center rounded-full", moreActive && "bg-forest-active")}>
                <Ellipsis className="size-5" aria-hidden />
              </span>
              More
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
