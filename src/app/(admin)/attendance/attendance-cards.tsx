import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { toneClasses } from "@/components/ui/tone";
import { statusFill } from "@/components/status";
import { statusLabel } from "@/lib/attendance/labels";
import type { GridCell, MonthGrid } from "@/lib/attendance/month";
import { formatDuration, formatMonth, weekdayOf } from "@/lib/time";
import { cn } from "@/lib/utils";

const weekdayInitials = ["S", "M", "T", "W", "T", "F", "S"];

function describeCell(date: string, cell: GridCell): string {
  const parts = [`${date}: ${statusLabel[cell.status]}`];
  if (cell.status === "late") parts.push(`${formatDuration(cell.lateMinutes)} late`);
  if (cell.missingOut) parts.push("no leaving punch");
  if (cell.workedOnOffDay) parts.push("came in on a day off");
  if (cell.isManual) parts.push("corrected by hand");
  return parts.join(", ");
}

/** The colors, in one quiet row. */
export function AttendanceLegend({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground", className)} aria-label="Colors">
      {(
        [
          ["success", "Present"],
          ["warning", "Late"],
          ["danger", "Absent"],
          ["info", "Leave"],
          ["off", "Day off"],
        ] as const
      ).map(([tone, text]) => (
        <li key={text} className="flex items-center gap-1.5">
          <span aria-hidden className={cn("size-2.5 rounded-[4px]", toneClasses[tone].solid)} />
          {text}
        </li>
      ))}
    </ul>
  );
}

/** One figure in the row under a name: a dot, the number and the word. Zero is muted. */
function InlineStat({ tone, value, word }: { tone: "success" | "warning" | "danger" | "info"; value: number; word: string }) {
  return (
    <li className={cn("flex items-center gap-1.5 tabular-nums", value === 0 && "text-muted-foreground")}>
      <span aria-hidden className={cn("size-2 rounded-full", value === 0 ? "bg-muted-foreground/30" : toneClasses[tone].solid)} />
      <span className={cn(value > 0 && "font-semibold text-foreground")}>{value}</span>
      {word}
    </li>
  );
}

/**
 * One card per person with a small calendar, each day colored by what
 * happened. Tap a day to see the punches behind it. One column on phones,
 * two or three side by side on wider screens.
 */
export function AttendanceCards({
  grid,
  trackLeavingPunch = true,
  dayQuery = "",
  today,
}: {
  grid: MonthGrid;
  trackLeavingPunch?: boolean;
  /** Added to each day link, for example "?from=person" so the day page knows where to go back to. */
  dayQuery?: string;
  /** Today's date, to ring today's day. */
  today?: string;
}) {
  // One small calendar per month the period touches. A single month shows no month heading.
  const months: { month: string; dates: string[] }[] = [];
  for (const date of grid.dates) {
    const month = date.slice(0, 7);
    const last = months.at(-1);
    if (last?.month === month) last.dates.push(date);
    else months.push({ month, dates: [date] });
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {grid.rows.map((row) => (
        <section
          key={row.employee.id}
          data-person={row.employee.id}
          data-name={row.employee.name}
          data-department={row.employee.department ?? ""}
          className="rounded-xl border border-border bg-card p-4 shadow-card transition-colors hover:border-brand-border"
        >
          <div className="flex items-center gap-3">
            <Avatar name={row.employee.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{row.employee.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                Code {row.employee.empCode}
                {row.employee.department ? `, ${row.employee.department}` : ""}
              </p>
            </div>
          </div>

          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label={`${row.employee.name}, totals`}>
            <InlineStat tone="success" value={row.totals.present} word="present" />
            <InlineStat tone="warning" value={row.totals.late} word="late" />
            <InlineStat tone="danger" value={row.totals.absent} word="absent" />
            <InlineStat tone="info" value={row.totals.leave} word="leave" />
          </ul>

          {months.map(({ month, dates }) => (
            <div key={month} className="mt-3">
              {months.length > 1 ? <p className="pb-1 text-xs font-semibold text-muted-foreground">{formatMonth(month)}</p> : null}
              <div className="grid grid-cols-7 gap-0.5" role="group" aria-label={`${row.employee.name}, ${formatMonth(month)}`}>
                {weekdayInitials.map((initial, i) => (
                  <span key={i} aria-hidden className="pb-0.5 text-center text-[10px] text-muted-foreground">
                    {initial}
                  </span>
                ))}
                {Array.from({ length: weekdayOf(dates[0]) }, (_, i) => (
                  <span key={`blank-${i}`} aria-hidden />
                ))}
                {dates.map((date) => {
                  const cell = row.cells.get(date);
                  const day = Number(date.slice(8));
                  if (!cell) {
                    return (
                      <span
                        key={date}
                        aria-label={`${date}: no record`}
                        className="grid aspect-square place-items-center rounded-lg border border-dashed border-border text-[11px] tabular-nums text-muted-foreground/60"
                      >
                        {day}
                      </span>
                    );
                  }
                  return (
                    <Link
                      key={date}
                      href={`/attendance/${row.employee.id}/${date}${dayQuery}`}
                      aria-label={describeCell(date, cell)}
                      title={describeCell(date, cell)}
                      className={cn(
                        "relative grid aspect-square place-items-center rounded-lg text-[11px] tabular-nums",
                        statusFill[cell.status],
                        "font-semibold",
                        date === today
                          ? "ring-2 ring-brand ring-offset-1 ring-offset-card"
                          : cell.missingOut && "ring-2 ring-amber-300 ring-offset-1 ring-offset-card",
                      )}
                    >
                      {day}
                      {cell.isManual ? <span aria-hidden className="absolute right-0.5 top-0.5 size-1 rounded-full bg-current" /> : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      ))}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {trackLeavingPunch ? "An outlined day has no leaving punch. " : ""}A dot means corrected by hand. A dashed day has no record.{today ? " The ringed day is today." : ""}
      </p>
    </div>
  );
}
