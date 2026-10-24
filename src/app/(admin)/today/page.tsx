import { Fingerprint, Sunrise, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Alert } from "@/components/ui/alert";
import { Card, CardTitle } from "@/components/ui/card";
import type { Tone } from "@/components/ui/tone";
import { getDb } from "@/db";
import {
  arrivalBuckets,
  buildPunchFeed,
  groupPunchesByCode,
  loadDayPunches,
  loadTodayBoard,
  type TodayEntry,
} from "@/lib/attendance/today";
import { deviceStatus, listDevices } from "@/lib/devices/devices";
import { listUnmatchedCodes } from "@/lib/punches/unmatched";
import { requireRole } from "@/lib/session";
import { formatOfficeDate, formatOfficeTime, toOfficeDate } from "@/lib/time";
import { cn } from "@/lib/utils";

import { ArrivalsChart } from "./arrivals-chart";
import { TodayBoard, type BoardEntry } from "./board";
import { PunchFeed } from "./punch-feed";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading today</p>}>
      <TodayContent />
    </Suspense>
  );
}

/** The badge and the time text on the right of a person's row. */
function describeEntry(entry: TodayEntry): { tone: Tone; badge: string; detail: string } {
  if (entry.group === "in" || entry.group === "worked_off_day") {
    const arrived = entry.firstIn ? `In ${formatOfficeTime(entry.firstIn)}` : "";
    const left = entry.lastOut ? `, out ${formatOfficeTime(entry.lastOut)}` : ", not out yet";
    const late = entry.status === "late";
    return {
      tone: late ? "warning" : "success",
      badge: late ? `${entry.lateMinutes} min late` : "On time",
      detail: `${arrived}${left}`,
    };
  }
  if (entry.group === "on_leave") {
    return { tone: "info", badge: entry.status === "leave_unpaid" ? "Unpaid leave" : "Paid leave", detail: "" };
  }
  if (entry.group === "absent") return { tone: "danger", badge: "Absent", detail: `Shift ${entry.shiftLabel}` };
  return { tone: "off", badge: "Not in yet", detail: `Shift ${entry.shiftLabel}` };
}

/** Reads the current time and the database, so it renders after the session check, inside Suspense. */
async function TodayContent() {
  await requireRole("owner", "hr");

  const db = getDb();
  const now = new Date();
  const today = toOfficeDate(now);
  const [board, deviceList, unmatched, dayPunches] = await Promise.all([
    loadTodayBoard(db, now),
    listDevices(db),
    listUnmatchedCodes(db),
    loadDayPunches(db, today),
  ]);
  const devices = deviceList.filter((d) => d.active);
  const offlineDevices = devices.filter((d) => deviceStatus(d.lastSeenAt, now) === "offline");
  const { counts } = board;
  const onTime = counts.in - counts.late;
  const expected = counts.in + counts.notInYet + counts.absent + counts.onLeave;
  const buckets = arrivalBuckets(board.entries);
  const punchTimes = groupPunchesByCode(dayPunches);
  const feed = buildPunchFeed(dayPunches, board.entries);
  const entries: BoardEntry[] = board.entries.map((entry) => {
    const { tone, badge, detail } = describeEntry(entry);
    return {
      id: entry.id,
      empCode: entry.empCode,
      name: entry.name,
      department: entry.department,
      group: entry.group,
      late: entry.status === "late",
      tone,
      badge,
      detail,
      shiftLabel: entry.shiftLabel,
      punches: (punchTimes.get(entry.empCode) ?? []).map(formatOfficeTime),
      missingOut: entry.missingOut,
    };
  });

  const headline =
    expected === 0
      ? board.offDay
        ? "A day off for the office"
        : "No one expected today"
      : counts.absent > 0
        ? `${counts.absent} absent, ${counts.in} in`
        : counts.late > 0
          ? `${counts.in} in, ${counts.late} late`
          : counts.in === expected
            ? "Everyone is in"
            : `${counts.in} in so far`;
  const title = `Today, ${formatOfficeDate(today)}${board.offDay === "holiday" ? ", office holiday" : board.offDay === "weekly_off" ? ", weekly off day" : ""}`;

  // One slim line about the device, instead of a card of its own.
  const online = devices.filter((d) => deviceStatus(d.lastSeenAt, now) === "online").length;
  const deviceNote =
    devices.length === 0 ? null : (
      <Link href="/devices" className="inline-flex items-center gap-1.5 text-xs text-white/90 hover:text-white">
        <span
          aria-hidden
          className={cn("size-2 rounded-full", online === devices.length ? "bg-lime-300" : online > 0 ? "bg-amber-300" : "bg-rose-300")}
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

  const aside = (
    <>
      <PunchFeed items={feed} now={now} />
      {buckets.length > 0 ? (
        <Card className="p-3 sm:p-3.5">
          <CardTitle icon={Sunrise}>Arrivals</CardTitle>
          <div className="mt-3">
            <ArrivalsChart buckets={buckets} />
          </div>
        </Card>
      ) : null}
    </>
  );

  return (
    <TodayBoard
      entries={entries}
      counts={counts}
      date={today}
      hero={{
        title,
        headline,
        expected,
        generatedAt: now.getTime(),
        segments: [
          { value: onTime, tone: "success", label: "On time" },
          { value: counts.late, tone: "warning", label: "Late" },
          { value: counts.onLeave, tone: "info", label: "On leave" },
          { value: counts.notInYet, tone: "off", label: "Not in yet" },
          { value: counts.absent, tone: "danger", label: "Absent" },
        ],
      }}
      deviceNote={deviceNote}
      notices={notices}
      aside={aside}
    />
  );
}
