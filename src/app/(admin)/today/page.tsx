import { ArrowRight, Fingerprint, Sunrise, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { Alert } from "@/components/ui/alert";
import { Card, CardTitle } from "@/components/ui/card";
import { Ring } from "@/components/ui/ring";
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
import { describeAge, deviceStatus, listDevices } from "@/lib/devices/devices";
import { listUnmatchedCodes } from "@/lib/punches/unmatched";
import { requireRole } from "@/lib/session";
import { formatOfficeDate, formatOfficeTime, officeMinuteOfDay, toOfficeDate } from "@/lib/time";
import { cn } from "@/lib/utils";

import { ArrivalsChart } from "./arrivals-chart";
import { TodayBoard, type BoardEntry } from "./board";
import { LiveRefresh } from "./live-refresh";
import { PunchFeed } from "./punch-feed";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <>
      <PageHeader icon={Sunrise} title="Today" description="Who is in, who is late, and whether the device is online." />
      <Suspense fallback={<p className="mt-6 text-sm text-muted-foreground">Loading today</p>}>
        <TodayContent />
      </Suspense>
    </>
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

function greeting(now: Date): string {
  const hour = Math.floor(officeMinuteOfDay(now) / 60);
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
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

  return (
    <div className="mt-6 grid gap-5">
      <section className="relative overflow-hidden rounded-3xl bg-forest p-5 text-forest-foreground shadow-card sm:p-7">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-forest-active/40 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-x-8 gap-y-5">
          <Ring
            size={132}
            thickness={14}
            track="stroke-forest-line"
            segments={[
              { value: onTime, tone: "success", label: "On time" },
              { value: counts.late, tone: "warning", label: "Late" },
              { value: counts.onLeave, tone: "info", label: "On leave" },
              { value: counts.notInYet, tone: "off", label: "Not in yet" },
              { value: counts.absent, tone: "danger", label: "Absent" },
            ]}
          >
            <div>
              <p className="text-3xl font-semibold leading-none tabular-nums">{counts.in}</p>
              <p className="mt-1 text-xs text-forest-muted">of {expected} in</p>
            </div>
          </Ring>
          <div className="min-w-0 flex-1 basis-56">
            <p className="text-sm text-forest-muted">
              {greeting(now)}. {formatOfficeDate(today)}
              {board.offDay === "holiday" ? ", office holiday" : board.offDay === "weekly_off" ? ", weekly off day" : ""}
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              {expected === 0
                ? board.offDay
                  ? "A day off for the office"
                  : "No one expected today"
                : counts.absent > 0
                  ? `${counts.absent} absent, ${counts.in} in`
                  : counts.late > 0
                    ? `${counts.in} in, ${counts.late} late`
                    : counts.in === expected
                      ? "Everyone is in"
                      : `${counts.in} in so far`}
            </p>
            <p className="mt-2 text-sm text-forest-foreground/80">
              {counts.onLeave > 0 ? `${counts.onLeave} on leave. ` : ""}
              {counts.notInYet > 0 ? `${counts.notInYet} not in yet.` : ""}
            </p>
            <div className="mt-4 border-t border-forest-line pt-3">
              <LiveRefresh generatedAt={now.getTime()} />
            </div>
          </div>
        </div>
      </section>

      {offlineDevices.length > 0 ? (
        <Alert tone="danger" icon={TriangleAlert}>
          {offlineDevices.length === 1 ? `${offlineDevices[0].name} is offline.` : `${offlineDevices.length} devices are offline.`}{" "}
          Punches are kept on the device and arrive when it reconnects.{" "}
          <Link href="/devices" className="font-medium underline underline-offset-2">
            Check the Devices screen
          </Link>
        </Alert>
      ) : null}
      {unmatched.length > 0 ? (
        <Alert tone="warning" icon={TriangleAlert}>
          {unmatched.length === 1 ? "1 employee code has" : `${unmatched.length} employee codes have`} punched but{" "}
          {unmatched.length === 1 ? "belongs" : "belong"} to nobody.{" "}
          <Link href="/devices" className="font-medium underline underline-offset-2">
            Review them on the Devices screen
          </Link>
        </Alert>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_20rem]">
        <TodayBoard entries={entries} counts={counts} date={today} />

        <div className="grid gap-5 lg:sticky lg:top-6">
          <PunchFeed items={feed} now={now} />
          {buckets.length > 0 ? (
            <Card>
              <CardTitle icon={Sunrise}>Arrivals</CardTitle>
              <p className="mb-4 mt-1.5 text-sm text-muted-foreground">First punch of each person, by quarter hour.</p>
              <ArrivalsChart buckets={buckets} />
            </Card>
          ) : null}
          <DeviceCard devices={devices} now={now} />
        </div>
      </div>
    </div>
  );
}

function DeviceCard({ devices, now }: { devices: Awaited<ReturnType<typeof listDevices>>; now: Date }) {
  return (
    <Card>
      <CardTitle
        icon={Fingerprint}
        action={
          <Link href="/devices" aria-label="Open the Devices screen" className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-secondary">
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        }
      >
        Device
      </CardTitle>
      {devices.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No device is set up.{" "}
          <Link href="/devices" className="font-medium text-primary underline underline-offset-2">
            Add one on the Devices screen
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-3 grid gap-3">
          {devices.map((device) => {
            const status = deviceStatus(device.lastSeenAt, now);
            const age = describeAge(device.lastSeenAt, now);
            return (
              <li key={device.id} className="flex items-center gap-3">
                <span className="relative flex size-3 shrink-0">
                  {status === "online" ? (
                    <span aria-hidden className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
                  ) : null}
                  <span
                    aria-hidden
                    className={cn(
                      "relative inline-flex size-3 rounded-full",
                      status === "online" ? "bg-success" : status === "offline" ? "bg-danger" : "bg-off",
                    )}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{device.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {status === "online" ? "Online" : status === "offline" ? "Offline" : "Never connected"}
                    {age ? `, last seen ${age}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
