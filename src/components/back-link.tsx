import { ChevronLeft } from "lucide-react";
import Link from "next/link";

/** A "Back to ..." link in the same spot on every detail screen: above the heading, on the left. */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="-ml-1 mb-3 inline-flex h-9 items-center gap-1 rounded-lg pl-1 pr-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      <ChevronLeft className="size-4" aria-hidden />
      {children}
    </Link>
  );
}
