import Link from "next/link";

import { cn } from "@/lib/utils";

/** The byTeam mark: a rounded tile with a tick, the check in an attendance register. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="9" className="fill-forest-active" />
      <path d="M9 16.5l4.6 4.6L23 11.6" fill="none" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
