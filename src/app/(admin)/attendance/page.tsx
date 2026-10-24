import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/db";
import type { AttendanceStatus } from "@/db/schema/attendance";
import { loadMonthGrid, type GridCell } from "@/lib/attendance/month";
import { requireRole } from "@/lib/session";
import { formatMonth, isValidMonth, shiftMonth, toOfficeDate, toOfficeMonth } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Attendance" };

export default function AttendancePage(props: PageProps<"/attendance">) {
  return (
    <>
      <PageHeader
        title="Attendance"
        description="Monthly attendance for every employee, built from device punches. Open a day to see the punches behind it."
      />
      <Suspense fallback={<p className="mt-6 text-sm text-muted-foreground">Loading attendance</p>}>
        <AttendanceContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

const codes: Record<AttendanceStatus, { code: string; label: string; className: string }> = {
  present: { code: "P", label: "Present", className: "text-foreground" },
  late: { code: "L", label: "Late", className: "font-semibold text-destructive" },
  absent: { code: "A", label: "Absent", className: "bg-destructive/10 font-semibold text-destructive" },
  leave_paid: { code: "PL", label: "Paid leave", className: "text-primary" },
  leave_unpaid: { code: "UL", label: "Unpaid leave", className: "text-primary" },
  weekly_off: { code: "W", label: "Weekly off day", className: "bg-muted text-muted-foreground" },
  holiday: { code: "H", label: "Holiday", className: "bg-muted text-muted-foreground" },
};

function describeCell(date: string, cell: GridCell): string {
  const parts = [`${date}: ${codes[cell.status].label}`];
  if (cell.status === "late") parts.push(`${cell.lateMinutes} min late`);
  if (cell.missingOut) parts.push("no leaving punch");
  if (cell.workedOnOffDay) parts.push("came in on a day off");
  if (cell.isManual) parts.push("corrected by hand");
  return parts.join(", ");
}

/** Reads the current time and the database, so it renders after the session check, inside Suspense. */
async function AttendanceContent({ searchParams }: { searchParams: PageProps<"/attendance">["searchParams"] }) {
  await requireRole("owner", "hr");

  const now = new Date();
  const today = toOfficeDate(now);
  const thisMonth = toOfficeMonth(now);
  const { month: requested } = await searchParams;
  const month = typeof requested === "string" && isValidMonth(requested) ? requested : thisMonth;

  const grid = await loadMonthGrid(getDb(), month, today);

  return (
    <div className="mt-6 grid gap-5">
      <nav aria-label="Month" className="flex flex-wrap items-center gap-2">
        <Link href={`/attendance?month=${shiftMonth(month, -1)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Previous month
        </Link>
        <h2 className="min-w-24 text-center text-base font-semibold">{formatMonth(month)}</h2>
        <Link href={`/attendance?month=${shiftMonth(month, 1)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Next month
        </Link>
        {month !== thisMonth ? (
          <Link href="/attendance" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            This month
          </Link>
        ) : null}
      </nav>

      {grid.rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
          Nobody was employed in {formatMonth(month)}.{" "}
          <Link href="/employees" className="underline underline-offset-2">
            Add employees on the Employees screen
          </Link>
          , or pick another month.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th scope="col" className="sticky left-0 z-10 min-w-36 bg-card px-3 py-2 font-medium">
                  Employee
                </th>
                {grid.dates.map((date) => (
                  <th key={date} scope="col" className="min-w-8 px-0.5 py-2 text-center font-medium tabular-nums">
                    {Number(date.slice(8))}
                  </th>
                ))}
                {["Present", "Late", "Absent", "Leave"].map((label) => (
                  <th key={label} scope="col" className={cn("px-2 py-2 text-right font-medium", label === "Present" && "border-l border-border")}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.rows.map((row) => (
                <tr key={row.employee.id} className="border-b border-border last:border-b-0">
                  <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-medium">
                    {row.employee.name}
                    <span className="block text-xs font-normal text-muted-foreground">Code {row.employee.empCode}</span>
                  </th>
                  {grid.dates.map((date) => {
                    const cell = row.cells.get(date);
                    if (!cell) return <td key={date} className="px-0.5 py-2 text-center text-muted-foreground/40">-</td>;
                    const { code, className } = codes[cell.status];
                    return (
                      <td key={date} className="p-0.5 text-center">
                        <Link
                          href={`/attendance/${row.employee.id}/${date}`}
                          aria-label={describeCell(date, cell)}
                          title={describeCell(date, cell)}
                          className={cn("block rounded px-1 py-1.5 text-xs hover:ring-1 hover:ring-primary", className)}
                        >
                          {code}
                          {cell.missingOut ? "!" : ""}
                          {cell.isManual ? "*" : ""}
                        </Link>
                      </td>
                    );
                  })}
                  <td className="border-l border-border px-2 py-2 text-right tabular-nums">{row.totals.present}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{row.totals.late}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{row.totals.absent}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{row.totals.leave}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        P present, L late, A absent, PL paid leave, UL unpaid leave, W weekly off day, H holiday. An exclamation mark
        means no leaving punch, an asterisk means corrected by hand, a dash means no record for that day. Present counts
        late days too.
      </p>
    </div>
  );
}
