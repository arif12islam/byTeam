import type { DayResult } from "@/lib/attendance/compute-day";
import { buildPeriodGrid, type GridInput } from "@/lib/attendance/month";
import type { InsightsInput } from "@/lib/insights/facts";
import { monthPeriod } from "@/lib/period";
import { officeDateTimeToInstant } from "@/lib/time";

/** Shared by the Insights tests. TODAY is Thursday 12 Nov 2026. */
export const TODAY = "2026-11-12"; // a Thursday
export const NOW = officeDateTimeToInstant(TODAY, "12:00")!;

export const result = (over: Partial<DayResult> = {}): DayResult => ({
  status: "present",
  firstIn: null,
  lastOut: null,
  lateMinutes: 0,
  earlyMinutes: 0,
  missingOut: false,
  workedOnOffDay: false,
  punchCount: 2,
  isManual: false,
  ...over,
});

export const day = (month: string, d: number) => `${month}-${String(d).padStart(2, "0")}`;

/** A person's month: `days` is a status for each date from the 1st, and anything not listed is a plain present day up to `last`. */
export function person(id: string, name: string, month: string, days: Record<number, Partial<DayResult>>, last: number): GridInput {
  const out: GridInput["days"] = [];
  for (let d = 1; d <= last; d += 1) out.push({ date: day(month, d), result: result(days[d] ?? {}) });
  return { employee: { id, empCode: id, name, department: null }, days: out };
}

export const late = { status: "late" as const, lateMinutes: 20 };
export const absent = { status: "absent" as const, punchCount: 0 };
export const lates = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, late]));

export function input(over: Omit<Partial<InsightsInput>, "current" | "previous"> & { current?: GridInput[]; previous?: GridInput[] } = {}): InsightsInput {
  const { current = [], previous = [], ...rest } = over;
  return {
    today: TODAY,
    now: NOW,
    current: buildPeriodGrid(monthPeriod("2026-11"), current),
    previous: buildPeriodGrid(monthPeriod("2026-10"), previous),
    trackLeavingPunch: true,
    lateRule: { lateMode: "days_per_lates", lateEveryN: 3 },
    balances: [],
    devices: [],
    officeOpen: true,
    unmatched: [],
    payroll: [],
    ...rest,
  };
}

