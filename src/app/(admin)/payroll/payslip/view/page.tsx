import { ArrowLeft, Download, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";

import { PageHeader } from "@/components/page-header";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/db";
import { loadPayslips } from "@/lib/payroll/payslip";
import { requireRole } from "@/lib/session";
import { formatMonth, isValidMonth } from "@/lib/time";

import { PayslipCard } from "./payslip-card";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Payslip" };

export default function PayslipPage(props: PageProps<"/payroll/payslip/view">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading payslip</p>}>
      <PayslipContent searchParams={props.searchParams} />
    </Suspense>
  );
}

async function PayslipContent({ searchParams }: { searchParams: PageProps<"/payroll/payslip/view">["searchParams"] }) {
  await requireRole("owner", "hr");
  const { month, employee } = await searchParams;
  const employeeId = typeof employee === "string" && z.uuid().safeParse(employee).success ? employee : undefined;
  if (typeof month !== "string" || !isValidMonth(month) || !employeeId) {
    return (
      <>
        <PageHeader title="Payslip" description="Open a payslip from the salary sheet of a finalized month." />
        <Link href="/payroll" className={`${buttonVariants({ variant: "outline" })} mt-6`}>
          <ArrowLeft aria-hidden />
          Back to payroll
        </Link>
      </>
    );
  }

  const result = await loadPayslips(getDb(), month, employeeId);
  const back = (
    <Link href={`/payroll?month=${month}`} className={buttonVariants({ variant: "ghost", size: "sm" }) + " print:hidden"}>
      <ArrowLeft aria-hidden />
      Back to {formatMonth(month)}
    </Link>
  );
  if (!result.ok) {
    return (
      <div className="grid gap-4">
        <div>{back}</div>
        <Alert tone="warning" icon={TriangleAlert}>{result.error}</Alert>
      </div>
    );
  }
  const slip = result.slips[0];
  return (
    <div className="mx-auto grid max-w-2xl gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        {back}
        <div className="flex flex-wrap items-center gap-2">
          <PrintButton />
          <a href={`/payroll/payslip?month=${month}&employee=${employeeId}`} className={buttonVariants({ variant: "outline" })}>
            <Download aria-hidden />
            Download PDF
          </a>
        </div>
      </div>
      <PayslipCard slip={slip} />
    </div>
  );
}
