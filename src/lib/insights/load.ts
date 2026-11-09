import { and, asc, eq } from "drizzle-orm";

import type { getDb } from "@/db";
import { employees } from "@/db/schema";
import { loadPeriodGrid } from "@/lib/attendance/month";
import { listDevices } from "@/lib/devices/devices";
import { loadBalances } from "@/lib/leave/balances";
import { listLeaveTypes } from "@/lib/leave/types";
import { officeWindow, withinWindow } from "@/lib/notifications/rules";
import { listRuleSets, ruleSetForMonth } from "@/lib/payroll/rules";
import { loadPayrollSheet } from "@/lib/payroll/runs";
import { monthPeriod } from "@/lib/period";
import { listUnmatchedCodes } from "@/lib/punches/unmatched";
import { getCompanySettings } from "@/lib/settings/company";
import { listShifts } from "@/lib/shifts/shifts";
import { shiftMonth, toOfficeDate } from "@/lib/time";

import { buildInsights, withoutPeople, type Insights, type InsightsInput } from "./facts";

type Db = ReturnType<typeof getDb>;

export type LeftOut = { id: string; name: string };

/** People switched on as "Leave out of Insights" (management and the like), by name. Switched-off people do not matter. */
export async function listLeftOut(db: Db): Promise<LeftOut[]> {
  return db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(and(eq(employees.excludeFromInsights, true), eq(employees.active, true)))
    .orderBy(asc(employees.name));
}

/**
 * Loads everything the rules read: this month and last month's attendance,
 * leave, devices, payroll. People left out of Insights are taken out last, so
 * "is the office open today" and the pay totals still see everyone.
 */
export async function loadInsightsInput(db: Db, now: Date, leftOut?: readonly LeftOut[]): Promise<InsightsInput> {
  const left = new Set((leftOut ?? (await listLeftOut(db))).map((p) => p.id));
  const today = toOfficeDate(now);
  const month = today.slice(0, 7);
  const lastMonth = shiftMonth(month, -1);
  const monthBefore = shiftMonth(month, -2);

  const [current, previous, company, rules, balances, types, devices, unmatched, shifts, sheetLast, sheetBefore] = await Promise.all([
    loadPeriodGrid(db, monthPeriod(month), today),
    loadPeriodGrid(db, monthPeriod(lastMonth), today),
    getCompanySettings(db),
    listRuleSets(db),
    loadBalances(db, { onDate: today }),
    listLeaveTypes(db),
    listDevices(db),
    listUnmatchedCodes(db),
    listShifts(db),
    loadPayrollSheet(db, lastMonth),
    loadPayrollSheet(db, monthBefore),
  ]);

  const names = new Map([...current.rows, ...previous.rows].map((row) => [row.employee.id, row.employee.name]));
  const typeNames = new Map(types.map((t) => [t.id, t.name]));
  const rule = ruleSetForMonth(rules, month);

  // A day off for everyone is not a day to worry about a quiet device.
  const todayCells = current.rows.map((row) => row.cells.get(today)).filter((cell) => cell !== undefined);
  const workingToday = todayCells.length === 0 || todayCells.some((cell) => cell.status !== "weekly_off" && cell.status !== "holiday");

  const payroll = [sheetLast, sheetBefore].flatMap((sheet, i) =>
    sheet ? [{ month: i === 0 ? lastMonth : monthBefore, net: Number(sheet.totals.net), people: sheet.rows.length }] : [],
  );

  return withoutPeople({
    today,
    now,
    current,
    previous,
    trackLeavingPunch: company.trackLeavingPunch,
    lateRule: rule ? { lateMode: rule.lateMode, lateEveryN: rule.lateEveryN } : null,
    balances: balances.flatMap((b) =>
      names.has(b.employeeId) && typeNames.has(b.leaveTypeId) ? [{ employeeId: b.employeeId, quota: b.quota, remaining: b.remaining, employeeName: names.get(b.employeeId)!, leaveTypeName: typeNames.get(b.leaveTypeId)! }] : [],
    ),
    devices,
    officeOpen: workingToday && withinWindow(now, officeWindow(shifts)),
    unmatched,
    payroll,
  }, left);
}

export type InsightsResult = { insights: Insights; madeAt: Date; leftOut: LeftOut[] };

/** How long a result is reused. The Today screen refreshes itself often, and these figures do not move that fast. */
export const INSIGHTS_TTL_MS = 5 * 60 * 1000;

const globalForInsights = globalThis as unknown as { byteamInsights?: { key: string; result: InsightsResult } };

/** Forgets the saved facts, for when a change would leave one pointing at something that is gone. */
export function forgetInsights(): void {
  globalForInsights.byteamInsights = undefined;
}

/**
 * The facts for now, reused for a few minutes so the Today screen's
 * refreshing does not recompute two months of attendance each time. Kept in
 * memory on the server, so a change shows up within a few minutes.
 */
export async function getInsights(db: Db, now: Date = new Date()): Promise<InsightsResult> {
  const today = toOfficeDate(now);
  // Who is left out is part of the key, so changing it shows at once on every server instance, not after the five minutes.
  const leftOut = await listLeftOut(db);
  const key = `${today}|${leftOut.map((p) => p.id).join(",")}`;
  const cached = globalForInsights.byteamInsights;
  if (cached && cached.key === key && now.getTime() - cached.result.madeAt.getTime() < INSIGHTS_TTL_MS) return cached.result;

  const result: InsightsResult = { insights: buildInsights(await loadInsightsInput(db, now, leftOut)), madeAt: now, leftOut };
  globalForInsights.byteamInsights = { key, result };
  return result;
}
