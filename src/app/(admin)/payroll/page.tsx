import type { Metadata } from "next";

import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Payroll" };

export default function PayrollPage() {
  return (
    <>
      <PageHeader
        title="Payroll"
        description="Run the month's salaries from attendance and leave, then lock it."
      />
      <ComingSoon
        milestone="M5"
        points={[
          "Draft run with payable days and deductions per employee",
          "Bonuses and advances",
          "Finalize to lock the month",
          "Payslip PDFs and a salary sheet for bank or bKash",
        ]}
      />
    </>
  );
}
