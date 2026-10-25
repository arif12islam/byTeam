import { describe, expect, it } from "vitest";

import {
  describeAuditRecord,
  entityLabel,
  formatAuditValue,
  NO_REFS,
  readableChanges,
  referencedIds,
  type AuditRefs,
} from "@/lib/audit-format";

const EMP = "37631529-70a3-4ca5-9cc8-169c5518dd8f";
const USER = "f30cd348-4805-48fd-abe6-8b02ad039148";
const SHIFT = "1a2b3c4d-0000-4000-8000-000000000001";
const LEAVE = "1a2b3c4d-0000-4000-8000-000000000002";
const RUN = "1a2b3c4d-0000-4000-8000-000000000003";

const refs: AuditRefs = {
  employees: new Map([[EMP, { name: "Anwar Hossain", empCode: "9001" }]]),
  users: new Map([[USER, "Arif"]]),
  shifts: new Map([[SHIFT, "Day shift"]]),
  leaveTypes: new Map([[LEAVE, "Casual leave"]]),
  payrollRuns: new Map([[RUN, "2026-10-01"]]),
};

// The entry from the screenshot that started this: an advance, as it was stored.
const advance = {
  id: "9bc5346d-4023-4869-896a-8ca1bd9d6f3b",
  type: "advance",
  month: "2026-10-01",
  amount: "15000.00",
  note: null,
  createdAt: "2026-10-25T09:16:00.403Z",
  createdBy: USER,
  employeeId: EMP,
};

describe("readableChanges", () => {
  it("shows a new advance with names and formatted values, and no ids or timestamps", () => {
    expect(readableChanges(null, advance, refs)).toEqual([
      { field: "employeeId", label: "Employee", before: null, after: "Anwar Hossain (9001)" },
      { field: "month", label: "Month", before: null, after: "Oct 2026" },
      { field: "type", label: "Kind", before: null, after: "Advance" },
      { field: "amount", label: "Amount", before: null, after: "৳15,000.00" },
    ]);
  });

  it("lists only the fields that changed in an update, before and after", () => {
    const before = { id: SHIFT, name: "Day shift", startTime: "09:00:00", endTime: "18:00:00", graceMinutes: 10, updatedAt: "2026-10-01T00:00:00Z" };
    const after = { ...before, graceMinutes: 15, updatedAt: "2026-10-25T00:00:00Z" };
    expect(readableChanges(before, after, refs)).toEqual([{ field: "graceMinutes", label: "Grace", before: "10 min", after: "15 min" }]);
  });

  it("shows a removed record's fields as before only", () => {
    const changes = readableChanges({ id: "x", date: "2026-12-16", name: "Victory Day", createdAt: "2026-10-01T00:00:00Z" }, null, refs);
    expect(changes).toEqual([
      { field: "name", label: "Name", before: "Victory Day", after: null },
      { field: "date", label: "Date", before: "Wed 16 Dec 2026", after: null },
    ]);
  });

  it("still shows a field it does not know, with a label made from its name", () => {
    expect(readableChanges(null, { someNewThing: "yes" }, refs)).toEqual([
      { field: "someNewThing", label: "Some new thing", before: null, after: "yes" },
    ]);
  });
});

describe("formatAuditValue", () => {
  it("shows instants in office time, not UTC", () => {
    expect(formatAuditValue("decidedAt", "2026-10-25T09:16:00.403Z", refs)).toBe("25 Oct 2026, 15:16");
  });

  it("formats each kind of value", () => {
    expect(formatAuditValue("gross", "30000.00", refs)).toBe("৳30,000.00");
    expect(formatAuditValue("lateAmount", "150000.5", refs)).toBe("৳1,50,000.50");
    expect(formatAuditValue("basicPct", "60.00", refs)).toBe("60%");
    expect(formatAuditValue("joinDate", "2026-01-04", refs)).toBe("Sun 4 Jan 2026");
    expect(formatAuditValue("effectiveFromMonth", "2026-10-01", refs)).toBe("Oct 2026");
    expect(formatAuditValue("startTime", "09:00:00", refs)).toBe("09:00");
    expect(formatAuditValue("active", false, refs)).toBe("No");
    expect(formatAuditValue("isPaid", true, refs)).toBe("Yes");
    expect(formatAuditValue("days", 1, refs)).toBe("1 day");
    expect(formatAuditValue("yearlyQuota", 15, refs)).toBe("15 days");
    expect(formatAuditValue("weeklyOffDays", [5, 6], refs)).toBe("Friday, Saturday");
    expect(formatAuditValue("weeklyOffDays", [], refs)).toBe("None");
  });

  it("uses the words of the screens for codes", () => {
    expect(formatAuditValue("status", "pending", refs)).toBe("Waiting for a decision");
    expect(formatAuditValue("status", "leave_unpaid", refs)).toBe("Unpaid leave");
    expect(formatAuditValue("lateMode", "days_per_lates", refs)).toBe("Several lates cost one day");
    expect(formatAuditValue("divisor", "working_days", refs)).toBe("Working days in the month");
    expect(formatAuditValue("leaveYearBasis", "anniversary", refs)).toBe("Each person's joining date");
    expect(formatAuditValue("role", "hr", refs)).toBe("HR");
  });

  it("puts names in place of ids, and says when the record is gone", () => {
    expect(formatAuditValue("employeeId", EMP, refs)).toBe("Anwar Hossain (9001)");
    expect(formatAuditValue("decidedBy", USER, refs)).toBe("Arif");
    expect(formatAuditValue("shiftId", SHIFT, refs)).toBe("Day shift");
    expect(formatAuditValue("leaveTypeId", LEAVE, refs)).toBe("Casual leave");
    expect(formatAuditValue("runId", RUN, refs)).toBe("Payroll for Oct 2026");
    expect(formatAuditValue("employeeId", "00000000-0000-4000-8000-000000000000", refs)).toBe("an employee no longer on record");
    expect(formatAuditValue("decidedBy", "gone", NO_REFS)).toBe("a removed user");
  });

  it("reads an attendance correction's new value by the field corrected", () => {
    expect(formatAuditValue("newValue", "absent", refs, { field: "status" })).toBe("Absent");
    expect(formatAuditValue("newValue", "2026-10-25T03:05:00.000Z", refs, { field: "first_in" })).toBe("25 Oct 2026, 09:05");
    expect(formatAuditValue("field", "last_out", refs)).toBe("Leaving time");
  });

  it("shows nothing for empty values", () => {
    expect(formatAuditValue("note", null, refs)).toBeNull();
    expect(formatAuditValue("note", "", refs)).toBeNull();
    expect(formatAuditValue("exitDate", undefined, refs)).toBeNull();
  });
});

describe("describeAuditRecord", () => {
  const entry = (entity: string, entityId: string, after: unknown, before: unknown = null) => ({ entity, entityId, before, after });

  it("names each kind of record", () => {
    expect(describeAuditRecord(entry("payroll_adjustment", advance.id, advance), refs)).toBe(
      "Advance of ৳15,000.00 for Anwar Hossain (9001), Oct 2026",
    );
    expect(describeAuditRecord(entry("employee", EMP, { name: "Anwar Hossain", empCode: "9001" }), refs)).toBe("Anwar Hossain (9001)");
    expect(describeAuditRecord(entry("payroll_run", RUN, { month: "2026-10-01", employees: 16 }), refs)).toBe("Payroll for Oct 2026");
    expect(describeAuditRecord(entry("salary_structure", "s", { employeeId: EMP, effectiveFrom: "2026-10-01" }), refs)).toBe(
      "Salary of Anwar Hossain (9001) from Thu 1 Oct 2026",
    );
    expect(
      describeAuditRecord(entry("leave_request", "l", { employeeId: EMP, leaveTypeId: LEAVE, fromDate: "2026-10-18", toDate: "2026-10-19" }), refs),
    ).toBe("Casual leave for Anwar Hossain (9001), Sun 18 Oct 2026 to Mon 19 Oct 2026");
    expect(describeAuditRecord(entry("shift", SHIFT, { name: "Day shift" }), refs)).toBe("Day shift");
    expect(describeAuditRecord(entry("device", "d", { name: "Front door", serialNo: "DEV0000001" }), refs)).toBe("Front door (DEV0000001)");
    expect(describeAuditRecord(entry("holiday", "h", null, { name: "Victory Day", date: "2026-12-16" }), refs)).toBe("Victory Day, Wed 16 Dec 2026");
    expect(describeAuditRecord(entry("office_outage", "o", { date: "2026-10-20", startTime: "10:00:00", endTime: "12:30:00" }), refs)).toBe(
      "Office outage, Tue 20 Oct 2026, 10:00 to 12:30",
    );
    expect(describeAuditRecord(entry("rule_set", "r", { effectiveFromMonth: "2026-01-01" }), refs)).toBe("Pay rules from Jan 2026");
    expect(describeAuditRecord(entry("company_settings", "1", { name: "Sand'Sun" }), refs)).toBe("Company settings");
    expect(describeAuditRecord(entry("user", USER, { name: "Arif", email: "arif@example.com" }), refs)).toBe("Arif (arif@example.com)");
  });

  it("reads an attendance day from its id, which is the employee and the date", () => {
    expect(describeAuditRecord(entry("attendance_day", `${EMP}:2026-10-12`, { field: "status" }), refs)).toBe(
      "Anwar Hossain (9001), Mon 12 Oct 2026",
    );
  });

  it("uses the payroll month from the run when the entry does not carry it", () => {
    expect(describeAuditRecord(entry("payroll_run", RUN, { status: "finalized" }), refs)).toBe("Payroll for Oct 2026");
  });
});

describe("entityLabel", () => {
  it("names the kinds of record in plain words", () => {
    expect(entityLabel("payroll_adjustment")).toBe("Bonus or advance");
    expect(entityLabel("salary_structure")).toBe("Salary");
    expect(entityLabel("something_new")).toBe("Something new");
  });
});

describe("referencedIds", () => {
  it("collects every id a page of entries points at", () => {
    const ids = referencedIds([
      { entity: "payroll_adjustment", entityId: advance.id, before: null, after: advance },
      { entity: "attendance_day", entityId: `${EMP}:2026-10-12`, before: null, after: { field: "status" } },
      { entity: "leave_request", entityId: "l", before: { decidedBy: null }, after: { leaveTypeId: LEAVE, decidedBy: USER } },
      { entity: "employee", entityId: EMP, before: null, after: { shiftId: SHIFT } },
      { entity: "payroll_run", entityId: RUN, before: null, after: {} },
    ]);
    expect(ids.employees).toEqual([EMP]);
    // createdBy is hidden, so it is not looked up; decidedBy is shown.
    expect(ids.users).toEqual([USER]);
    expect(ids.shifts).toEqual([SHIFT]);
    expect(ids.leaveTypes).toEqual([LEAVE]);
    expect(ids.payrollRuns).toEqual([RUN]);
  });
});
