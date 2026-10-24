import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/db";
import { listEmployees } from "@/lib/employees/employees";
import { listLeaveRequests } from "@/lib/leave/requests";
import { listLeaveTypes } from "@/lib/leave/types";
import { requireRole } from "@/lib/session";
import { formatOfficeDate } from "@/lib/time";
import { cn } from "@/lib/utils";

import { DecisionButtons } from "./decision-buttons";
import { LeaveForm } from "./leave-form";

export const metadata: Metadata = { title: "Leave" };

export default function LeavePage() {
  return (
    <>
      <PageHeader
        title="Leave"
        description="Record leave, approve it, and track what each employee has left."
        actions={
          <Link href="/leave/types" className={buttonVariants({ variant: "outline" })}>
            Leave types
          </Link>
        }
      />
      <Suspense fallback={<p className="mt-6 text-sm text-muted-foreground">Loading leave</p>}>
        <LeaveContent />
      </Suspense>
    </>
  );
}

const statusLabel = { pending: "Waiting for approval", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled" } as const;

function dates(from: string, to: string): string {
  return from === to ? formatOfficeDate(from) : `${formatOfficeDate(from)} to ${formatOfficeDate(to)}`;
}

async function LeaveContent() {
  await requireRole("owner", "hr");

  const db = getDb();
  const [people, types, requests] = await Promise.all([
    listEmployees(db, "active"),
    listLeaveTypes(db, { activeOnly: true }),
    listLeaveRequests(db),
  ]);

  return (
    <div className="mt-6 grid max-w-4xl gap-6">
      <section className="rounded-lg border border-border bg-card p-5 md:p-6">
        <h2 className="text-base font-semibold">Record leave</h2>
        {types.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
            There are no leave types yet.{" "}
            <Link href="/leave/types" className="underline underline-offset-2">
              Add the kinds of leave your office gives
            </Link>{" "}
            first, then come back to record leave.
          </p>
        ) : people.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
            There are no employees yet.{" "}
            <Link href="/employees" className="underline underline-offset-2">
              Add employees
            </Link>{" "}
            first.
          </p>
        ) : (
          <div className="mt-5">
            <LeaveForm
              employees={people.map((p) => ({ id: p.id, name: p.name, empCode: p.empCode }))}
              leaveTypes={types.map((t) => ({ id: t.id, name: t.name }))}
            />
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-5 md:p-6">
        <h2 className="text-base font-semibold">
          Requests <span className="font-normal text-muted-foreground">({requests.length})</span>
        </h2>
        {requests.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
            No leave recorded yet. Use the form above when an employee asks for leave.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border rounded-md border border-border">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1 px-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {r.employeeName} <span className="font-normal text-muted-foreground">({r.empCode})</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {r.leaveTypeName}, {dates(r.fromDate, r.toDate)}, {r.days} {r.days === 1 ? "working day" : "working days"}
                    {r.unpaidDays > 0 ? `, ${r.unpaidDays} unpaid` : ""}
                  </p>
                  {r.note ? <p className="text-sm text-muted-foreground">{r.note}</p> : null}
                  <DecisionButtons id={r.id} status={r.status} />
                </div>
                <p
                  className={cn(
                    "text-sm font-medium",
                    r.status === "pending" && "text-foreground",
                    r.status === "approved" && "text-primary",
                    (r.status === "rejected" || r.status === "cancelled") && "text-muted-foreground",
                  )}
                >
                  {statusLabel[r.status]}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
