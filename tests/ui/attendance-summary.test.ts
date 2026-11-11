import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AttendanceLegend } from "@/app/(admin)/attendance/attendance-cards";
import { AttendanceSummary } from "@/app/(admin)/attendance/attendance-summary";
import type { AttendanceReport } from "@/lib/reports/attendance-report";

const report = {
  totals: { present: 40, late: 3, absent: 10, leavePaid: 2, leaveUnpaid: 1, lateMinutes: 75 },
  attendanceRate: 0.8,
} as AttendanceReport;

describe("AttendanceSummary", () => {
  it("shows the rate and the four counts", () => {
    const html = renderToStaticMarkup(createElement(AttendanceSummary, { report }));
    expect(html).toContain("80%");
    expect(html).toContain("Attendance rate");
    expect(html).toContain("Present days");
    expect(html).toContain(">40<");
    expect(html).toContain(">3<");
    expect(html).toContain(">10<");
    // Paid and unpaid leave together.
    expect(html).toContain(">3<");
    expect(html).toContain("<svg");
  });

  it("leaves out the ring when compact", () => {
    const html = renderToStaticMarkup(createElement(AttendanceSummary, { report, compact: true }));
    expect(html).not.toContain("<svg");
    expect(html).toContain("On leave");
  });

  it("shows a dash for the rate when nobody was due in", () => {
    const html = renderToStaticMarkup(createElement(AttendanceSummary, { report: { ...report, attendanceRate: null } }));
    expect(html).toContain(">-<");
  });
});

describe("AttendanceLegend", () => {
  it("names every status next to its color", () => {
    const html = renderToStaticMarkup(createElement(AttendanceLegend));
    for (const word of ["Present", "Late", "Absent", "Leave", "Day off"]) expect(html).toContain(word);
  });
});
