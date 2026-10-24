import { fromPaisa, toPaisa } from "@/lib/payroll/compute";
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

/** The given months, oldest first, each with that month's run total or null when there is no run. */
export function payrollTrendFor(runs: readonly RunSummary[], months: readonly string[]): TrendPoint[] {
  const byMonth = new Map(runs.map((r) => [r.month, r]));
  return months.map((month) => {
    const run = byMonth.get(month);
    return { month, net: run ? Number(run.net) : null, status: run?.status ?? null };
  });
}

type SheetLike = {
  run: { status: RunSummary["status"] };
  totals: { gross: string; deductions: string; additions: string; net: string };
  rows: readonly Pick<SheetRow, "employeeId" | "department" | "gross" | "net">[];
};

export type CombinedSheets = {
  months: number;
  finalized: number;
  drafts: number;
  /** Each total as text with two decimals, added in paisa. */
  totals: { gross: string; deductions: string; additions: string; net: string };
  rows: Pick<SheetRow, "employeeId" | "department" | "gross" | "net">[];
};

/** Adds the totals of several months' payroll sheets together and gathers their rows. Pure. */
export function combineSheets(sheets: readonly SheetLike[]): CombinedSheets {
  const sum = (pick: (s: SheetLike) => string) => fromPaisa(sheets.reduce((total, s) => total + toPaisa(pick(s)), 0));
  return {
    months: sheets.length,
    finalized: sheets.filter((s) => s.run.status === "finalized").length,
    drafts: sheets.filter((s) => s.run.status !== "finalized").length,
    totals: {
      gross: sum((s) => s.totals.gross),
      deductions: sum((s) => s.totals.deductions),
      additions: sum((s) => s.totals.additions),
      net: sum((s) => s.totals.net),
    },
    rows: sheets.flatMap((s) => s.rows),
  };
}

/** What each employee was paid across the sheets, as text with two decimals, added in paisa. */
export function netByEmployee(sheets: readonly Pick<SheetLike, "rows">[]): Map<string, string> {
  const paisa = new Map<string, number>();
  for (const sheet of sheets) {
    for (const row of sheet.rows) paisa.set(row.employeeId, (paisa.get(row.employeeId) ?? 0) + toPaisa(row.net));
  }
  return new Map([...paisa].map(([id, value]) => [id, fromPaisa(value)]));
}

export type DepartmentCost = {
  department: string;
  people: number;
  gross: number;
  net: number;
};

const NO_DEPARTMENT = "No department";

/** Gross and net pay per department, in taka, biggest net first. Amounts are added in paisa so no rounding error creeps in. */
export function payrollByDepartment(rows: readonly (Pick<SheetRow, "department" | "gross" | "net"> & { employeeId?: string })[]): DepartmentCost[] {
  const paisa = (text: string) => Math.round(Number(text) * 100);
  const map = new Map<string, { people: Set<string | number>; gross: number; net: number }>();
  rows.forEach((row, index) => {
    const key = row.department?.trim() || NO_DEPARTMENT;
    const entry = map.get(key) ?? { people: new Set(), gross: 0, net: 0 };
    // The same person in several months counts once.
    entry.people.add(row.employeeId ?? index);
    entry.gross += paisa(row.gross);
    entry.net += paisa(row.net);
    map.set(key, entry);
  });
  return [...map.entries()]
    .map(([department, e]) => ({ department, people: e.people.size, gross: e.gross / 100, net: e.net / 100 }))
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
