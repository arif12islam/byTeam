"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { navGroups } from "@/components/nav";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Wordmark() {
  return (
    <Link
      href="/today"
      className="flex items-baseline text-lg font-semibold tracking-tight"
    >
      <span className="text-muted-foreground">by</span>
      <span>Team</span>
    </Link>
  );
}

export function Sidebar({ account }: { account: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-5 md:flex">
      <div className="px-3">
        <Wordmark />
      </div>

      <nav aria-label="Main" className="mt-8 flex flex-col gap-6">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1.5 text-xs font-medium text-muted-foreground">
              {group.label}
            </p>
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
                        "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-accent font-medium text-accent-foreground"
                          : "text-foreground/80 hover:bg-secondary hover:text-foreground",
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
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

export function MobileNav({ account }: { account: React.ReactNode }) {
  const pathname = usePathname();
  const items = navGroups.flatMap((group) => group.items);

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-sidebar md:hidden">
      <div className="flex items-center justify-between gap-4 px-4 pt-3">
        <Wordmark />
        {account}
      </div>
      <nav aria-label="Main" className="overflow-x-auto px-2 pb-2 pt-2">
        <ul className="flex w-max gap-1">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "block rounded-md px-3 py-1.5 text-sm",
                    active
                      ? "bg-accent font-medium text-accent-foreground"
                      : "text-foreground/80",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
