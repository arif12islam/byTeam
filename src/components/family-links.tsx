import { ArrowUpRight } from "lucide-react";

import { familyApps } from "@/components/nav";
import { cn } from "@/lib/utils";

/**
 * Links to the other apps in the byTeam family, such as byBlock. They open in a
 * new tab and are never "the current page", so they have no active state.
 * `sidebar` is the compact row for the side menu, `sheet` the wider row for the
 * phone's More sheet.
 */
export function FamilyLinks({ variant }: { variant: "sidebar" | "sheet" }) {
  return (
    <section aria-label="byTeam family">
      <p className={cn("pb-1.5 text-xs font-medium text-muted-foreground", variant === "sidebar" && "px-2.5")}>byTeam family</p>
      <ul className="flex flex-col gap-0.5">
        {familyApps.map(({ name, description, url, icon: Icon }) => (
          <li key={url}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "flex items-center gap-2.5 text-muted-foreground transition-colors hover:text-foreground",
                variant === "sidebar" ? "min-h-10 rounded-md px-2.5 py-1.5 text-sm hover:bg-secondary/70" : "min-h-12 rounded-lg border border-border px-3 py-2.5 text-sm hover:bg-secondary/60",
              )}
            >
              <Icon className={cn("shrink-0", variant === "sidebar" ? "size-4" : "size-5")} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate", variant === "sheet" && "font-medium text-foreground")}>{name}</span>
                <span className="block truncate text-xs">{description}</span>
              </span>
              <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
              <span className="sr-only">, opens in a new tab</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
