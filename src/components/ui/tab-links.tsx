import Link from "next/link";

import { cn } from "@/lib/utils";

export type TabLink = { href: string; label: string; count?: number };

/**
 * Tabs that are links, so the tab lives in the address and works without
 * script. `active` is the href of the current tab. On a phone the bar scrolls
 * sideways inside itself and never widens the page.
 */
export function TabLinks({ tabs, active, ariaLabel }: { tabs: readonly TabLink[]; active: string; ariaLabel: string }) {
  return (
    <nav aria-label={ariaLabel} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max min-w-full gap-1 border-b border-border">
        {tabs.map((tab) => {
          const current = tab.href === active;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "-mb-px flex min-h-10 items-center gap-2 border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors",
                  current ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
                {tab.count !== undefined ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-xs tabular-nums",
                      current ? "bg-brand-soft text-brand-soft-foreground" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {tab.count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
