import * as React from "react";

import { accentClasses, type Accent } from "@/components/accent";
import { cn } from "@/lib/utils";

/** A raised white panel. Rounded and padded for thumbs as well as cursors. */
function Card({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="card"
      className={cn("rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5", className)}
      {...props}
    />
  );
}

/** A panel heading with an optional icon chip, count and action on the right. */
function CardTitle({
  icon: Icon,
  children,
  count,
  action,
  accent = "green",
  className,
}: {
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  children: React.ReactNode;
  count?: number | string;
  action?: React.ReactNode;
  /** The color of the icon chip. Defaults to the brand green. */
  accent?: Accent;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <h2 className="flex min-w-0 items-center gap-2.5 text-base font-semibold tracking-tight">
        {Icon ? (
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", accentClasses[accent].solid)}>
            <Icon className="size-4" aria-hidden />
          </span>
        ) : null}
        <span className="truncate">{children}</span>
        {count !== undefined ? (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
            {count}
          </span>
        ) : null}
      </h2>
      {action}
    </div>
  );
}

export { Card, CardTitle };
