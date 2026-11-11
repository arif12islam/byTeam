import { Fingerprint, Sunrise, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Alert } from "@/components/ui/alert";
import { Card, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { arrivalBuckets, buildPunchFeed, groupPunchesByCode, loadDayPunches, loadTodayBoard } from "@/lib/attendance/today";
import { arrivalStats, describeFeedItem, describeTodayEntry, mainShiftStart, sortBoardEntries, todaySummary } from "@/lib/attendance/today-summary";
import { deviceStatus, listDevices } from "@/lib/devices/devices";
import { listUnmatchedCodes } from "@/lib/punches/unmatched";
import { requireRole } from "@/lib/session";
import { getCompanySettings } from "@/lib/settings/company";
import { formatOfficeTime, officeMinuteOfDay, toOfficeDate } from "@/lib/time";
import { cn } from "@/lib/utils";

import { InsightsCard } from "@/components/insights/insights-card";

import { ArrivalsChart } from "./arrivals-chart";
import { TodayBoard, type BoardEntry } from "./board";
import { PunchFeed } from "./punch-feed";
import { TodaySkeleton } from "./today-skeleton";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <Suspense fallback={<TodaySkeleton />}>
      <TodayContent />
    </Suspense>
  );
}

/** Reads the current time and the database, so it renders after the session check, inside Suspense. */
async function TodayContent() {
  await requireRole("owner", "hr");

  const db = getDb();
  const now = new Date();
  const today = toOfficeDate(now);
  const [board, deviceList, unmatched, dayPunches, company] = await Promise.all([
    loadTodayBoard(db, now),
    listDevices(db),
    listUnmatchedCodes(db),
    loadDayPunches(db, today),
    getCompanySettings(db),
  ]);
  const devices = deviceList.filter((d) => d.active);
  const offlineDevices = devices.filter((d) => deviceStatus(d.lastSeenAt, now) === "offline");
  const { counts } = board;
  const nowMinute = officeMinuteOfDay(now);
  const summary = todaySummary(board, nowMinute);
  const onTime = counts.in - counts.late;
  const shiftStart = mainShiftStart(board.entries);
  const buckets = arrivalBuckets(board.entries, 15, { around: shiftStart });
  const startLabel = shiftStart === null ? null : `${String(Math.floor(shiftStart / 60)).padStart(2, "0")}:${String(Math.floor((shiftStart % 60) / 15) * 15).padStart(2, "0")}`;
  const punchTimes = groupPunchesByCode(dayPunches);
  const entryByCode = new Map(board.entries.map((e) => [e.empCode, e]));
  const feed = buildPunchFeed(dayPunches, board.entries, 6).map((item) => ({ ...item, line: describeFeedItem(item, entryByCode.get(item.empCode), devices.length) }));
  // Sorted here, on the server, so the list is final when it arrives and never reorders in the browser.
  const entries: BoardEntry[] = sortBoardEntries(board.entries, nowMinute).map((entry) => {
    const view = describeTodayEntry(entry, company.trackLeavingPunch, nowMinute);
    return {
      id: entry.id,
      empCode: entry.empCode,
      name: entry.name,
      department: entry.department,
      group: entry.group,
      late: entry.status === "late",
      ...view,
      shiftLabel: entry.shiftLabel,
      punches: (punchTimes.get(entry.empCode) ?? []).map(formatOfficeTime),
      missingOut: entry.missingOut,
    };
  });

  const dateLine = `${longDate(today)}${board.offDay === "holiday" ? ", office holiday" : board.offDay === "weekly_off" ? ", weekly off day" : ""}`;

  // One slim line about the device, instead of a card of its own.
  const online = devices.filter((d) => deviceStatus(d.lastSeenAt, now) === "online").length;
  const deviceNote =
    devices.length === 0 ? null : (
      <Link href="/devices" className="-mb-2 inline-flex min-h-10 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <span
          aria-hidden
          className={cn("size-1.5 rounded-full", online === devices.length ? "bg-green-500" : online > 0 ? "bg-amber-400" : "bg-red-500")}
        />
        {devices.length === 1
          ? `${devices[0].name} ${online === 1 ? "online" : deviceStatus(devices[0].lastSeenAt, now) === "never" ? "never connected" : "offline"}`
          : `${online} of ${devices.length} devices online`}
      </Link>
    );

  const notices = (
    <>
      {devices.length === 0 ? (
        <Alert tone="info" icon={Fingerprint} className="py-2">
          No device is set up.{" "}
          <Link href="/devices" className="font-medium underline underline-offset-2">
            Add one on the Devices screen
          </Link>{" "}
          and punches will appear here.
        </Alert>
      ) : null}
      {offlineDevices.length > 0 ? (
        <Alert tone="danger" icon={TriangleAlert} className="py-2">
          {offlineDevices.length === 1 ? `${offlineDevices[0].name} is offline.` : `${offlineDevices.length} devices are offline.`} Punches are
          kept on the device and arrive when it reconnects.{" "}
          <Link href="/devices" className="font-medium underline underline-offset-2">
            Check the Devices screen
          </Link>
        </Alert>
      ) : null}
      {unmatched.length > 0 ? (
        <Alert tone="warning" icon={TriangleAlert} className="py-2">
          {unmatched.length === 1 ? "1 employee code has" : `${unmatched.length} employee codes have`} punched but{" "}
          {unmatched.length === 1 ? "belongs" : "belong"} to nobody.{" "}
          <Link href="/devices" className="font-medium underline underline-offset-2">
            Review them on the Devices screen
          </Link>
        </Alert>
      ) : null}
    </>
  );

  const insights = (
    <Suspense fallback={null}>
      <InsightsCard />
    </Suspense>
  );

  const aside = (
    <>
      {buckets.length > 0 ? (
        <Card className="p-4">
          <CardTitle icon={Sunrise}>Arrivals</CardTitle>
          <div className="mt-3">
            <ArrivalsChart buckets={buckets} stats={arrivalStats(board.entries)} startLabel={startLabel} />
          </div>
        </Card>
      ) : null}
      <PunchFeed items={feed} now={now} />
    </>
  );

  return (
    <TodayBoard
      entries={entries}
      counts={counts}
      date={today}
      hero={{
        dateLine,
        inCount: summary.inCount,
        due: summary.due,
        percent: summary.percent,
        subline: summary.subline,
        allGood: summary.allGood,
        generatedAt: now.getTime(),
        segments: [
          { value: onTime, tone: "success", label: "On time" },
          { value: counts.late, tone: "warning", label: "Late" },
          { value: counts.notInYet, tone: "off", label: "Not in yet" },
          { value: counts.absent, tone: "danger", label: "Absent" },
        ],
      }}
      deviceNote={deviceNote}
      notices={notices}
      insights={insights}
      aside={aside}
    />
  );
}

const longDateFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "short", year: "numeric" });

/** "Wednesday, 11 Nov 2026" from an office date. */
function longDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const parts = Object.fromEntries(longDateFormatter.formatToParts(new Date(Date.UTC(y, m - 1, d))).map((p) => [p.type, p.value]));
  return `${parts.weekday}, ${parts.day} ${parts.month} ${parts.year}`;
}
