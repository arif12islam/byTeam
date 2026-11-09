import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { employees, shifts } from "@/db/schema";
import { loadPeriodGrid } from "@/lib/attendance/month";
import { monthPeriod } from "@/lib/period";

import { connect, testDatabaseUrl, uniqueCode, type TestDb } from "./helpers";

vi.mock("server-only", () => ({}));

// May 2046 is used by no other test. The grid for one person is what the person's attendance page shows.
describe.skipIf(!testDatabaseUrl)("the grid for chosen people", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let a: string;
  let b: string;

  beforeAll(async () => {
    ({ db, close } = connect());
    const [shift] = await db.insert(shifts).values({ name: `Person grid shift ${uniqueCode()}`, startTime: "09:00", endTime: "18:00", graceMinutes: 10 }).returning();
    const [first] = await db.insert(employees).values({ empCode: uniqueCode(), name: "Grid Person A", joinDate: "2046-01-01", shiftId: shift.id }).returning();
    const [second] = await db.insert(employees).values({ empCode: uniqueCode(), name: "Grid Person B", joinDate: "2046-01-01", shiftId: shift.id }).returning();
    a = first.id;
    b = second.id;
  });
  afterAll(() => close());

  it("holds only the person asked for", { timeout: 60_000 }, async () => {
    const grid = await loadPeriodGrid(db, monthPeriod("2046-05"), "2046-05-10", { employeeIds: [a] });
    expect(grid.rows.map((row) => row.employee.id)).toEqual([a]);
    expect(grid.rows[0].cells.size).toBeGreaterThan(0);
  });

  it("holds the people asked for, and nobody not employed that month", { timeout: 60_000 }, async () => {
    const both = await loadPeriodGrid(db, monthPeriod("2046-05"), "2046-05-10", { employeeIds: [a, b] });
    expect(both.rows.map((row) => row.employee.id).sort()).toEqual([a, b].sort());

    const before = await loadPeriodGrid(db, monthPeriod("2045-05"), "2046-05-10", { employeeIds: [a] });
    expect(before.rows).toEqual([]);
  });
});
