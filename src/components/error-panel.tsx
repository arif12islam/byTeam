import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

type ErrorPanelProps = {
  /** The reference number Next gives an error, so the office can quote it to whoever looks after the system. */
  digest?: string;
  /** Shown as the first button. Omit when there is nothing to retry. */
  onRetry?: () => void;
};

/**
 * What people see when a screen cannot load. It says what happened in plain
 * words, offers a way forward, and never shows the error text itself, which can
 * name tables or addresses.
 */
export function ErrorPanel({ digest, onRetry }: ErrorPanelProps) {
  return (
    <div role="alert" className="mx-auto mt-10 max-w-lg rounded-lg border border-border bg-card p-6 md:p-8">
      <h1 className="text-xl font-semibold tracking-tight">This page could not load</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Nothing you entered was lost, and nothing was changed by this error. It is often a short break in the connection to
        the database, so trying again in a moment usually works.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {onRetry ? (
          <button type="button" onClick={onRetry} className={buttonVariants()}>
            Try again
          </button>
        ) : null}
        <Link href="/today" className={buttonVariants({ variant: "outline" })}>
          Go to Today
        </Link>
      </div>
      {digest ? (
        <p className="mt-5 text-xs text-muted-foreground">
          If it keeps happening, tell whoever looks after byTeam and give them this reference: <span className="font-mono">{digest}</span>
        </p>
      ) : null}
    </div>
  );
}

/** The page for an address or record that does not exist. */
export function NotFoundPanel() {
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-lg border border-border bg-card p-6 md:p-8">
      <h1 className="text-xl font-semibold tracking-tight">We could not find that page</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The link may be old, or the person or record may have been removed. Use the menu to find what you need.
      </p>
      <div className="mt-5">
        <Link href="/today" className={buttonVariants()}>
          Go to Today
        </Link>
      </div>
    </div>
  );
}
