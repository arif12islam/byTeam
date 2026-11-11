import { ChevronDown, Download } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { NO_DEPARTMENT, ONLY_CHOICES, ONLY_LABELS } from "@/lib/attendance/export-options";
import type { PeriodGrid } from "@/lib/attendance/month";
import { periodLabel } from "@/lib/period";
import { cn } from "@/lib/utils";

const FORMATS = [
  { value: "xlsx", label: "Excel", hint: "A spreadsheet, one column per day" },
  { value: "pdf", label: "PDF", hint: "To print or share, landscape" },
  { value: "csv", label: "CSV", hint: "Plain data for other programs" },
] as const;

/**
 * The download choices, as a plain form that opens the file: which format,
 * which people, and who to leave out. It exports the period shown above.
 * Needs no script, so it works the same on a phone.
 */
export function ExportPanel({ grid, trackLeavingPunch }: { grid: PeriodGrid; trackLeavingPunch: boolean }) {
  const departments = [...new Set(grid.rows.flatMap((row) => (row.employee.department ? [row.employee.department] : [])))].sort((a, b) => a.localeCompare(b));
  const hasUnassigned = grid.rows.some((row) => row.employee.department === null);
  const choices = ONLY_CHOICES.filter((choice) => trackLeavingPunch || choice !== "missing_out");

  return (
    <details className="group w-full sm:relative sm:w-auto">
      <summary
        className={cn(
          buttonVariants({ variant: "outline" }),
          "w-full cursor-pointer list-none sm:w-auto [&::-webkit-details-marker]:hidden group-open:border-brand-border group-open:bg-brand-soft group-open:text-brand-soft-foreground",
        )}
      >
        <Download aria-hidden />
        Export
        <ChevronDown aria-hidden className="transition-transform group-open:rotate-180" />
      </summary>
      <form
        method="get"
        action="/attendance/export"
        className="mt-2 space-y-5 rounded-xl border border-border bg-card p-4 text-left text-card-foreground shadow-lg sm:absolute sm:right-0 sm:top-full sm:z-30 sm:w-[min(36rem,calc(100vw-4rem))]"
      >
        <input type="hidden" name="from" value={grid.from} />
        <input type="hidden" name="to" value={grid.to} />
        <p className="text-sm text-muted-foreground">Exports {periodLabel({ from: grid.from, to: grid.to })}. Change the dates above to export another period.</p>

        <fieldset>
          <legend className="text-sm font-medium">Format</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {FORMATS.map((format, i) => (
              <label key={format.value} className="flex min-h-10 cursor-pointer items-start gap-2 rounded-md border border-input bg-card p-2.5 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                <input type="radio" name="format" value={format.value} defaultChecked={i === 0} className="mt-0.5 size-4 accent-brand" />
                <span>
                  <span className="font-medium">{format.label}</span>
                  <span className="block text-xs text-muted-foreground">{format.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="export-department" className="text-sm font-medium">
              Department
            </label>
            <Select id="export-department" name="department" defaultValue="" className="mt-1.5">
              <option value="">All departments</option>
              {departments.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              {hasUnassigned ? <option value={NO_DEPARTMENT}>No department</option> : null}
            </Select>
          </div>
          <div>
            <label htmlFor="export-employee" className="text-sm font-medium">
              Employee
            </label>
            <Select id="export-employee" name="employee" defaultValue="" className="mt-1.5">
              <option value="">Everyone</option>
              {grid.rows.map((row) => (
                <option key={row.employee.id} value={row.employee.id}>
                  {row.employee.name} ({row.employee.empCode})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="export-only" className="text-sm font-medium">
              Only people who
            </label>
            <Select id="export-only" name="only" defaultValue="" className="mt-1.5">
              <option value="">Everyone in the list</option>
              {choices.map((choice) => (
                <option key={choice} value={choice}>
                  {ONLY_LABELS[choice].replace(/^./, (c) => c.toUpperCase())}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit">
            <Download aria-hidden />
            Download
          </Button>
          <p className="text-xs text-muted-foreground">A PDF of more than a month shows the totals only, since days will not fit a page.</p>
        </div>
      </form>
    </details>
  );
}
