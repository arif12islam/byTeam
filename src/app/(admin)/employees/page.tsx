import type { Metadata } from "next";

import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Employees" };

export default function EmployeesPage() {
  return (
    <>
      <PageHeader
        title="Employees"
        description="Staff records, shifts and salaries."
      />
      <ComingSoon
        milestone="M1"
        points={[
          "Add, edit and deactivate employees",
          "Employee code that matches the device",
          "Shift and salary structure for each person",
        ]}
      />
    </>
  );
}
