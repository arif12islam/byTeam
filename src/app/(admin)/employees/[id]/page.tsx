import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { BackLink } from "@/components/back-link";
import { DeleteForm } from "@/components/delete-form";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db";
import { listDepartments } from "@/lib/employees/departments";
import { getEmployee } from "@/lib/employees/employees";
import { requireRole } from "@/lib/session";
import { listShifts } from "@/lib/shifts/shifts";

import { deleteEmployeeAction, setActiveAction } from "../actions";
import { DeleteWithHistoryForm } from "./delete-with-history-form";
import { SalarySection } from "./salary-section";
import { EmployeeForm } from "../employee-form";

export const metadata: Metadata = { title: "Employee" };

export default function EmployeePage(props: PageProps<"/employees/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading employee</p>}>
      <EmployeeDetail params={props.params} />
    </Suspense>
  );
}

async function EmployeeDetail({ params }: { params: PageProps<"/employees/[id]">["params"] }) {
  const user = await requireRole("owner", "hr");

  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const db = getDb();
  const [employee, shifts, departments] = await Promise.all([getEmployee(db, id.data), listShifts(db), listDepartments(db)]);
  if (!employee) notFound();

  return (
    <>
      <BackLink href="/employees">Back to employees</BackLink>
      <PageHeader
        avatar={employee.name}
        title={employee.name}
        description={`Code ${employee.empCode}${employee.active ? "" : " · Inactive"}${employee.excludeFromInsights ? " · Left out of Insights" : ""}`}
      />

      <div className="mt-6 grid max-w-3xl gap-6">
        <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
          <h2 className="text-base font-semibold">Details</h2>
          <div className="mt-5">
            <EmployeeForm employee={employee} shifts={shifts} departments={departments.map((d) => d.name)} />
          </div>
        </section>

        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading salary</p>}>
          <SalarySection employeeId={employee.id} />
        </Suspense>

        <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
          <h2 className="text-base font-semibold">{employee.active ? "Deactivate" : "Reactivate"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {employee.active
              ? "Use this when someone leaves. Their punches, attendance and pay history are kept. Set the exit date above too."
              : "This person is inactive. Reactivate to include them in attendance again."}
          </p>
          <form action={setActiveAction} className="mt-4">
            <input type="hidden" name="id" value={employee.id} />
            <input type="hidden" name="active" value={employee.active ? "false" : "true"} />
            <Button type="submit" variant={employee.active ? "outline" : "default"}>
              {employee.active ? "Deactivate employee" : "Reactivate employee"}
            </Button>
          </form>
        </section>

        <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
          <h2 className="text-base font-semibold">Delete employee</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Only for someone added by mistake, with no punches, leave, payroll or corrections on record. Anyone with history cannot be deleted. Deactivate them instead.
          </p>
          <div className="mt-4">
            <DeleteForm
              action={deleteEmployeeAction}
              id={employee.id}
              label="Delete employee"
              confirmText={`Delete ${employee.name} (code ${employee.empCode})? This cannot be undone.`}
            />
          </div>
        </section>

        {user.role === "owner" ? (
          <section className="rounded-xl border border-destructive/40 bg-card p-4 shadow-card sm:p-5">
            <h2 className="text-base font-semibold">Delete with history</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Owner only, and it cannot be undone. This removes {employee.name} and their attendance, corrections, leave, salary, payroll lines and
              bonuses and advances. Their fingerprint punches are kept, as an unlinked code. It is refused while they are in a finalized payroll
              month. To keep the history, deactivate them instead.
            </p>
            <div className="mt-4">
              <DeleteWithHistoryForm id={employee.id} name={employee.name} />
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
