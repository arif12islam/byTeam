import type { RunSummary, SheetRow } from "@/lib/payroll/runs";
import { shiftMonth } from "@/lib/time";

/** Payroll figures for the Reports screen, from runs and sheet rows already loaded. Pure. */

export type TrendPoint = {
  /** YYYY-MM. */
  month: string;
  /** Net pay for the month in taka, or null when there is no run. */
  net: number | null;
  status: RunSummary["status"] | null;
};

/** The `count` months up to and including `month`, oldest first. A month without a run has a null net. */
export function payrollTrend(runs: readonly RunSummary[], month: string, count = 6): TrendPoint[] {
  const byMonth = new Map(runs.map((r) => [r.month, r]));
  const points: TrendPoint[] = [];
  for (let back = count - 1; back >= 0; back--) {
    const m = shiftMonth(month, -back);
    const run = byMonth.get(m);
    points.push({ month: m, net: run ? Number(run.net) : null, status: run?.status ?? null });
  }
  return points;
}

export type DepartmentCost = {
  department: string;
  people: number;
  gross: number;
  net: number;
};

const NO_DEPARTMENT = "No department";

/** Gross and net pay per department, in taka, biggest net first. Amounts are added in paisa so no rounding error creeps in. */
export function payrollByDepartment(rows: readonly Pick<SheetRow, "department" | "gross" | "net">[]): DepartmentCost[] {
  const toPaisa = (text: string) => Math.round(Number(text) * 100);
  const map = new Map<string, { people: number; gross: number; net: number }>();
  for (const row of rows) {
    const key = row.department?.trim() || NO_DEPARTMENT;
    const entry = map.get(key) ?? { people: 0, gross: 0, net: 0 };
    entry.people += 1;
    entry.gross += toPaisa(row.gross);
    entry.net += toPaisa(row.net);
    map.set(key, entry);
  }
  return [...map.entries()]
    .map(([department, e]) => ({ department, people: e.people, gross: e.gross / 100, net: e.net / 100 }))
    .sort((a, b) => b.net - a.net || a.department.localeCompare(b.department));
}

/** 123456.5 as "123,456.50". Whole amounts drop the decimals. */
export function formatTaka(amount: number): string {
  const whole = Number.isInteger(amount);
  return amount.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
}

/** 245000 as "245k", 1250000 as "1.3M". For labels with little room. */
export function formatCompact(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (amount >= 1_000) return `${Math.round(amount / 1_000)}k`;
  return String(Math.round(amount));
}
