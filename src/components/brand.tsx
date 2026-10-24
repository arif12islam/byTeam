import Link from "next/link";

import { cn } from "@/lib/utils";

/** The byTeam mark: a small dark tile with a tick, the check in an attendance register. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("grid size-7 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground", className)}>
      <svg viewBox="0 0 32 32" className="size-full p-[22%]">
        <path d="M6 17l6.5 6.5L26 9.5" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/** Mark and name, linking home. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link href="/today" className={cn("flex items-center gap-2 text-base font-semibold tracking-tight text-foreground", className)}>
      <BrandMark />
      byTeam
    </Link>
  );
}
