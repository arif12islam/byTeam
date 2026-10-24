import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { formatMonth, shiftMonth } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * Previous and next month arrows around the month name, with room on the right
 * for actions such as a download. `basePath` is the screen the links point to.
 */
export function MonthNav({
  basePath,
  month,
  thisMonth,
  children,
}: {
  basePath: string;
  month: string;
  thisMonth: string;
  children?: React.ReactNode;
}) {
  return (
    <nav aria-label="Month" className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-card">
        <Link
          href={`${basePath}?month=${shiftMonth(month, -1)}`}
          aria-label="Previous month"
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-9")}
        >
          <ChevronLeft aria-hidden />
        </Link>
        <h2 className="min-w-28 px-1 text-center text-base font-semibold tabular-nums">{formatMonth(month)}</h2>
        <Link
          href={`${basePath}?month=${shiftMonth(month, 1)}`}
          aria-label="Next month"
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-9")}
        >
          <ChevronRight aria-hidden />
        </Link>
      </div>
      {month !== thisMonth ? (
        <Link href={basePath} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          This month
        </Link>
      ) : null}
      {children ? <div className="flex items-center gap-2 sm:ml-auto">{children}</div> : null}
    </nav>
  );
}
