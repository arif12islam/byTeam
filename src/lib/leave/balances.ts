import { and, eq, gte, inArray, lte } from "drizzle-orm";

import type { getDb } from "@/db";
import { employees, leaveRequests, leaveTypes, type LeaveYearBasis } from "@/db/schema";

import { leaveWorkingDates, splitUnpaid, type CalendarForLeave } from "./days";
import { loadLeaveCalendar } from "./requests";
import { getLeaveYearBasis } from "./types";
import { leaveYearOf, leaveYearsBetween, type LeaveYear } from "./year";

type Db = ReturnType<typeof getDb>;

export type BalanceRequest = {
  employeeId: string;
  leaveTypeId: string;
  fromDate: string;
  toDate: string;
  unpaidDays: number;
  status: "approved" | "pending";
};

export type Balance = {
  employeeId: string;
  leaveTypeId: string;
  /** The leave year this balance is for. */
  year: LeaveYear;
  /** Yearly days, or null for no limit. */
  quota: number | null;
  /** Approved days that fall in the year and count against the quota. */
  used: number;
  /** Days of pending requests in the year, not yet counted against the quota. */
  pending: number;
  /** Quota minus used, or null for no limit. Negative if a quota was lowered below what is already used. */
  remaining: number | null;
};

/**
 * How many days of a request fall inside a leave year and count against the
 * quota: its working days (weekly off days and holidays are skipped), minus the
 * last ones recorded as unpaid because the balance had run out, inside the year.
 * A request that runs across the new year is shared between the two years.
 */
export function countedDaysInYear(request: Pick<BalanceRequest, "fromDate" | "toDate" | "unpaidDays">, calendar: CalendarForLeave, year: LeaveYear): number {
  const working = leaveWorkingDates(request.fromDate, request.toDate, calendar);
  const { paid } = splitUnpaid(working, request.unpaidDays);
  return paid.filter((date) => date >= year.from && date <= year.to).length;
}

export type BalanceInput = {
  employees: { id: string; joinDate: string }[];
  types: { id: string; yearlyQuota: number | null }[];
  requests: BalanceRequest[];
  calendar: CalendarForLeave;
  basis: LeaveYearBasis;
  /** The date whose leave year is wanted, usually today. */
  onDate: string;
};

/** One balance per employee and leave type for the leave year containing onDate. Pure. */
export function computeBalances(input: BalanceInput): Balance[] {
  const out: Balance[] = [];
  for (const employee of input.employees) {
    const year = leaveYearOf(input.basis, employee.joinDate, input.onDate);
    const mine = input.requests.filter((r) => r.employeeId === employee.id);
    for (const type of input.types) {
      let used = 0;
      let pending = 0;
      for (const request of mine) {
        if (request.leaveTypeId !== type.id) continue;
        const days = countedDaysInYear(request, input.calendar, year);
        if (request.status === "approved") used += days;
        else pending += days;
      }
      out.push({
        employeeId: employee.id,
        leaveTypeId: type.id,
        year,
        quota: type.yearlyQuota,
        used,
        pending,
        remaining: type.yearlyQuota === null ? null : type.yearlyQuota - used,
      });
    }
  }
  return out;
}

export type BalanceCheckInput = {
  /** The request being approved. */
  request: { fromDate: string; toDate: string; days: number; unpaidDays: number };
  /** Other approved requests of the same person and type. Never the request itself. */
  others: Pick<BalanceRequest, "fromDate" | "toDate" | "unpaidDays">[];
  /** Yearly days, or null for no limit. */
  quota: number | null;
  joinDate: string;
  basis: LeaveYearBasis;
  calendar: CalendarForLeave;
};

export type BalanceCheck =
  | { ok: true }
  | {
      ok: false;
      /** How many days over the balance, added up across the leave years the request touches. */
      shortBy: number;
      /** The first leave year that does not have enough days, with what it has left and what the request needs there. */
      year: LeaveYear;
      available: number;
      needed: number;
    };

/**
 * Can this request be approved without going past the quota? In every leave
 * year it touches, the days it counts (not the ones recorded as unpaid) must fit
 * in what the person's other approved leave of that type has left. No quota
 * means no limit. Pure.
 */
export function checkBalance(input: BalanceCheckInput): BalanceCheck {
  if (input.quota === null) return { ok: true };

  let shortBy = 0;
  let first: { year: LeaveYear; available: number; needed: number } | null = null;
  for (const year of leaveYearsBetween(input.basis, input.joinDate, input.request.fromDate, input.request.toDate)) {
    const usedByOthers = input.others.reduce((sum, other) => sum + countedDaysInYear(other, input.calendar, year), 0);
    const available = Math.max(0, input.quota - usedByOthers);
    const needed = countedDaysInYear(input.request, input.calendar, year);
    if (needed > available) {
      shortBy += needed - available;
      first ??= { year, available, needed };
    }
  }
  return first ? { ok: false, shortBy, ...first } : { ok: true };
}

/**
 * The fewest days to record as unpaid, starting from the request's current
 * unpaid days, so that the rest fits in the balance. Recording every day as
 * unpaid always fits, so there is always an answer.
 */
export function suggestUnpaidDays(input: BalanceCheckInput): number {
  for (let unpaidDays = input.request.unpaidDays; unpaidDays < input.request.days; unpaidDays++) {
    if (checkBalance({ ...input, request: { ...input.request, unpaidDays } }).ok) return unpaidDays;
  }
  return input.request.days;
}

/**
 * Balances from the database for active employees (or one named employee) and
 * every leave type, as of a date. Uses the leave year setting.
 */
export async function loadBalances(db: Db, options: { onDate: string; employeeId?: string }): Promise<Balance[]> {
  const basis = await getLeaveYearBasis(db);
  const people = await db
    .select({ id: employees.id, joinDate: employees.joinDate })
    .from(employees)
    .where(options.employeeId ? eq(employees.id, options.employeeId) : eq(employees.active, true));
  const types = await db.select({ id: leaveTypes.id, yearlyQuota: leaveTypes.yearlyQuota }).from(leaveTypes);
  if (people.length === 0 || types.length === 0) return [];

  const windows = people.map((p) => leaveYearOf(basis, p.joinDate, options.onDate));
  const from = windows.reduce((min, w) => (w.from < min ? w.from : min), windows[0].from);
  const to = windows.reduce((max, w) => (w.to > max ? w.to : max), windows[0].to);

  const requests = await db
    .select({
      employeeId: leaveRequests.employeeId,
      leaveTypeId: leaveRequests.leaveTypeId,
      fromDate: leaveRequests.fromDate,
      toDate: leaveRequests.toDate,
      unpaidDays: leaveRequests.unpaidDays,
      status: leaveRequests.status,
    })
    .from(leaveRequests)
    .where(
      and(
        inArray(leaveRequests.employeeId, people.map((p) => p.id)),
        inArray(leaveRequests.status, ["approved", "pending"]),
        lte(leaveRequests.fromDate, to),
        gte(leaveRequests.toDate, from),
      ),
    );

  // Holidays across the full span of every request that touches these years.
  const calFrom = requests.reduce((min, r) => (r.fromDate < min ? r.fromDate : min), from);
  const calTo = requests.reduce((max, r) => (r.toDate > max ? r.toDate : max), to);
  const calendar = await loadLeaveCalendar(db, calFrom, calTo);

  return computeBalances({
    employees: people,
    types,
    requests: requests as BalanceRequest[],
    calendar,
    basis,
    onDate: options.onDate,
  });
}
