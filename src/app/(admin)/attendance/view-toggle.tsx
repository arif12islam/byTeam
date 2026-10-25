"use client";

import { CalendarDays, Table2 } from "lucide-react";
import { useTransition } from "react";

import { cn } from "@/lib/utils";

import type { AttendanceView } from "./view";
import { setAttendanceView } from "./view-actions";

/**
 * Switches the wide screen between a calendar per person and the full table.
 * The choice is kept in a cookie so it sticks while moving between dates.
 * Phones always get the calendars, so this only shows from `md` up.
 */
export function ViewToggle({ view }: { view: AttendanceView }) {
  const [pending, startTransition] = useTransition();

  function choose(next: AttendanceView) {
    if (next === view) return;
    startTransition(() => setAttendanceView(next));
  }

  const options = [
    { value: "calendar", label: "Calendar", icon: CalendarDays },
    { value: "table", label: "Table", icon: Table2 },
  ] as const;

  return (
    <div role="group" aria-label="View" className={cn("hidden rounded-lg border border-border bg-card p-0.5 shadow-card md:flex", pending && "opacity-70")}>
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={view === value}
          onClick={() => choose(value)}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-md px-3 text-sm transition-colors",
            view === value ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-4" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}
