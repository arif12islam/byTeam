import { CalendarMinus, ListChecks, Scale } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
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
        icon={CalendarMinus}
        accent="violet"
        title="Leave"
        description="Record leave, approve it, and track what each employee has left."
        actions={
          <Link href="/leave/types" className={buttonVariants({ variant: "onColor" })}>
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
const statusTone = { pending: "warning", approved: "success", rejected: "danger", cancelled: "off" } as const;

function dates(from: string, to: string): string {
  return from === to ? formatOfficeDate(from) : `${formatOfficeDate(from)} to ${formatOfficeDate(to)}`;
}

function BalanceRow({ name, balance }: { name: string; balance: Balance | undefined }) {
  if (!balance) return null;
  const limited = balance.quota !== null && balance.remaining !== null;
  const share = limited && balance.quota! > 0 ? Math.min(1, balance.used / balance.quota!) : 0;
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">{name}</span>
        {limited ? (
          <span className={cn("shrink-0 font-semibold tabular-nums", balance.remaining! < 0 && "text-danger")}>{balance.remaining} left</span>
        ) : (
          <span className="shrink-0 text-muted-foreground">{balance.used === 1 ? "1 day taken" : `${balance.used} days taken`}</span>
        )}
      </div>
      {limited ? (
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary" role="meter" aria-label={`${name} used`} aria-valuemin={0} aria-valuemax={balance.quota!} aria-valuenow={Math.min(balance.used, balance.quota!)}>
          <div className={cn("h-full rounded-full", balance.remaining! < 0 ? "bg-danger" : "bg-violet-500")} style={{ width: `${share * 100}%` }} />
        </div>
      ) : null}
      <p className="mt-1 text-xs text-muted-foreground">
        {limited ? `${balance.used} of ${balance.quota} taken` : "No limit"}
        {balance.pending > 0 ? `, ${balance.pending} waiting for approval` : ""}
      </p>
    </li>
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
    <div className="mt-6 grid max-w-4xl gap-5">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5">
        <CardTitle icon={CalendarMinus} accent="violet">Record leave</CardTitle>
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
        <section className="rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5">
          <CardTitle icon={Scale} accent="indigo">Balances</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {basis === "calendar"
              ? `Days left this year, 1 January to 31 December ${today.slice(0, 4)}.`
              : "Days left this year, counted from each person's joining date."}{" "}
            Only approved leave is taken off. Weekly off days and holidays are not counted.
          </p>
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {people.map((p) => (
              <li key={p.id} className="rounded-2xl border border-border bg-background p-4">
                <div className="flex items-center gap-3">
                  <Avatar name={p.name} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{p.name}</p>
                    <p className="text-xs text-muted-foreground">Code {p.empCode}</p>
                  </div>
                </div>
                <ul className="mt-4 grid gap-4">
                  {types.map((t) => (
                    <BalanceRow key={t.id} name={t.name} balance={balanceOf.get(`${p.id}|${t.id}`)} />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5">
        <CardTitle icon={ListChecks} accent="pink" count={requests.length}>
          Requests
        </CardTitle>
        {requests.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
            No leave recorded yet. Use the form above when an employee asks for leave.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {requests.map((r) => (
              <li key={r.id} className="flex items-start gap-3 py-4">
                <Avatar name={r.employeeName} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <p className="text-sm font-semibold">
                      {r.employeeName} <span className="font-normal text-muted-foreground">({r.empCode})</span>
                    </p>
                    <Badge tone={statusTone[r.status]}>{statusLabel[r.status]}</Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {r.leaveTypeName}, {dates(r.fromDate, r.toDate)}, {r.days} {r.days === 1 ? "working day" : "working days"}
                    {r.unpaidDays > 0 ? `, ${r.unpaidDays} unpaid` : ""}
                  </p>
                  {r.note ? <p className="text-sm text-muted-foreground">{r.note}</p> : null}
                  <DecisionButtons id={r.id} status={r.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
