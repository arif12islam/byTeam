import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db";
import { getEmployee } from "@/lib/employees/employees";
import { requireRole } from "@/lib/session";
import { listShifts } from "@/lib/shifts/shifts";

import { setActiveAction } from "../actions";
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
  await requireRole("owner", "hr");

  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const db = getDb();
  const [employee, shifts] = await Promise.all([getEmployee(db, id.data), listShifts(db)]);
  if (!employee) notFound();

  return (
    <>
      <PageHeader
        title={employee.name}
        description={`Code ${employee.empCode}${employee.active ? "" : " · Inactive"}`}
        actions={
          <Link href="/employees" className="text-sm text-muted-foreground hover:text-foreground">
            Back to employees
          </Link>
        }
      />

      <div className="mt-6 grid max-w-3xl gap-6">
        <section className="rounded-lg border border-border bg-card p-5 md:p-6">
          <h2 className="text-base font-semibold">Details</h2>
          <div className="mt-5">
            <EmployeeForm employee={employee} shifts={shifts} />
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-5 md:p-6">
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
      </div>
    </>
  );
}
