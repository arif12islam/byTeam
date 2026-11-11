"use client";

import { Ellipsis, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Wordmark } from "@/components/brand";
import { FamilyLinks } from "@/components/family-links";
import { allNavItems, navGroups, primaryTabHrefs } from "@/components/nav";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The side menu on tablets and desktops. */
export function Sidebar({ account }: { account: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <aside className="print:hidden sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar px-3 py-5 text-sidebar-foreground md:flex">
      <div className="px-3">
        <Wordmark />
      </div>

      <nav aria-label="Main" className="mt-6 flex flex-col gap-4">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="px-2.5 pb-1.5 text-xs font-medium text-muted-foreground">{group.label}</p>
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
                        "relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                        active
                          ? "bg-brand-soft font-medium text-brand-soft-foreground"
                          : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                      )}
                    >
                      {active ? <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-brand" /> : null}
                      <Icon className="size-4 shrink-0" aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="mt-5">
        <FamilyLinks variant="sidebar" />
      </div>

      <div className="mt-auto border-t border-sidebar-border px-1 pt-4">{account}</div>
    </aside>
  );
}

/** The slim bar at the top of a phone screen. */
export function MobileTopBar() {
  return (
    <header className="print:hidden sticky top-0 z-20 flex items-center border-b border-border bg-background/90 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur md:hidden">
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
            className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-border bg-card px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 shadow-card"
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
                        "flex h-full flex-col items-center gap-2 rounded-lg border px-2 py-3.5 text-center text-sm",
                        active ? "border-brand-border bg-brand-soft font-medium text-brand-soft-foreground" : "border-border",
                      )}
                    >
                      <Icon className={cn("size-5", active ? "text-brand" : "text-muted-foreground")} aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="mt-5 border-t border-border pt-4">
              <FamilyLinks variant="sheet" />
            </div>
            <div className="mt-5 border-t border-border pt-4">{account}</div>
          </div>
        </div>
      ) : null}

      <nav
        aria-label="Main"
        className="print:hidden fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)] md:hidden"
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
                    "flex flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-[11px]",
                    active ? "font-medium text-brand" : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
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
                "flex w-full flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-[11px]",
                moreActive ? "font-medium text-brand" : "text-muted-foreground",
              )}
            >
              <Ellipsis className="size-5" aria-hidden />
              More
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
