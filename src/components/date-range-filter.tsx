"use client";

import { CalendarRange, Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { MAX_PERIOD_DAYS, periodDays, type PeriodNav } from "@/lib/period";
import { cn } from "@/lib/utils";

/**
 * Picks the stretch of days a screen shows: back and forward arrows, a button
 * with the current range that opens quick choices (this month, last 3 months,
 * this year) and a custom From and To. The panel floats over the page, so
 * opening it never moves anything. `children` sit on the right, for downloads.
 * Give it a `key` that changes with the period so its boxes start fresh each time.
 */
export function DateRangeFilter({ basePath, nav, children }: { basePath: string; nav: PeriodNav; children?: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(nav.from);
  const [to, setTo] = useState(nav.to);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  function apply(event: React.FormEvent) {
    event.preventDefault();
    if (!from || !to) return setError("Pick both dates.");
    const [a, b] = from <= to ? [from, to] : [to, from];
    const days = periodDays({ from: a, to: b });
    if (days > MAX_PERIOD_DAYS) return setError("That is more than a year. Pick a shorter stretch.");
    setError("");
    setOpen(false);
    router.push(`${basePath}?from=${a}&to=${b}`);
  }

  const arrow = cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-9");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div ref={root} className="relative flex items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-card">
        <Link href={nav.prevHref} aria-label="Earlier" className={arrow}>
          <ChevronLeft aria-hidden />
        </Link>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="flex h-9 w-52 items-center gap-2 rounded-md px-2.5 text-left text-sm font-semibold hover:bg-secondary sm:w-60"
        >
          <CalendarRange className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate tabular-nums">{nav.label}</span>
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
        </button>
        <Link href={nav.nextHref} aria-label="Later" className={arrow}>
          <ChevronRight aria-hidden />
        </Link>

        {open ? (
          <div
            role="dialog"
            aria-label="Choose dates"
            className="absolute left-0 top-full z-30 mt-2 w-[min(23rem,calc(100vw-2rem))] rounded-lg border border-border bg-popover p-3 shadow-lg"
          >
            <p className="px-1 pb-1.5 text-xs font-medium text-muted-foreground">Quick choices</p>
            <ul className="grid grid-cols-2 gap-1.5">
              {nav.presets.map((preset) => (
                <li key={preset.key}>
                  <Link
                    href={preset.href}
                    onClick={() => setOpen(false)}
                    aria-current={preset.active ? "true" : undefined}
                    className={cn(
                      "flex h-full items-start gap-1.5 rounded-md border px-2.5 py-2 text-sm transition-colors",
                      preset.active ? "border-primary bg-accent text-accent-foreground" : "border-border hover:bg-secondary",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{preset.label}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{preset.span}</span>
                    </span>
                    {preset.active ? <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : null}
                  </Link>
                </li>
              ))}
            </ul>

            <form onSubmit={apply} className="mt-3 border-t border-border pt-3">
              <p className="px-1 pb-1.5 text-xs font-medium text-muted-foreground">Custom dates</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="min-w-0 text-xs text-muted-foreground">
                  From
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    required
                    className="mt-1 block h-10 w-full min-w-0 rounded-md border border-input bg-card px-2.5 text-left text-base text-foreground sm:h-9 sm:text-sm"
                  />
                </label>
                <label className="min-w-0 text-xs text-muted-foreground">
                  To
                  <input
                    type="date"
                    value={to}
                    min={from || undefined}
                    onChange={(e) => setTo(e.target.value)}
                    required
                    className="mt-1 block h-10 w-full min-w-0 rounded-md border border-input bg-card px-2.5 text-left text-base text-foreground sm:h-9 sm:text-sm"
                  />
                </label>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <Button type="submit" size="sm">
                  Show these dates
                </Button>
                <p role="alert" className="min-h-4 flex-1 text-xs text-danger">
                  {error}
                </p>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">Up to a year at a time.</p>
            </form>
          </div>
        ) : null}
      </div>
      {children ? <div className="flex items-center gap-2 sm:ml-auto">{children}</div> : null}
    </div>
  );
}
