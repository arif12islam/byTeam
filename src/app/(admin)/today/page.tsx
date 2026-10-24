import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { getDb } from "@/db";
import { loadTodayBoard, type TodayEntry, type TodayGroup } from "@/lib/attendance/today";
import { describeAge, deviceStatus, listDevices } from "@/lib/devices/devices";
import { listUnmatchedCodes } from "@/lib/punches/unmatched";
import { requireRole } from "@/lib/session";
import { formatOfficeDate, formatOfficeTime, toOfficeDate } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <>
      <PageHeader title="Today" description="Who is in, who is late, and whether the device is online." />
      <Suspense fallback={<p className="mt-6 text-sm text-muted-foreground">Loading today</p>}>
        <TodayContent />
      </Suspense>
    </>
  );
}

const sections: { group: TodayGroup; title: string; hint?: string }[] = [
  { group: "absent", title: "Absent", hint: "No punch, and the shift is over." },
  { group: "not_in_yet", title: "Not in yet", hint: "No punch so far. Their shift has not ended." },
  { group: "in", title: "In" },
  { group: "worked_off_day", title: "Came in on a day off" },
  { group: "on_leave", title: "On leave" },
];

function Tile({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone === "warn" && value > 0 && "text-destructive")}>
        {value}
      </p>
    </div>
  );
}

function describeEntry(entry: TodayEntry): string {
  if (entry.group === "in" || entry.group === "worked_off_day") {
    const arrived = entry.firstIn ? `In at ${formatOfficeTime(entry.firstIn)}` : "";
    const left = entry.lastOut ? `, out at ${formatOfficeTime(entry.lastOut)}` : ", not out yet";
    const late = entry.status === "late" ? `, ${entry.lateMinutes} min late` : "";
    return `${arrived}${late}${left}`;
  }
  if (entry.group === "on_leave") return entry.status === "leave_unpaid" ? "Unpaid leave" : "Paid leave";
  return `Shift ${entry.shiftLabel}`;
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

  return (
    <div className="mt-6 grid max-w-3xl gap-6">
      <p className="text-sm text-muted-foreground">
        {formatOfficeDate(toOfficeDate(now))}
        {board.offDay === "holiday" ? ". Office holiday." : board.offDay === "weekly_off" ? ". Weekly off day." : ""}
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        <Tile label="In" value={board.counts.in} />
        <Tile label="Late" value={board.counts.late} />
        <Tile label="Not in yet" value={board.counts.notInYet} />
        <Tile label="Absent" value={board.counts.absent} tone="warn" />
        <Tile label="On leave" value={board.counts.onLeave} />
      </div>

      {board.entries.length === 0 ? (
        <p className="rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
          No employees yet.{" "}
          <Link href="/employees" className="underline underline-offset-2">
            Add your team on the Employees screen
          </Link>{" "}
          and today will fill in as they punch.
        </p>
      ) : (
        sections.map(({ group, title, hint }) => {
          const rows = board.entries.filter((e) => e.group === group);
          if (rows.length === 0) return null;
          return (
            <section key={group} className="rounded-lg border border-border bg-card p-5 md:p-6">
              <h2 className="text-base font-semibold">
                {title} <span className="font-normal text-muted-foreground">({rows.length})</span>
              </h2>
              {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
              <ul className="mt-4 divide-y divide-border rounded-md border border-border">
                {rows.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{entry.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Code {entry.empCode}
                        {entry.department ? `, ${entry.department}` : ""}
                      </p>
                    </div>
                    <p className={cn("text-sm", entry.status === "late" ? "text-destructive" : "text-muted-foreground")}>
                      {describeEntry(entry)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}

      <section className="rounded-lg border border-border bg-card p-5 md:p-6">
        <h2 className="text-base font-semibold">Device</h2>
        {devices.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No device is set up.{" "}
            <Link href="/devices" className="underline underline-offset-2">
              Add one on the Devices screen
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {devices.map((device) => {
              const status = deviceStatus(device.lastSeenAt, now);
              const age = describeAge(device.lastSeenAt, now);
              return (
                <li key={device.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium">{device.name}</span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5",
                      status === "online" ? "text-primary" : status === "offline" ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "size-2 rounded-full",
                        status === "online" ? "bg-primary" : status === "offline" ? "bg-destructive" : "bg-muted-foreground/50",
                      )}
                    />
                    <span>
                      {status === "online" ? "Online" : status === "offline" ? "Offline" : "Never connected"}
                      {age ? `, last seen ${age}` : ""}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {unmatched.length > 0 ? (
          <p className="mt-4 rounded-md border border-border bg-muted px-3 py-2 text-sm">
            {unmatched.length === 1 ? "1 employee code has" : `${unmatched.length} employee codes have`} punched but{" "}
            {unmatched.length === 1 ? "belongs" : "belong"} to nobody.{" "}
            <Link href="/devices" className="underline underline-offset-2">
              Review them on the Devices screen
            </Link>
            .
          </p>
        ) : null}
      </section>
    </div>
  );
}
