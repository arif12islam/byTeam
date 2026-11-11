import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PayslipCard } from "@/app/(admin)/payroll/payslip/view/payslip-card";
import { payslipHref, SalarySheet } from "@/app/(admin)/payroll/salary-sheet";
import type { SheetRow } from "@/lib/payroll/runs";
import type { Payslip } from "@/lib/payroll/payslip";

const row = (n: number): SheetRow => ({
  employeeId: `id-${n}`,
  empCode: `00${n}`,
  name: `Person ${n}`,
  department: null,
  payableDays: 29,
  absentDays: n,
  lateCount: 0,
  unpaidLeaveDays: 0,
  gross: "30000.00",
  deductions: "1000.00",
  additions: "500.00",
  net: "29500.00",
  warnings: [],
  lines: [],
});
const totals = { gross: "60000.00", deductions: "2000.00", additions: "1000.00", net: "59000.00" };

describe("SalarySheet", () => {
  it("shows a row and a card per person and a totals row", () => {
    const html = renderToStaticMarkup(createElement(SalarySheet, { rows: [row(1), row(2)], totals, month: "2026-10", locked: false }));
    expect(html).toContain("Person 1");
    expect(html).toContain("Person 2");
    expect(html).toContain("Total");
    expect(html).toContain("59,000");
    expect(html).toContain('scope="col"');
  });

  it("links to payslips only when the month is finalized", () => {
    const draft = renderToStaticMarkup(createElement(SalarySheet, { rows: [row(1)], totals, month: "2026-10", locked: false }));
    expect(draft).not.toContain("/payroll/payslip/view");
    const locked = renderToStaticMarkup(createElement(SalarySheet, { rows: [row(1)], totals, month: "2026-10", locked: true }));
    expect(locked).toContain(payslipHref("2026-10", "id-1").replace("&", "&amp;"));
    expect(payslipHref("2026-10", "id-1")).toBe("/payroll/payslip/view?month=2026-10&employee=id-1");
  });
});

describe("PayslipCard", () => {
  const slip: Payslip = {
    company: "Sand'Sun Holidays",
    month: "2026-10",
    version: 1,
    finalizedOn: "2026-11-02",
    employee: { name: "Nadia Rahman", empCode: "007", department: "Sales", designation: null },
    days: { inMonth: 31, paid: 30, absent: 1, late: 2, unpaidLeave: 0 },
    lines: [
      { code: "salary", label: "Salary for 30 of 31 days", amount: "29000.00", sign: "+" },
      { code: "late", label: "Late deduction", amount: "500.00", sign: "-" },
    ],
    net: "28500.00",
  };

  it("shows the person, each line and the net pay", () => {
    const html = renderToStaticMarkup(createElement(PayslipCard, { slip }));
    expect(html).toContain("Nadia Rahman");
    expect(html).toContain("Sand&#x27;Sun Holidays");
    expect(html).toContain("Salary for 30 of 31 days");
    expect(html).toContain("-500.00");
    expect(html).toContain("Net pay");
    expect(html).toContain("Sales");
    expect(html).not.toContain("Designation");
  });
});
