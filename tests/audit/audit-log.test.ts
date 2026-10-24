import { describe, expect, it } from "vitest";

import { changedFields, describeAuditAction } from "@/lib/audit-log";

describe("describeAuditAction", () => {
  it("uses plain words for the actions the app writes", () => {
    expect(describeAuditAction("payroll_run.finalize")).toBe("Finalized payroll");
    expect(describeAuditAction("payroll_run.unlock")).toBe("Unlocked payroll");
    expect(describeAuditAction("attendance.adjust")).toBe("Corrected attendance");
    expect(describeAuditAction("leave.approve")).toBe("Approved leave");
    expect(describeAuditAction("outage.create")).toBe("Recorded an office outage");
  });

  it("makes an unknown code readable", () => {
    expect(describeAuditAction("employee.deactivate")).toBe("Employee deactivate");
    expect(describeAuditAction("payroll_run.archive_old")).toBe("Payroll run archive old");
    expect(describeAuditAction("x")).toBe("X");
  });
});

describe("changedFields", () => {
  it("lists only the fields that differ for an update", () => {
    expect(changedFields({ name: "Rahim", gross: "30000.00", active: true }, { name: "Rahim", gross: "32000.00", active: true })).toEqual([
      { field: "gross", before: "30000.00", after: "32000.00" },
    ]);
  });

  it("lists every field of a new record with nothing before it", () => {
    expect(changedFields(null, { name: "Rahim", age: 30, active: true })).toEqual([
      { field: "name", before: null, after: "Rahim" },
      { field: "age", before: null, after: "30" },
      { field: "active", before: null, after: "true" },
    ]);
  });

  it("lists every field of a removed record with nothing after it", () => {
    expect(changedFields({ date: "2026-10-12", name: "Eid" }, null)).toEqual([
      { field: "date", before: "2026-10-12", after: null },
      { field: "name", before: "Eid", after: null },
    ]);
  });

  it("shows a field that was added or dropped, and nested values as JSON", () => {
    expect(changedFields({ a: 1 }, { a: 1, b: { x: [1, 2] } })).toEqual([{ field: "b", before: null, after: '{"x":[1,2]}' }]);
    expect(changedFields({ a: 1, c: "gone" }, { a: 1 })).toEqual([{ field: "c", before: "gone", after: null }]);
  });

  it("treats a missing value and null as the same, and a number and its text as different", () => {
    expect(changedFields({ note: null }, {})).toEqual([]);
    expect(changedFields({ n: 1 }, { n: "1" })).toEqual([]); // both read as the text 1
    expect(changedFields({ n: 1 }, { n: 2 })).toEqual([{ field: "n", before: "1", after: "2" }]);
  });

  it("has nothing to show when there are no values or they are not records", () => {
    expect(changedFields(null, null)).toEqual([]);
    expect(changedFields("text", [1, 2])).toEqual([]);
    expect(changedFields({ a: 1 }, { a: 1 })).toEqual([]);
  });
});
