import type { getDb } from "@/db";
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

import { buildInsights, type Insights, type InsightsInput } from "./facts";

type Db = ReturnType<typeof getDb>;

/** Loads everything the rules read: this month and last month's attendance, leave, devices, payroll. */
export async function loadInsightsInput(db: Db, now: Date): Promise<InsightsInput> {
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

  return {
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
  };
}

export type InsightsResult = { insights: Insights; madeAt: Date };

/** How long a result is reused. The Today screen refreshes itself often, and these figures do not move that fast. */
export const INSIGHTS_TTL_MS = 5 * 60 * 1000;

const globalForInsights = globalThis as unknown as { byteamInsights?: { today: string; result: InsightsResult } };

/**
 * The facts for now, reused for a few minutes so the Today screen's
 * refreshing does not recompute two months of attendance each time. Kept in
 * memory on the server, so a change shows up within a few minutes.
 */
export async function getInsights(db: Db, now: Date = new Date()): Promise<InsightsResult> {
  const today = toOfficeDate(now);
  const cached = globalForInsights.byteamInsights;
  if (cached && cached.today === today && now.getTime() - cached.result.madeAt.getTime() < INSIGHTS_TTL_MS) return cached.result;

  const result: InsightsResult = { insights: buildInsights(await loadInsightsInput(db, now)), madeAt: now };
  globalForInsights.byteamInsights = { today, result };
  return result;
}
