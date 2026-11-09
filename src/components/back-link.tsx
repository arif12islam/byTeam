"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { backLinkCanGoBack, getPreviousKey, requestRestore } from "@/lib/scroll-memory";

/**
 * A "Back to ..." link in the same spot on every detail screen: above the
 * heading, on the left. When the page before this one is the page it points
 * to, it goes back in the browser history, so the list is exactly as it was
 * (same filters, same place). Otherwise it opens the page and puts it back
 * where it was last time.
 */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter();

  return (
    <Link
      href={href}
      scroll={false}
      onClick={(event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        let store: Storage | undefined;
        try {
          store = window.sessionStorage;
        } catch {
          store = undefined;
        }
        const previous = getPreviousKey(store);
        if (previous !== null && backLinkCanGoBack(previous, href) && window.history.length > 1) {
          event.preventDefault();
          // Tell the page that comes back that this is a return, so it is put back where it was.
          requestRestore(store, previous);
          router.back();
          return;
        }
        requestRestore(store, href);
      }}
      className="-ml-1 mb-3 inline-flex h-9 items-center gap-1 rounded-lg pl-1 pr-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      <ChevronLeft className="size-4" aria-hidden />
      {children}
    </Link>
  );
}
