import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { toneClasses } from "@/components/ui/tone";
import { statusTone } from "@/components/status";
import { statusLabel } from "@/lib/attendance/labels";
import type { GridCell, MonthGrid } from "@/lib/attendance/month";
import { weekdayOf } from "@/lib/time";
import { cn } from "@/lib/utils";

const weekdayInitials = ["S", "M", "T", "W", "T", "F", "S"];

function describeCell(date: string, cell: GridCell): string {
  const parts = [`${date}: ${statusLabel[cell.status]}`];
  if (cell.status === "late") parts.push(`${cell.lateMinutes} min late`);
  if (cell.missingOut) parts.push("no leaving punch");
  if (cell.workedOnOffDay) parts.push("came in on a day off");
  if (cell.isManual) parts.push("corrected by hand");
  return parts.join(", ");
}

/**
 * The month for phones: one card per person with a small calendar, each day
 * colored by what happened. Tap a day to see the punches behind it.
 */
export function AttendanceCards({ grid }: { grid: MonthGrid }) {
  const offset = weekdayOf(grid.dates[0]);

  return (
    <div className="grid gap-3">
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label="Colors">
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
            <span aria-hidden className={cn("size-2.5 rounded-sm", toneClasses[tone].solid)} />
            {text}
          </li>
        ))}
      </ul>

      {grid.rows.map((row) => (
        <section key={row.employee.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
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

          <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
            {(
              [
                ["Present", row.totals.present, "success"],
                ["Late", row.totals.late, "warning"],
                ["Absent", row.totals.absent, "danger"],
                ["Leave", row.totals.leave, "info"],
              ] as const
            ).map(([label, value, tone]) => (
              <div key={label} className={cn("rounded-xl px-1 py-1.5", toneClasses[tone].soft)}>
                <dd className="text-base font-semibold leading-none tabular-nums">{value}</dd>
                <dt className="mt-1 text-[11px]">{label}</dt>
              </div>
            ))}
          </dl>

          <div className="mt-3 grid grid-cols-7 gap-1" role="group" aria-label={`${row.employee.name}, days of the month`}>
            {weekdayInitials.map((initial, i) => (
              <span key={i} aria-hidden className="pb-0.5 text-center text-[10px] text-muted-foreground">
                {initial}
              </span>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <span key={`blank-${i}`} aria-hidden />
            ))}
            {grid.dates.map((date) => {
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
              const tone = statusTone[cell.status];
              return (
                <Link
                  key={date}
                  href={`/attendance/${row.employee.id}/${date}`}
                  aria-label={describeCell(date, cell)}
                  title={describeCell(date, cell)}
                  className={cn(
                    "relative grid aspect-square place-items-center rounded-lg text-[11px] tabular-nums",
                    toneClasses[tone].soft,
                    (cell.status === "late" || cell.status === "absent") && "font-semibold",
                    cell.missingOut && "ring-1 ring-warning",
                  )}
                >
                  {day}
                  {cell.isManual ? <span aria-hidden className="absolute right-0.5 top-0.5 size-1 rounded-full bg-current" /> : null}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
      <p className="text-xs leading-relaxed text-muted-foreground">
        An outlined day has no leaving punch. A dot means corrected by hand. A dashed day has no record.
      </p>
    </div>
  );
}
