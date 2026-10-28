import Link from "next/link";

import { cn } from "@/lib/utils";

/** The byTeam mark: a white "b" (a stem and a round bowl) on a near-black tile. Matches src/app/icon.svg. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("grid size-7 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground", className)}>
      <svg viewBox="0 0 32 32" className="size-full">
        <path d="M11.5 6.5v19" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" />
        <circle cx="18.2" cy="18.6" r="5.4" fill="none" stroke="currentColor" strokeWidth="3.6" />
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
