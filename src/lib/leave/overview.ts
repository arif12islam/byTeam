import type { LeaveRequestRow } from "@/lib/leave/requests";
import { nextDate } from "@/lib/time";

/** How far ahead "coming up" looks, in days. */
export const COMING_UP_DAYS = 14;
/** How long an ended request still counts as recent, in days. */
export const RECENT_DAYS = 14;

type RequestDates = Pick<LeaveRequestRow, "status" | "fromDate" | "toDate">;

function addDays(date: string, days: number): string {
  let result = date;
  for (let i = 0; i < Math.abs(days); i += 1) {
    if (days > 0) result = nextDate(result);
    else {
      const [y, m, d] = result.split("-").map(Number);
      result = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
    }
  }
  return result;
}

export type LeaveHeroCounts = {
  /** Requests waiting for a decision. */
  waiting: number;
  /** Approved requests that cover today. */
  onLeaveToday: number;
  /** Approved requests that start in the next 14 days, not counting today. */
  comingUp: number;
};

/** The three numbers at the top of the leave screen. Pure: requests and today in, counts out. */
export function leaveHeroCounts(requests: readonly RequestDates[], today: string): LeaveHeroCounts {
  const horizon = addDays(today, COMING_UP_DAYS);
  let waiting = 0;
  let onLeaveToday = 0;
  let comingUp = 0;
  for (const r of requests) {
    if (r.status === "pending") waiting += 1;
    else if (r.status === "approved") {
      if (r.fromDate <= today && r.toDate >= today) onLeaveToday += 1;
      else if (r.fromDate > today && r.fromDate <= horizon) comingUp += 1;
    }
  }
  return { waiting, onLeaveToday, comingUp };
}

export type LeaveGroups<T> = {
  /** Pending requests, in the order given. */
  waiting: T[];
  /** Approved leave that is on now or ahead (soonest first), then approved leave that ended in the last 14 days (latest first). */
  upcoming: T[];
  /** Everything else: older approved leave, rejected and cancelled requests, in the order given. */
  past: T[];
};

/** Sorts requests into the three sections of the Requests tab. */
export function groupLeaveRequests<T extends RequestDates>(requests: readonly T[], today: string): LeaveGroups<T> {
  const recentFrom = addDays(today, -RECENT_DAYS);
  const waiting: T[] = [];
  const ahead: T[] = [];
  const recent: T[] = [];
  const past: T[] = [];
  for (const r of requests) {
    if (r.status === "pending") waiting.push(r);
    else if (r.status === "approved" && r.toDate >= today) ahead.push(r);
    else if (r.status === "approved" && r.toDate >= recentFrom) recent.push(r);
    else past.push(r);
  }
  ahead.sort((a, b) => a.fromDate.localeCompare(b.fromDate));
  recent.sort((a, b) => b.toDate.localeCompare(a.toDate));
  return { waiting, upcoming: [...ahead, ...recent], past };
}
