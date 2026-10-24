import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/db";
import { suggestedCode } from "@/lib/punches/unmatched";
import { requireRole } from "@/lib/session";
import { listShifts } from "@/lib/shifts/shifts";

import { EmployeeForm } from "../employee-form";

export const metadata: Metadata = { title: "Add employee" };

export default function NewEmployeePage(props: PageProps<"/employees/new">) {
  return (
    <>
      <BackLink href="/employees">Back to employees</BackLink>
      <PageHeader title="Add employee" description="Create the record, then set their salary." />
      <Suspense fallback={<p className="mt-6 text-sm text-muted-foreground">Loading</p>}>
        <NewEmployee searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function NewEmployee({ searchParams }: { searchParams: PageProps<"/employees/new">["searchParams"] }) {
  await requireRole("owner", "hr");
  const code = suggestedCode((await searchParams).code);
  const shifts = await listShifts(getDb());

  if (shifts.length === 0) {
    return (
      <p className="mt-6 max-w-xl rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
        Every employee needs a shift.{" "}
        <Link href="/shifts" className="text-primary underline underline-offset-4">
          Add a shift first
        </Link>
        , then come back.
      </p>
    );
  }

  return (
    <section className="mt-6 max-w-3xl rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
      <EmployeeForm shifts={shifts} initialCode={code} />
    </section>
  );
}
