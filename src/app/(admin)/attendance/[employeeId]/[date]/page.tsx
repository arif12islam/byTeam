import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/db";
import { listDayAdjustments, type DayAdjustment } from "@/lib/attendance/adjustments";
import { statusLabel } from "@/lib/attendance/labels";
import { loadDayDetail } from "@/lib/attendance/month";
import { requireRole } from "@/lib/session";
import { formatOfficeDate, formatOfficeDateTime, formatOfficeTime, isValidOfficeDate, toOfficeDate } from "@/lib/time";

import { AdjustForm } from "./adjust-form";

export const metadata: Metadata = { title: "Attendance day" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


export default function AttendanceDayPage(props: PageProps<"/attendance/[employeeId]/[date]">) {
  return (
    <Suspense fallback={<p className="mt-6 text-sm text-muted-foreground">Loading day</p>}>
      <DayContent params={props.params} />
    </Suspense>
  );
}

function describeAdjustment(a: DayAdjustment): string {
  const what = a.field === "status" ? "status" : a.field === "first_in" ? "came in time" : "left time";
  if (a.newValue === null) return `Removed the earlier change to ${what}`;
  if (a.field === "status") return `Set status to ${statusLabel[a.newValue as keyof typeof statusLabel] ?? a.newValue}`;
  return `Set ${what} to ${formatOfficeTime(new Date(a.newValue))}`;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{value}</dd>
    </div>
  );
}

async function DayContent({ params }: { params: PageProps<"/attendance/[employeeId]/[date]">["params"] }) {
  await requireRole("owner", "hr");

  const { employeeId, date } = await params;
  if (!UUID.test(employeeId) || !isValidOfficeDate(date)) notFound();

  const today = toOfficeDate(new Date());
  const db = getDb();
  const [detail, adjustments] = await Promise.all([loadDayDetail(db, employeeId, date), listDayAdjustments(db, employeeId, date)]);
  if (!detail) notFound();

  const { employee, result, punches } = detail;
  const back = `/attendance?month=${date.slice(0, 7)}`;

  return (
    <>
      <BackLink href={back}>Back to attendance</BackLink>
      <PageHeader
        avatar={employee.name}
        title={employee.name}
        description={`${formatOfficeDate(date)}. Code ${employee.empCode}${employee.department ? `, ${employee.department}` : ""}.`}
      />

      <div className="mt-6 grid max-w-3xl gap-6">
        <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
          <h2 className="text-base font-semibold">The day</h2>
          {date > today ? (
            <p className="mt-3 text-sm text-muted-foreground">That day has not happened yet.</p>
          ) : result === null ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {employee.name} was not employed on this day, so there is no record.
            </p>
          ) : (
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              <Fact label="Status" value={statusLabel[result.status] + (result.isManual ? " (corrected by hand)" : "")} />
              <Fact label="Came in" value={result.firstIn ? formatOfficeTime(result.firstIn) : "No punch"} />
              <Fact label="Left" value={result.lastOut ? formatOfficeTime(result.lastOut) : result.firstIn ? "No leaving punch" : "No punch"} />
              <Fact label="Late" value={result.lateMinutes > 0 ? `${result.lateMinutes} min` : "No"} />
              <Fact label="Left early" value={result.earlyMinutes > 0 ? `${result.earlyMinutes} min` : "No"} />
              <Fact label="Shift" value={`${employee.shiftName}, ${employee.shiftStart} to ${employee.shiftEnd}, ${employee.graceMinutes} min grace`} />
              {result.workedOnOffDay ? <Fact label="Day off" value="Came in on a day off" /> : null}
            </dl>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
          <h2 className="text-base font-semibold">
            Punches <span className="font-normal text-muted-foreground">({punches.length})</span>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Exactly what the device sent for this day. They are never changed.</p>
          {punches.length === 0 ? (
            <p className="mt-4 rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
              The device sent no punches for this day.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border rounded-md border border-border">
              {punches.map((punch) => (
                <li key={`${punch.deviceSn}-${punch.at.toISOString()}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm">
                  <span className="font-medium tabular-nums">{formatOfficeTime(punch.at)}</span>
                  <span className="text-muted-foreground">{punch.deviceName ?? `Device ${punch.deviceSn}`}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {result !== null && date <= today ? (
          <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
            <h2 className="text-base font-semibold">Correct this day</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Use this when the device missed a punch or the status is wrong. The punches stay as they are; your change
              is added on top and the reason is kept.
            </p>
            <div className="mt-5">
              <AdjustForm employeeId={employee.id} date={date} />
            </div>
          </section>
        ) : null}

        {adjustments.length > 0 ? (
          <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
            <h2 className="text-base font-semibold">
              Changes made by hand <span className="font-normal text-muted-foreground">({adjustments.length})</span>
            </h2>
            <ul className="mt-4 divide-y divide-border rounded-md border border-border">
              {adjustments.map((a) => (
                <li key={a.id} className="px-3 py-3 text-sm">
                  <p className="font-medium">{describeAdjustment(a)}</p>
                  <p className="mt-0.5 text-muted-foreground">{a.reason}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {a.by ?? "Unknown"}, {formatOfficeDateTime(a.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
