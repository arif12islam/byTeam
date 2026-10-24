import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/db";
import { countByStatus, listEmployees } from "@/lib/employees/employees";
import { requireRole } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Employees" };

export default function EmployeesPage(props: PageProps<"/employees">) {
  return (
    <>
      <PageHeader
        title="Employees"
        description="Staff records, shifts and salaries."
        actions={
          <Link href="/employees/new" className={buttonVariants()}>
            Add employee
          </Link>
        }
      />
      <Suspense fallback={<p className="mt-6 text-sm text-muted-foreground">Loading employees</p>}>
        <EmployeeList searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function EmployeeList({ searchParams }: { searchParams: PageProps<"/employees">["searchParams"] }) {
  await requireRole("owner", "hr");

  const { show } = await searchParams;
  const view = show === "inactive" ? "inactive" : "active";

  const db = getDb();
  const [rows, counts] = await Promise.all([listEmployees(db, view), countByStatus(db)]);

  const tab = (value: "active" | "inactive", label: string, count: number) => (
    <Link
      href={value === "active" ? "/employees" : "/employees?show=inactive"}
      aria-current={view === value ? "page" : undefined}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm",
        view === value ? "bg-accent font-medium text-accent-foreground" : "text-foreground/80 hover:bg-secondary",
      )}
    >
      {label} ({count})
    </Link>
  );

  return (
    <div className="mt-6">
      <nav aria-label="Employee status" className="flex gap-1">
        {tab("active", "Active", counts.active)}
        {tab("inactive", "Inactive", counts.inactive)}
      </nav>

      {rows.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
          {view === "active" ? (
            <>
              No employees yet. <Link href="/employees/new" className="text-primary underline underline-offset-4">Add the first one</Link>
              , after you have set up a shift.
            </>
          ) : (
            "Nobody is inactive. People you deactivate appear here with their history kept."
          )}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-lg border border-border bg-card">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/employees/${row.id}`}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-3 hover:bg-secondary/60"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Code {row.empCode}
                    {row.designation ? ` · ${row.designation}` : ""}
                    {row.department ? ` · ${row.department}` : ""}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">{row.shiftName}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
