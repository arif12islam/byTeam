import { describe, expect, it } from "vitest";

import type { DayResult } from "@/lib/attendance/compute-day";
import { renderAttendancePdf, pdfText } from "@/lib/attendance/export-pdf";
import { buildMonthGrid, buildPeriodGrid } from "@/lib/attendance/month";

const day = (over: Partial<DayResult> = {}): DayResult => ({
  status: "present",
  firstIn: null,
  lastOut: null,
  lateMinutes: 0,
  earlyMinutes: 0,
  missingOut: false,
  workedOnOffDay: false,
  punchCount: 0,
  isManual: false,
  ...over,
});

const options = { company: "Sand'Sun Holidays", trackLeavingPunch: true, filterNote: "Filtered: department Sales.", madeOn: "2026-11-02" };

function pages(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;
}

describe("renderAttendancePdf", () => {
  const rows = Array.from({ length: 60 }, (_, i) => ({
    employee: { id: `id-${i}`, empCode: String(100 + i), name: `Person ${i}`, department: i % 2 ? "Sales" : null },
    days: [{ date: "2026-10-01", result: day({ status: i % 3 ? "present" : "late", lateMinutes: i % 3 ? 0 : 75 }) }],
  }));

  it("makes a PDF with the totals and the day grid for a month", async () => {
    const pdf = await renderAttendancePdf(buildMonthGrid("2026-10", rows.slice(0, 3)), options);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pages(pdf)).toBe(2);
  });

  it("runs onto more pages for many people", async () => {
    const pdf = await renderAttendancePdf(buildMonthGrid("2026-10", rows), options);
    expect(pages(pdf)).toBeGreaterThan(2);
  });

  it("shows only the totals for a period longer than a month", async () => {
    const pdf = await renderAttendancePdf(buildPeriodGrid({ from: "2026-09-01", to: "2026-10-31" }, rows.slice(0, 3)), options);
    expect(pages(pdf)).toBe(1);
  });

  it("still makes a file when nobody matches, and with a name in Bangla", async () => {
    expect((await renderAttendancePdf(buildMonthGrid("2026-10", []), options)).subarray(0, 5).toString()).toBe("%PDF-");
    const bangla = buildMonthGrid("2026-10", [{ employee: { id: "x", empCode: "1", name: "আনোয়ার", department: null }, days: [] }]);
    expect((await renderAttendancePdf(bangla, { ...options, trackLeavingPunch: false })).subarray(0, 5).toString()).toBe("%PDF-");
  });
});

describe("pdfText", () => {
  it("keeps Latin letters and punctuation, and replaces other scripts", () => {
    expect(pdfText("Rahim’s Café, Md.")).toBe("Rahim’s Café, Md.");
    expect(pdfText("আনোয়ার Hossain")).toBe("??????? Hossain");
    expect(pdfText(null)).toBe("");
  });
});
