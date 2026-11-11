import type { Tone } from "@/components/ui/tone";
import { formatDuration, formatOfficeTime, officeMinuteOfDay } from "@/lib/time";

import type { FeedItem, TodayBoard, TodayEntry } from "./today";

/**
 * What the Today screen says, worked out from the board. Pure: the board and
 * the clock come in, text and numbers come out, so every sentence is tested.
 */

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const clock = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/** Minutes since the person's shift started, when they have not punched and the start has passed. Otherwise null. */
export function minutesPastStart(entry: Pick<TodayEntry, "group" | "shiftStartMinute">, nowMinute: number): number | null {
  if (entry.group !== "not_in_yet" || entry.shiftStartMinute === null) return null;
  const past = nowMinute - entry.shiftStartMinute;
  return past > 0 ? past : null;
}

export type TodaySummary = {
  /** People who should be in today: leave and days off are not counted. */
  due: number;
  inCount: number;
  /** In over due, 0 to 100. Null when nobody is due. */
  percent: number | null;
  /** Not in, and past their start time. */
  overdue: number;
  /** The one line under the big number. */
  subline: string;
  /** True when everyone due is in and nobody was late. */
  allGood: boolean;
};

/** The numbers and the one sentence at the top of Today. */
export function todaySummary(board: Pick<TodayBoard, "counts" | "entries" | "offDay">, nowMinute: number): TodaySummary {
  const { counts, entries, offDay } = board;
  const cameOnOffDay = entries.filter((e) => e.group === "worked_off_day").length;
  const inDue = counts.in - cameOnOffDay;
  const due = inDue + counts.notInYet + counts.absent;
  const waiting = entries.filter((e) => e.group === "not_in_yet");
  const overdue = waiting.filter((e) => minutesPastStart(e, nowMinute) !== null).length;
  const starts = waiting.map((e) => e.shiftStartMinute).filter((m): m is number => m !== null && m > nowMinute);
  const nextStart = starts.length > 0 ? Math.min(...starts) : null;

  let subline: string;
  if (due === 0) {
    subline = offDay
      ? cameOnOffDay > 0
        ? `${plural(cameOnOffDay, "person", "people")} came in on the day off`
        : offDay === "holiday"
          ? "An office holiday. Nobody is due in."
          : "A weekly off day. Nobody is due in."
      : counts.onLeave > 0
        ? "Everyone due today is on leave"
        : "No one is due in today";
  } else if (counts.absent > 0) {
    subline = [plural(counts.absent, "person", "people") + " absent", counts.notInYet > 0 ? `${counts.notInYet} not in yet` : null, counts.late > 0 ? `${counts.late} late` : null]
      .filter(Boolean)
      .join(", ");
  } else if (counts.notInYet > 0) {
    subline =
      overdue > 0
        ? `${counts.notInYet} not in yet, ${overdue === counts.notInYet ? (overdue === 1 ? "and past their start time" : "all past their start time") : `${overdue} past their start time`}`
        : nextStart !== null
          ? `${counts.notInYet} not in yet. ${inDue === 0 ? "The shift" : "The next shift"} starts ${clock(nextStart)}.`
          : `${counts.notInYet} not in yet`;
  } else if (counts.late > 0) {
    subline = `Everyone is in. ${plural(counts.late, "person", "people")} came late.`;
  } else {
    subline = "Everyone is in, and on time";
  }

  return {
    due,
    inCount: due === 0 ? cameOnOffDay : inDue,
    percent: due > 0 ? Math.round((inDue / due) * 100) : null,
    overdue,
    subline,
    allGood: due > 0 && inDue === due && counts.late === 0,
  };
}

const groupRank: Record<TodayEntry["group"], number> = { absent: 0, not_in_yet: 1, in: 2, worked_off_day: 3, on_leave: 4, off: 5 };

/**
 * The order people are listed in: within "not in yet" the longest overdue
 * first, within "in" the late ones first and then by arrival, everyone else by
 * name. Decided on the server so the list never reorders in the browser.
 */
export function sortBoardEntries(entries: readonly TodayEntry[], nowMinute: number): TodayEntry[] {
  const byName = (a: TodayEntry, b: TodayEntry) => a.name.localeCompare(b.name) || a.empCode.localeCompare(b.empCode);
  return [...entries].sort((a, b) => {
    if (a.group !== b.group) return groupRank[a.group] - groupRank[b.group];
    if (a.group === "not_in_yet") {
      const past = (minutesPastStart(b, nowMinute) ?? -1) - (minutesPastStart(a, nowMinute) ?? -1);
      return past || (a.shiftStartMinute ?? 0) - (b.shiftStartMinute ?? 0) || byName(a, b);
    }
    if (a.group === "in") {
      const late = b.lateMinutes - a.lateMinutes;
      return late || (a.firstIn?.getTime() ?? 0) - (b.firstIn?.getTime() ?? 0) || byName(a, b);
    }
    return byName(a, b);
  });
}

/** The start time most people share, as minutes into the day. The earlier one on a tie. Null with nobody. */
export function mainShiftStart(entries: readonly Pick<TodayEntry, "shiftStartMinute">[]): number | null {
  const tally = new Map<number, number>();
  for (const e of entries) if (e.shiftStartMinute !== null) tally.set(e.shiftStartMinute, (tally.get(e.shiftStartMinute) ?? 0) + 1);
  let best: number | null = null;
  for (const [minute, count] of tally) {
    if (best === null || count > tally.get(best)! || (count === tally.get(best)! && minute < best)) best = minute;
  }
  return best;
}

export type ArrivalStats = { total: number; first: string | null; median: string | null; late: number };

/** When people arrived: the first, the middle one, and how many were late. */
export function arrivalStats(entries: readonly TodayEntry[]): ArrivalStats {
  const arrived = entries.filter((e) => e.firstIn !== null && (e.group === "in" || e.group === "worked_off_day"));
  const minutes = arrived.map((e) => officeMinuteOfDay(e.firstIn as Date)).sort((a, b) => a - b);
  if (minutes.length === 0) return { total: 0, first: null, median: null, late: 0 };
  const mid = Math.floor(minutes.length / 2);
  const median = minutes.length % 2 === 1 ? minutes[mid] : Math.round((minutes[mid - 1] + minutes[mid]) / 2);
  return { total: minutes.length, first: clock(minutes[0]), median: clock(median), late: arrived.filter((e) => e.status === "late").length };
}

/** The second line of a punch in the feed: what it was, and the device only when there is more than one. */
export function describeFeedItem(item: FeedItem, entry: Pick<TodayEntry, "status" | "lateMinutes"> | undefined, deviceCount: number): string {
  const what =
    item.kind === "again" ? "Punched again" : !entry ? "Arrived" : entry.status === "late" ? `Arrived, ${formatDuration(entry.lateMinutes)} late` : "Arrived, on time";
  return deviceCount > 1 && item.deviceName ? `${what}, ${item.deviceName}` : what;
}

export type EntryView = {
  tone: Tone;
  /** The arrival time, for people who are in. */
  time: string | null;
  /** A status label that needs to stand out: late, absent, on leave. */
  badge: string | null;
  /** Quiet words on the right: "On time", "Due 09:00", "40 min past start". */
  note: string | null;
  /** The note is something to act on, so it is shown in the warning color with a dot. */
  noteWarns: boolean;
  /** "Out 18:05" or "Not out yet", when the leaving punch is used. */
  out: string | null;
  /** The whole story in one line, for the person's sheet. */
  detail: string;
};

/** What a person's row shows on the right. The group heading already says the group, so the row says what is particular to the person. */
export function describeTodayEntry(entry: TodayEntry, trackLeavingPunch: boolean, nowMinute: number): EntryView {
  if (entry.group === "in" || entry.group === "worked_off_day") {
    const time = entry.firstIn ? formatOfficeTime(entry.firstIn) : null;
    const out = !trackLeavingPunch ? null : entry.lastOut ? `Out ${formatOfficeTime(entry.lastOut)}` : "Not out yet";
    const late = entry.status === "late";
    const detail = [time ? `In ${time}` : null, out ? out.charAt(0).toLowerCase() + out.slice(1) : null].filter(Boolean).join(", ");
    return {
      tone: late ? "warning" : "success",
      time,
      badge: late ? `${formatDuration(entry.lateMinutes)} late` : null,
      note: late ? null : entry.group === "worked_off_day" ? "On a day off" : "On time",
      noteWarns: false,
      out,
      detail,
    };
  }
  if (entry.group === "on_leave") {
    const badge = entry.status === "leave_unpaid" ? "Unpaid leave" : "Paid leave";
    return { tone: "info", time: null, badge, note: null, noteWarns: false, out: null, detail: `Shift ${entry.shiftLabel}` };
  }
  if (entry.group === "absent") {
    return { tone: "danger", time: null, badge: "Absent", note: null, noteWarns: false, out: null, detail: `No punch. Shift ${entry.shiftLabel}.` };
  }
  const past = minutesPastStart(entry, nowMinute);
  return past !== null
    ? { tone: "warning", time: null, badge: null, note: `${formatDuration(past)} past start`, noteWarns: true, out: null, detail: `Due ${entry.shiftStart}, ${formatDuration(past)} past start` }
    : { tone: "off", time: null, badge: null, note: `Due ${entry.shiftStart}`, noteWarns: false, out: null, detail: `Due ${entry.shiftStart}` };
}
