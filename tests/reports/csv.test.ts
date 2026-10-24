import { describe, expect, it } from "vitest";

import type { DayResult } from "@/lib/attendance/compute-day";
import { buildMonthGrid } from "@/lib/attendance/month";
import { buildReportCsv, csvField } from "@/lib/reports/csv";

describe("csvField", () => {
  it("leaves plain text and numbers alone and writes null as empty", () => {
    expect(csvField("Ana")).toBe("Ana");
    expect(csvField(12)).toBe("12");
    expect(csvField(null)).toBe("");
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(csvField("Rahim, Md")).toBe('"Rahim, Md"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("a\nb")).toBe('"a\nb"');
  });

  it("defuses text that a spreadsheet would run as a formula", () => {
    expect(csvField("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvField("+88017")).toBe("'+88017");
    expect(csvField("-1")).toBe("'-1");
    expect(csvField("@cmd")).toBe("'@cmd");
  });

  it("does not touch real negative numbers", () => {
    expect(csvField(-5)).toBe("-5");
  });
});

describe("buildReportCsv", () => {
  const result = (status: DayResult["status"], extra: Partial<DayResult> = {}): DayResult => ({
    status,
    firstIn: null,
    lastOut: null,
    lateMinutes: 0,
    earlyMinutes: 0,
    missingOut: false,
    workedOnOffDay: false,
    punchCount: 0,
    isManual: false,
    ...extra,
  });

  it("writes a header and a line per employee with the net pay when known", () => {
    const grid = buildMonthGrid("2031-03", [
      {
        employee: { id: "e1", empCode: "1001", name: "Rahim, Md", department: "Sales" },
        days: [
          { date: "2031-03-02", result: result("present") },
          { date: "2031-03-03", result: result("late", { lateMinutes: 12 }) },
          { date: "2031-03-04", result: result("absent") },
        ],
      },
      { employee: { id: "e2", empCode: "1002", name: "Sima", department: null }, days: [] },
    ]);
    const csv = buildReportCsv(grid, new Map([["e1", "24500.00"]]));
    expect(csv).toBe(
      [
        "Code,Name,Department,Days present,Days late,Days absent,Days on leave,Minutes late,Missing leaving punch,Net pay",
        '1001,"Rahim, Md",Sales,2,1,1,0,12,0,24500.00',
        "1002,Sima,,0,0,0,0,0,0,",
        "",
      ].join("\n"),
    );
  });
});
