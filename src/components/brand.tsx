import Link from "next/link";

import { cn } from "@/lib/utils";

/** The byTeam mark: a bright rounded tile with a tick, the check in an attendance register. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("grid size-8 shrink-0 place-items-center rounded-[10px] bg-emerald-500 shadow-sm", className)}
    >
      <svg viewBox="0 0 32 32" className="size-full p-[18%]">
        <path d="M6 17l6.5 6.5L26 9.5" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/** Mark and name, linking home. For dark backgrounds. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link href="/today" className={cn("flex items-center gap-2.5 text-lg font-semibold tracking-tight text-forest-foreground", className)}>
      <BrandMark />
      <span className="flex items-baseline">
        <span className="text-forest-muted">by</span>
        <span>Team</span>
      </span>
    </Link>
  );
}
