import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/db";
import { clockState, describeClock } from "@/lib/devices/clock";
import { describeAge, deviceStatus, listDevices, OFFLINE_AFTER_MINUTES, type DeviceStatus } from "@/lib/devices/devices";
import { listUnmatchedCodes } from "@/lib/punches/unmatched";
import { requireRole } from "@/lib/session";
import { formatOfficeDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";

import { AddDeviceForm } from "./add-device-form";
import { DeviceControls } from "./device-card";

export const metadata: Metadata = { title: "Devices" };

export default function DevicesPage() {
  return (
    <>
      <PageHeader
        title="Devices"
        description="Only devices listed here can send punches. Add the serial number of each one."
      />
      <Suspense fallback={<p className="mt-6 text-sm text-muted-foreground">Loading devices</p>}>
        <DevicesContent />
      </Suspense>
    </>
  );
}

const statusLabel: Record<DeviceStatus, string> = {
  online: "Online",
  offline: "Offline",
  never: "Never connected",
};

function StatusBadge({ status, active }: { status: DeviceStatus; active: boolean }) {
  if (!active) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <span aria-hidden className="size-2 rounded-full border border-muted-foreground" />
        Not accepted
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm font-medium",
        status === "online" ? "text-primary" : "text-muted-foreground",
      )}
    >
      <span
        aria-hidden
        className={cn("size-2 rounded-full", status === "online" ? "bg-primary" : "bg-muted-foreground/50")}
      />
      {statusLabel[status]}
    </span>
  );
}

/** Reads the current time, so it renders after the session check, inside Suspense. */
async function DevicesContent() {
  await requireRole("owner", "hr");

  const db = getDb();
  const [list, unmatched] = await Promise.all([listDevices(db), listUnmatchedCodes(db)]);
  const now = new Date();

  return (
    <div className="mt-6 grid max-w-3xl gap-6">
      <section className="rounded-lg border border-border bg-card p-5 md:p-6">
        <h2 className="text-base font-semibold">Add a device</h2>
        <div className="mt-5">
          <AddDeviceForm />
        </div>
      </section>

      {list.length === 0 ? (
        <p className="rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
          No devices yet. Add the serial number above, then point the device at this server.
        </p>
      ) : (
        list.map((device) => {
          const status = deviceStatus(device.lastSeenAt, now);
          const age = describeAge(device.lastSeenAt, now);
          const clock = clockState(device.clockOffsetSeconds);
          return (
            <section key={device.id} className="rounded-lg border border-border bg-card p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold">{device.name}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">Serial number {device.serialNo}</p>
                </div>
                <StatusBadge status={status} active={device.active} />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {device.lastSeenAt && age ? (
                  <>
                    Last seen {age}, {formatOfficeDateTime(device.lastSeenAt)}.
                    {device.active && status === "offline"
                      ? ` Offline means nothing heard for more than ${OFFLINE_AFTER_MINUTES} minutes.`
                      : ""}
                  </>
                ) : (
                  "It has not contacted the server yet."
                )}
              </p>
              {device.active ? (
                <p
                  className={cn(
                    "mt-2 text-sm",
                    clock.kind === "drifted" ? "rounded-md border border-destructive/40 bg-destructive/10 p-3 text-foreground" : "text-muted-foreground",
                  )}
                  role={clock.kind === "drifted" ? "alert" : undefined}
                >
                  {describeClock(clock)}
                  {clock.kind !== "unchecked" && device.clockCheckedAt ? ` Checked ${formatOfficeDateTime(device.clockCheckedAt)}.` : ""}
                </p>
              ) : null}
              <div className="mt-5 border-t border-border pt-5">
                <DeviceControls device={device} />
              </div>
            </section>
          );
        })
      )}

      <section className="rounded-lg border border-border bg-card p-5 md:p-6">
        <h2 className="text-base font-semibold">Punches from unknown employee codes</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          These codes punched on a device but no employee has them. Usually someone was enrolled at the device and not
          added here yet. Add them with the same code and their punches count automatically.
        </p>
        {unmatched.length === 0 ? (
          <p className="mt-4 rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
            None. Every punch received so far belongs to an employee.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border rounded-md border border-border">
            {unmatched.map((row) => (
              <li key={row.empCode} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Code {row.empCode}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.punches === 1 ? "1 punch" : `${row.punches} punches`}, last{" "}
                    {formatOfficeDateTime(row.lastPunchAt)}
                    {row.devices.length > 0 ? ` on ${row.devices.join(", ")}` : ""}
                  </p>
                </div>
                <Link
                  href={`/employees/new?code=${encodeURIComponent(row.empCode)}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Add employee with this code
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
