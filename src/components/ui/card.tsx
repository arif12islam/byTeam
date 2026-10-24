import * as React from "react";

import { cn } from "@/lib/utils";

/** A raised white panel. Rounded and padded for thumbs as well as cursors. */
function Card({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="card"
      className={cn("rounded-xl border border-border bg-card p-4 shadow-card sm:p-5", className)}
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
  className,
}: {
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  children: React.ReactNode;
  count?: number | string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
        {Icon ? (
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : null}
        <span className="truncate">{children}</span>
        {count !== undefined ? (
          <span className="rounded-md bg-secondary px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
            {count}
          </span>
        ) : null}
      </h2>
      {action}
    </div>
  );
}

export { Card, CardTitle };
