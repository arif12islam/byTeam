import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/db";
import { listEmployees } from "@/lib/employees/employees";
import { loadBalances, type Balance } from "@/lib/leave/balances";
import { listLeaveRequests } from "@/lib/leave/requests";
import { getLeaveYearBasis, listLeaveTypes } from "@/lib/leave/types";
import { requireRole } from "@/lib/session";
import { formatOfficeDate, toOfficeDate } from "@/lib/time";
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

function BalanceCell({ balance }: { balance: Balance | undefined }) {
  if (!balance) return <span className="text-muted-foreground">-</span>;
  const pending = balance.pending > 0 ? <span className="block text-xs text-muted-foreground">{balance.pending} waiting for approval</span> : null;
  if (balance.quota === null || balance.remaining === null) {
    return (
      <>
        <span>{balance.used === 1 ? "1 day taken" : `${balance.used} days taken`}</span>
        <span className="block text-xs text-muted-foreground">No limit</span>
        {pending}
      </>
    );
  }
  return (
    <>
      <span className={cn("font-medium tabular-nums", balance.remaining < 0 && "text-destructive")}>
        {balance.remaining} left
      </span>
      <span className="block text-xs text-muted-foreground">
        {balance.used} of {balance.quota} taken
      </span>
      {pending}
    </>
  );
}

async function LeaveContent() {
  await requireRole("owner", "hr");

  const db = getDb();
  const today = toOfficeDate(new Date());
  const [people, types, requests, balances, basis] = await Promise.all([
    listEmployees(db, "active"),
    listLeaveTypes(db, { activeOnly: true }),
    listLeaveRequests(db),
    loadBalances(db, { onDate: today }),
    getLeaveYearBasis(db),
  ]);
  const balanceOf = new Map(balances.map((b) => [`${b.employeeId}|${b.leaveTypeId}`, b]));

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

      {people.length > 0 && types.length > 0 ? (
        <section className="rounded-lg border border-border bg-card p-5 md:p-6">
          <h2 className="text-base font-semibold">Balances</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {basis === "calendar"
              ? `Days left this year, 1 January to 31 December ${today.slice(0, 4)}.`
              : "Days left this year, counted from each person's joining date."}{" "}
            Only approved leave is taken off. Weekly off days and holidays are not counted.
          </p>
          <div className="mt-4 overflow-x-auto rounded-md border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th scope="col" className="sticky left-0 bg-card px-3 py-2 font-medium">
                    Employee
                  </th>
                  {types.map((t) => (
                    <th key={t.id} scope="col" className="min-w-28 px-3 py-2 font-medium">
                      {t.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-b-0">
                    <th scope="row" className="sticky left-0 bg-card px-3 py-2 text-left font-medium">
                      {p.name}
                      <span className="block text-xs font-normal text-muted-foreground">Code {p.empCode}</span>
                    </th>
                    {types.map((t) => (
                      <td key={t.id} className="px-3 py-2">
                        <BalanceCell balance={balanceOf.get(`${p.id}|${t.id}`)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

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
