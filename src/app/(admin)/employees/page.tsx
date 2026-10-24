import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
        "rounded-xl px-4 py-2 text-sm transition-colors",
        view === value ? "bg-card font-medium shadow-card" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label} ({count})
    </Link>
  );

  return (
    <div className="mt-6">
      <nav aria-label="Employee status" className="inline-flex gap-1 rounded-xl bg-secondary p-1">
        {tab("active", "Active", counts.active)}
        {tab("inactive", "Inactive", counts.inactive)}
      </nav>

      {rows.length === 0 ? (
        <Card className="mt-4 border-dashed text-sm text-muted-foreground shadow-none">
          {view === "active" ? (
            <>
              No employees yet. <Link href="/employees/new" className="font-medium text-primary underline underline-offset-4">Add the first one</Link>
              , after you have set up a shift.
            </>
          ) : (
            "Nobody is inactive. People you deactivate appear here with their history kept."
          )}
        </Card>
      ) : (
        <ul className="mt-4 grid gap-2.5 md:grid-cols-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/employees/${row.id}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 shadow-card transition-colors hover:border-primary/40"
              >
                <Avatar name={row.name} className="size-11" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{row.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    Code {row.empCode}
                    {row.designation ? `, ${row.designation}` : ""}
                    {row.department ? `, ${row.department}` : ""}
                  </p>
                  <Badge tone="off" className="mt-1.5">
                    {row.shiftName}
                  </Badge>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
