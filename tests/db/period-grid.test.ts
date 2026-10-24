import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { employees, shifts } from "@/db/schema";
import { savePunches } from "@/lib/adms/store";
import { loadMonthGrid, loadPeriodGrid } from "@/lib/attendance/month";
import { monthPeriod } from "@/lib/period";
import { officeDateTimeToInstant } from "@/lib/time";

import { addTestDevice, connect, testDatabaseUrl, uniqueCode, uniqueSerial, type TestDb } from "./helpers";

// September to November 2034, months no other test uses. The 1st of each is a Friday, Sunday and Wednesday.
describe.skipIf(!testDatabaseUrl)("period grid over several months", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;

  beforeAll(() => {
    ({ db, close } = connect());
  });
  afterAll(() => close());

  async function person(join: string, exit: string | null = null) {
    const code = uniqueCode();
    const [shift] = await db.insert(shifts).values({ name: `Period ${code}`, startTime: "09:00", endTime: "18:00", graceMinutes: 10 }).returning();
    const [employee] = await db.insert(employees).values({ empCode: code, name: `Period ${code}`, joinDate: join, exitDate: exit, shiftId: shift.id }).returning();
    const serial = uniqueSerial("R");
    await addTestDevice(db, serial);
    const punch = (date: string, time: string) => ({
      deviceSn: serial,
      empCode: code,
      punchedAt: officeDateTimeToInstant(date, time)!,
      statusCode: 0,
      verifyCode: 1,
      rawLine: `${code} ${date} ${time}`,
    });
    return { employee, punch };
  }

  it("lists every date of the period and adds up punches from different months", async () => {
    const { employee, punch } = await person("2034-01-01");
    await savePunches(db, [punch("2034-09-04", "09:40"), punch("2034-09-04", "18:00"), punch("2034-10-04", "08:55"), punch("2034-10-04", "18:00"), punch("2034-11-06", "09:30"), punch("2034-11-06", "18:00")]);

    const grid = await loadPeriodGrid(db, { from: "2034-09-01", to: "2034-11-30" }, "2034-12-15");
    expect(grid.dates).toHaveLength(30 + 31 + 30);
    expect(grid.dates[0]).toBe("2034-09-01");
    expect(grid.dates.at(-1)).toBe("2034-11-30");
    expect(grid).toMatchObject({ from: "2034-09-01", to: "2034-11-30", month: "2034-09" });

    const row = grid.rows.find((r) => r.employee.id === employee.id)!;
    expect(row.cells.get("2034-09-04")).toMatchObject({ status: "late", lateMinutes: 40 });
    expect(row.cells.get("2034-10-04")).toMatchObject({ status: "present" });
    expect(row.cells.get("2034-11-06")).toMatchObject({ status: "late", lateMinutes: 30 });
    // Two late days across the three months, and the totals cover the whole period.
    expect(row.totals.late).toBe(2);
    expect(row.totals.present).toBe(3);
  });

  it("gives a part-month period only its own days", async () => {
    const { employee, punch } = await person("2034-01-01");
    await savePunches(db, [punch("2034-10-04", "08:55"), punch("2034-10-04", "18:00"), punch("2034-10-11", "09:45"), punch("2034-10-11", "18:00")]);

    const grid = await loadPeriodGrid(db, { from: "2034-10-03", to: "2034-10-05" }, "2034-12-15");
    const row = grid.rows.find((r) => r.employee.id === employee.id)!;
    expect(grid.dates).toEqual(["2034-10-03", "2034-10-04", "2034-10-05"]);
    expect([...row.cells.keys()].sort()).toEqual(grid.dates);
    expect(row.totals.late).toBe(0);
  });

  it("stops at today when the period reaches into the future", async () => {
    const { employee } = await person("2034-01-01");
    const grid = await loadPeriodGrid(db, { from: "2034-10-01", to: "2034-12-31" }, "2034-10-10");
    const row = grid.rows.find((r) => r.employee.id === employee.id)!;
    expect(grid.dates).toHaveLength(92);
    expect([...row.cells.keys()].every((d) => d <= "2034-10-10")).toBe(true);
    expect(row.cells.has("2034-10-10")).toBe(true);
    expect(row.cells.has("2034-10-11")).toBe(false);
  });

  it("starts people at their join date and stops them at their exit date inside the period", async () => {
    const joined = await person("2034-10-20", "2034-11-05");
    const grid = await loadPeriodGrid(db, { from: "2034-10-01", to: "2034-11-30" }, "2034-12-15");
    const row = grid.rows.find((r) => r.employee.id === joined.employee.id)!;
    const dates = [...row.cells.keys()].sort();
    expect(dates[0]).toBe("2034-10-20");
    expect(dates.at(-1)).toBe("2034-11-05");
  });

  it("leaves out people who joined after the period or left before it", async () => {
    const later = await person("2034-12-01");
    const earlier = await person("2033-01-01", "2034-08-31");
    const grid = await loadPeriodGrid(db, { from: "2034-09-01", to: "2034-11-30" }, "2034-12-15");
    expect(grid.rows.some((r) => r.employee.id === later.employee.id)).toBe(false);
    expect(grid.rows.some((r) => r.employee.id === earlier.employee.id)).toBe(false);
  });

  it("gives an empty grid, with every date, for a period that has not started", async () => {
    const grid = await loadPeriodGrid(db, { from: "2099-01-01", to: "2099-03-31" }, "2034-12-15");
    expect(grid.rows).toEqual([]);
    expect(grid.dates).toHaveLength(90);
  });

  it("gives the same answer for a month as the month loader", async () => {
    const { employee, punch } = await person("2034-01-01");
    await savePunches(db, [punch("2034-10-18", "09:30"), punch("2034-10-18", "18:00")]);
    const a = await loadPeriodGrid(db, monthPeriod("2034-10"), "2034-12-15");
    const b = await loadMonthGrid(db, "2034-10", "2034-12-15");
    const find = (g: typeof a) => g.rows.find((r) => r.employee.id === employee.id)!;
    expect(a.dates).toEqual(b.dates);
    expect(find(a).totals).toEqual(find(b).totals);
  });
});
