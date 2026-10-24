import { describe, expect, it } from "vitest";

import { computePayroll, type PayrollInput } from "@/lib/payroll/compute";
import { buildPayslip } from "@/lib/payroll/payslip";
import { renderPayslips } from "@/lib/payroll/payslip-pdf";

const input: PayrollInput = {
  month: "2026-11",
  employee: { joinDate: "2025-01-01", exitDate: null },
  salary: { gross: "30000.00", basicPct: "50.00" },
  rules: { lateMode: "days_per_lates", lateEveryN: 3, lateAmount: null, deductionBase: "gross", divisor: "working_days", unpaidLeaveAsAbsent: true },
  workingDays: 22,
  days: [
    { date: "2026-11-01", status: "absent" },
    { date: "2026-11-02", status: "late" },
    { date: "2026-11-03", status: "late" },
    { date: "2026-11-04", status: "late" },
  ],
  adjustments: [{ type: "bonus", amount: "500" }],
};

function slipFor(name: string, empCode: string, over: Partial<PayrollInput> = {}) {
  const item = computePayroll({ ...input, ...over });
  return buildPayslip({
    company: "Sand'Sun Holidays",
    month: "2026-11",
    version: 2,
    finalizedOn: "2026-12-02",
    employee: { name, empCode, department: "Sales", designation: null },
    item: { ...item, breakdown: item.breakdown },
  });
}

describe("buildPayslip", () => {
  it("copies what the finalized item says, without working anything out again", () => {
    const item = computePayroll(input);
    const slip = slipFor("Rahim Uddin", "1001");
    expect(slip.net).toBe(item.net);
    expect(slip.lines).toEqual(item.breakdown.lines);
    expect(slip.days).toEqual({ inMonth: 30, paid: 30, absent: 1, late: 3, unpaidLeave: 0 });
    expect(slip).toMatchObject({ company: "Sand'Sun Holidays", month: "2026-11", version: 2, finalizedOn: "2026-12-02" });
    expect(slip.employee).toEqual({ name: "Rahim Uddin", empCode: "1001", department: "Sales", designation: null });
    // 30000 - 1363.64 (absent) - 1363.64 (3 lates = 1 day) + 500 = 27772.72, so 27773.
    expect(slip.net).toBe("27773.00");
  });
});

describe("renderPayslips", () => {
  it("makes a PDF with one page per payslip", async () => {
    const one = await renderPayslips([slipFor("Rahim Uddin", "1001")]);
    expect(one.subarray(0, 5).toString()).toBe("%PDF-");
    expect(one.length).toBeGreaterThan(1000);

    const three = await renderPayslips([slipFor("A", "1"), slipFor("B", "2"), slipFor("C", "3")]);
    const pages = (buffer: Buffer) => (buffer.toString("latin1").match(/\/Type \/Page\b(?!s)/g) ?? []).length;
    expect(pages(one)).toBe(1);
    expect(pages(three)).toBe(3);
  }, 30_000);

  it("copes with a missing company name, long names and a negative net", async () => {
    const slip = {
      ...slipFor("A very long employee name that goes on and on and on and on and on", "9999", { adjustments: [{ type: "advance", amount: "90000" }] }),
      company: "",
    };
    expect(slip.net.startsWith("-")).toBe(true);
    const file = await renderPayslips([slip]);
    expect(file.subarray(0, 5).toString()).toBe("%PDF-");
  }, 30_000);
});
