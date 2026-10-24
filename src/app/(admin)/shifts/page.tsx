import { Timer } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { getDb } from "@/db";
import { requireRole } from "@/lib/session";
import { formatShiftLength, listShifts } from "@/lib/shifts/shifts";

import { ShiftForm } from "./shift-form";

export const metadata: Metadata = { title: "Shifts" };

export default function ShiftsPage() {
  return (
    <>
      <PageHeader
        icon={Timer}
        accent="sky"
        title="Shifts"
        description="Working hours. A person is late when their first punch is after the start plus the grace minutes."
      />
      <Suspense fallback={<p className="mt-6 text-sm text-muted-foreground">Loading shifts</p>}>
        <ShiftsContent />
      </Suspense>
    </>
  );
}

async function ShiftsContent() {
  await requireRole("owner", "hr");
  const shifts = await listShifts(getDb());

  return (
    <div className="mt-6 grid max-w-4xl gap-6">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5">
        <h2 className="text-base font-semibold">Add a shift</h2>
        <div className="mt-5">
          <ShiftForm />
        </div>
      </section>

      {shifts.length === 0 ? (
        <p className="rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
          No shifts yet. Add one above, then you can assign it to employees.
        </p>
      ) : (
        shifts.map((shift) => (
          <section key={shift.id} className="rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold">{shift.name}</h2>
              <p className="text-sm text-muted-foreground">
                {shift.startTime} to {shift.endTime}
                {formatShiftLength(shift.startTime, shift.endTime)
                  ? `, ${formatShiftLength(shift.startTime, shift.endTime)}`
                  : ""}
                {" · "}
                {shift.employeeCount === 1 ? "1 employee" : `${shift.employeeCount} employees`}
              </p>
            </div>
            <div className="mt-5">
              <ShiftForm shift={shift} />
            </div>
          </section>
        ))
      )}
    </div>
  );
}
