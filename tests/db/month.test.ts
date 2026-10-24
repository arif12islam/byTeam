import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { employees, shifts } from "@/db/schema";
import { savePunches } from "@/lib/adms/store";
import { loadDayDetail, loadMonthGrid } from "@/lib/attendance/month";
import { officeDateTimeToInstant } from "@/lib/time";

import { addTestDevice, connect, testDatabaseUrl, uniqueCode, uniqueSerial, type TestDb } from "./helpers";

// September 2033: a month no other test uses. The 1st is a Thursday.
const MONTH = "2033-09";
const at = (day: number, time: string) => officeDateTimeToInstant(`${MONTH}-${String(day).padStart(2, "0")}`, time)!;

describe.skipIf(!testDatabaseUrl)("month grid and day detail", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;

  beforeAll(() => {
    ({ db, close } = connect());
  });
  afterAll(() => close());

  async function setup(join: string, exit: string | null = null, active = true) {
    const code = uniqueCode();
    const [shift] = await db.insert(shifts).values({ name: `Month ${code}`, startTime: "09:00", endTime: "18:00", graceMinutes: 10 }).returning();
    const [employee] = await db
      .insert(employees)
      .values({ empCode: code, name: `Month ${code}`, joinDate: join, exitDate: exit, active, shiftId: shift.id })
      .returning();
    const serial = uniqueSerial("M");
    await addTestDevice(db, serial);
    const punch = (day: number, time: string) => ({
      deviceSn: serial,
      empCode: code,
      punchedAt: at(day, time),
      statusCode: 0,
      verifyCode: 1,
      rawLine: `${code} ${day} ${time}`,
    });
    return { employee, serial, punch };
  }

  it("builds cells only up to today and counts the totals", async () => {
    const { employee, punch } = await setup("2033-01-01");
    await savePunches(db, [punch(1, "09:30"), punch(1, "18:00"), punch(2, "08:55")]);

    // "Today" is the 3rd: days after it have no cell.
    const grid = await loadMonthGrid(db, MONTH, `${MONTH}-03`);
    const row = grid.rows.find((r) => r.employee.id === employee.id)!;
    expect(grid.dates).toHaveLength(30);
    expect([...row.cells.keys()].sort()).toEqual([`${MONTH}-01`, `${MONTH}-02`, `${MONTH}-03`]);
    expect(row.cells.get(`${MONTH}-01`)).toMatchObject({ status: "late", lateMinutes: 30 });
    expect(row.cells.get(`${MONTH}-02`)).toMatchObject({ missingOut: true });
  });

  it("starts at the join date, stops at the exit date, and leaves out people who left before the month", async () => {
    const joined = await setup(`${MONTH}-10`, `${MONTH}-12`);
    const gone = await setup("2033-01-01", "2033-08-31", false);
    const quitWithoutDate = await setup("2033-01-01", null, false);

    const grid = await loadMonthGrid(db, MONTH, "2033-10-15");
    const joinedRow = grid.rows.find((r) => r.employee.id === joined.employee.id)!;
    expect([...joinedRow.cells.keys()].sort()).toEqual([`${MONTH}-10`, `${MONTH}-11`, `${MONTH}-12`]);
    expect(grid.rows.some((r) => r.employee.id === gone.employee.id)).toBe(false);
    expect(grid.rows.some((r) => r.employee.id === quitWithoutDate.employee.id)).toBe(false);
  });

  it("returns an empty grid for a month that has not started", async () => {
    const grid = await loadMonthGrid(db, "2099-01", "2033-10-15");
    expect(grid.rows).toEqual([]);
    expect(grid.dates).toHaveLength(31);
  });

  it("shows a day with every raw punch and the device's name", async () => {
    const { employee, serial, punch } = await setup("2033-01-01");
    await savePunches(db, [punch(5, "08:58"), punch(5, "13:00"), punch(5, "18:10"), punch(6, "09:00")]);

    const detail = await loadDayDetail(db, employee.id, `${MONTH}-05`);
    expect(detail?.result).toMatchObject({ status: "present", punchCount: 3 });
    expect(detail?.punches.map((p) => p.at)).toEqual([at(5, "08:58"), at(5, "13:00"), at(5, "18:10")]);
    expect(detail?.punches[0].deviceSn).toBe(serial);
    expect(detail?.punches[0].deviceName).not.toBeNull();
    expect(detail?.employee).toMatchObject({ shiftStart: "09:00", shiftEnd: "18:00", graceMinutes: 10 });
  });

  it("has no result before the join date, and null for an unknown employee", async () => {
    const { employee } = await setup(`${MONTH}-20`);
    expect((await loadDayDetail(db, employee.id, `${MONTH}-19`))?.result).toBeNull();
    expect(await loadDayDetail(db, "00000000-0000-4000-8000-000000000000", `${MONTH}-19`)).toBeNull();
  });
});
