import { CalendarMinus } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/db";
import { getLeaveYearBasis, listLeaveTypes } from "@/lib/leave/types";
import { requireRole } from "@/lib/session";

import { LeaveTypeForm } from "./leave-type-form";
import { YearBasisForm } from "./year-form";

export const metadata: Metadata = { title: "Leave types" };

export default function LeaveTypesPage() {
  return (
    <>
      <BackLink href="/leave">Back to leave</BackLink>
      <PageHeader icon={CalendarMinus} title="Leave types" description="The kinds of leave and how many days each person gets a year." />
      <Suspense fallback={<p className="mt-6 text-sm text-muted-foreground">Loading leave types</p>}>
        <LeaveTypesContent />
      </Suspense>
    </>
  );
}

async function LeaveTypesContent() {
  await requireRole("owner", "hr");

  const db = getDb();
  const [types, basis] = await Promise.all([listLeaveTypes(db), getLeaveYearBasis(db)]);

  return (
    <div className="mt-6 grid max-w-4xl gap-6">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5">
        <h2 className="text-base font-semibold">Leave year</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Decide this before approving leave. Changing it later changes every balance.
        </p>
        <div className="mt-5">
          <YearBasisForm basis={basis} />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5">
        <h2 className="text-base font-semibold">Add a leave type</h2>
        <div className="mt-5">
          <LeaveTypeForm />
        </div>
      </section>

      {types.length === 0 ? (
        <p className="rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
          No leave types yet. Add the kinds of leave your office gives, such as casual, sick and annual, then record
          leave against them.
        </p>
      ) : (
        types.map((type) => (
          <section key={type.id} className="rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold">
                {type.name}
                {type.active ? null : <span className="ml-2 text-sm font-normal text-muted-foreground">Not in use</span>}
              </h2>
              <p className="text-sm text-muted-foreground">
                {type.isPaid ? "Paid" : "Unpaid"}
                {" · "}
                {type.yearlyQuota === null ? "No yearly limit" : `${type.yearlyQuota} ${type.yearlyQuota === 1 ? "day" : "days"} a year`}
                {" · "}
                {type.requestCount === 1 ? "1 request" : `${type.requestCount} requests`}
              </p>
            </div>
            <div className="mt-5">
              <LeaveTypeForm leaveType={type} />
            </div>
          </section>
        ))
      )}
    </div>
  );
}
