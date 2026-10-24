import { describe, expect, it } from "vitest";

import type { RunSummary } from "@/lib/payroll/runs";
import { formatCompact, formatTaka, payrollByDepartment, payrollTrend } from "@/lib/reports/payroll-report";

const run = (month: string, net: string, status: RunSummary["status"] = "finalized"): RunSummary => ({
  id: month,
  month,
  status,
  version: 1,
  employees: 3,
  net,
  updatedAt: new Date("2031-01-01T00:00:00Z"),
});

describe("payrollTrend", () => {
  it("returns the six months up to the chosen one, oldest first, with gaps as null", () => {
    const points = payrollTrend([run("2031-03", "100000.00"), run("2031-01", "90000.00", "draft")], "2031-03");
    expect(points.map((p) => p.month)).toEqual(["2030-10", "2030-11", "2030-12", "2031-01", "2031-02", "2031-03"]);
    expect(points.map((p) => p.net)).toEqual([null, null, null, 90000, null, 100000]);
    expect(points[3].status).toBe("draft");
    expect(points[0].status).toBeNull();
  });

  it("ignores runs after the chosen month", () => {
    const points = payrollTrend([run("2031-04", "1.00")], "2031-03", 2);
    expect(points.map((p) => p.net)).toEqual([null, null]);
  });
});

describe("payrollByDepartment", () => {
  it("adds gross and net per department and sorts by net", () => {
    const result = payrollByDepartment([
      { department: "Sales", gross: "30000.10", net: "29000" },
      { department: "Sales", gross: "20000.20", net: "19000" },
      { department: "Accounts", gross: "60000.00", net: "55000" },
      { department: null, gross: "10000.00", net: "9000" },
    ]);
    expect(result).toEqual([
      { department: "Accounts", people: 1, gross: 60000, net: 55000 },
      { department: "Sales", people: 2, gross: 50000.3, net: 48000 },
      { department: "No department", people: 1, gross: 10000, net: 9000 },
    ]);
  });

  it("does not drift when adding many cents", () => {
    const rows = Array.from({ length: 10 }, () => ({ department: "A", gross: "0.10", net: "0.10" }));
    expect(payrollByDepartment(rows)[0]).toMatchObject({ gross: 1, net: 1 });
  });
});

describe("formatTaka", () => {
  it("groups thousands and drops decimals for whole amounts", () => {
    expect(formatTaka(123456)).toBe("123,456");
    expect(formatTaka(123456.5)).toBe("123,456.50");
    expect(formatTaka(0)).toBe("0");
  });
});

describe("formatCompact", () => {
  it("shortens thousands and millions", () => {
    expect(formatCompact(245000)).toBe("245k");
    expect(formatCompact(1250000)).toBe("1.3M");
    expect(formatCompact(2000000)).toBe("2M");
    expect(formatCompact(950)).toBe("950");
    expect(formatCompact(0)).toBe("0");
  });
});
