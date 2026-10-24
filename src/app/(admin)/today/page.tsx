import {
  AlarmClock,
  ArrowRight,
  CalendarOff,
  Fingerprint,
  Hourglass,
  Plane,
  Sunrise,
  TriangleAlert,
  UserCheck,
  UserX,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Ring } from "@/components/ui/ring";
import { StatTile } from "@/components/ui/stat-tile";
import type { Tone } from "@/components/ui/tone";
import { getDb } from "@/db";
import { arrivalBuckets, loadTodayBoard, type TodayEntry, type TodayGroup } from "@/lib/attendance/today";
import { describeAge, deviceStatus, listDevices } from "@/lib/devices/devices";
import { listUnmatchedCodes } from "@/lib/punches/unmatched";
import { requireRole } from "@/lib/session";
import { formatOfficeDate, formatOfficeTime, toOfficeDate } from "@/lib/time";
import { cn } from "@/lib/utils";

import { ArrivalsChart } from "./arrivals-chart";

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

const sections: { group: TodayGroup; title: string; hint?: string; icon: LucideIcon }[] = [
  { group: "absent", title: "Absent", hint: "No punch, and the shift is over.", icon: UserX },
  { group: "not_in_yet", title: "Not in yet", hint: "No punch so far. Their shift has not ended.", icon: Hourglass },
  { group: "in", title: "In", icon: UserCheck },
  { group: "worked_off_day", title: "Came in on a day off", icon: CalendarOff },
  { group: "on_leave", title: "On leave", icon: Plane },
];

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

function PersonRow({ entry }: { entry: TodayEntry }) {
  const { tone, badge, detail } = describeEntry(entry);
  return (
    <li className="flex items-center gap-3 py-3">
      <Avatar name={entry.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{entry.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          Code {entry.empCode}
          {entry.department ? `, ${entry.department}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge tone={tone}>{badge}</Badge>
        {detail ? <p className="text-xs tabular-nums text-muted-foreground">{detail}</p> : null}
      </div>
    </li>
  );
}

/** Reads the current time and the database, so it renders after the session check, inside Suspense. */
async function TodayContent() {
  await requireRole("owner", "hr");

  const db = getDb();
  const now = new Date();
  const [board, deviceList, unmatched] = await Promise.all([
    loadTodayBoard(db, now),
    listDevices(db),
    listUnmatchedCodes(db),
  ]);
  const devices = deviceList.filter((d) => d.active);
  const offlineDevices = devices.filter((d) => deviceStatus(d.lastSeenAt, now) === "offline");
  const { counts } = board;
  const onTime = counts.in - counts.late;
  const expected = counts.in + counts.notInYet + counts.absent + counts.onLeave;
  const buckets = arrivalBuckets(board.entries);

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
              {formatOfficeDate(toOfficeDate(now))}
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile label="In" value={counts.in} icon={UserCheck} tone="success" />
        <StatTile label="Late" value={counts.late} icon={AlarmClock} tone="warning" />
        <StatTile label="Not in yet" value={counts.notInYet} icon={Hourglass} tone="off" />
        <StatTile label="Absent" value={counts.absent} icon={UserX} tone="danger" />
        <StatTile label="On leave" value={counts.onLeave} icon={Plane} tone="info" className="col-span-2 md:col-span-1" />
      </div>

      {board.entries.length === 0 ? (
        <Card className="border-dashed text-sm text-muted-foreground shadow-none">
          No employees yet.{" "}
          <Link href="/employees" className="font-medium text-primary underline underline-offset-2">
            Add your team on the Employees screen
          </Link>{" "}
          and today will fill in as they punch.
        </Card>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[1fr_20rem]">
          <div className="grid gap-5">
            {sections.map(({ group, title, hint, icon }) => {
              const rows = board.entries.filter((e) => e.group === group);
              if (rows.length === 0) return null;
              return (
                <Card key={group}>
                  <CardTitle icon={icon} count={rows.length}>
                    {title}
                  </CardTitle>
                  {hint ? <p className="mt-1.5 text-sm text-muted-foreground">{hint}</p> : null}
                  <ul className="mt-2 divide-y divide-border">
                    {rows.map((entry) => (
                      <PersonRow key={entry.id} entry={entry} />
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>

          <div className="grid gap-5 lg:sticky lg:top-6">
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
      )}

      {board.entries.length === 0 ? <DeviceCard devices={devices} now={now} /> : null}
    </div>
  );
}

function Alert({
  tone,
  icon: Icon,
  children,
}: {
  tone: "danger" | "warning";
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm",
        tone === "danger" ? "border-danger/30 bg-danger-soft text-danger" : "border-warning/30 bg-warning-soft text-warning",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="min-w-0 text-foreground">{children}</p>
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
