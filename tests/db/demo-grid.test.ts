import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { attendanceDays, companySettings, employees, users } from "@/db/schema";
import { loadMonthGrid } from "@/lib/attendance/month";
import { buildDemoPlan, DEMO_EMPLOYEE_COUNT, type DemoPlan } from "@/lib/demo/scenarios";
import { applyDemoPlan } from "@/lib/demo/seed";

import { connect, testDatabaseUrl, uniqueCode, uniqueSerial, type TestDb } from "./helpers";

type Fixture = {
  key: string;
  name: string;
  story: string;
  joinDate: string;
  grid: Record<string, string>;
  lateMinutes: Record<string, number>;
  missingOut: string[];
  workedOnOffDay: string[];
  totals: { present: number; late: number; absent: number; leave: number; missingOut: number; workedOffDays: number; lateMinutes: number };
};

const MONTH = "2017-03";
const TODAY = "2017-04-05";
const DIR = path.join(__dirname, "..", "fixtures", "demo", MONTH);
const fixtures: Fixture[] = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(path.join(DIR, f), "utf8")) as Fixture);

describe.skipIf(!testDatabaseUrl)("the demo month matches the hand-made expected grid", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let plan: DemoPlan;
  let idByKey: Map<string, string>;

  beforeAll(async () => {
    ({ db, close } = connect());
    const actorId = `test-user-${uniqueCode()}`;
    await db.insert(users).values({ id: actorId, name: "Grid owner", email: `${actorId}@example.test`, role: "owner" });
    await db
      .insert(companySettings)
      .values({ id: 1, name: "Test company", weeklyOffDays: [5, 6] })
      .onConflictDoUpdate({ target: companySettings.id, set: { weeklyOffDays: [5, 6] } });

    const codes = Array.from({ length: DEMO_EMPLOYEE_COUNT }, () => uniqueCode());
    plan = buildDemoPlan(MONTH, [5, 6], codes);
    const id = uniqueCode();
    await applyDemoPlan(db, plan, {
      actorId,
      deviceSerial: uniqueSerial("G"),
      today: TODAY,
      names: { shift: `Grid shift ${id}`, paidLeave: `Grid casual ${id}`, unpaidLeave: `Grid unpaid ${id}` },
    });

    const rows = await db.select({ id: employees.id, empCode: employees.empCode }).from(employees).where(inArray(employees.empCode, codes));
    idByKey = new Map(plan.employees.map((p) => [p.key, rows.find((r) => r.empCode === p.empCode)!.id]));
  }, 120_000);
  afterAll(() => close());

  it("has one fixture for each of the eight people", () => {
    expect(fixtures.map((f) => f.key).sort()).toEqual(plan.employees.map((p) => p.key).sort());
  });

  describe.each(fixtures.map((f) => [f.key, f] as const))("%s", (_key, fixture) => {
    it("has the expected day by day grid, late minutes and flags", async () => {
      const grid = await loadMonthGrid(db, MONTH, TODAY);
      const row = grid.rows.find((r) => r.employee.id === idByKey.get(fixture.key))!;
      expect(row, fixture.story).toBeDefined();

      // Days before joining have no cell, so the cells are exactly the fixture's dates.
      expect([...row.cells.keys()].sort()).toEqual(Object.keys(fixture.grid).sort());
      for (const [date, status] of Object.entries(fixture.grid)) {
        expect(row.cells.get(date)?.status, `${fixture.name} on ${date}`).toBe(status);
      }

      const lateMinutes = Object.fromEntries([...row.cells].filter(([, c]) => c.lateMinutes > 0).map(([d, c]) => [d, c.lateMinutes]));
      expect(lateMinutes).toEqual(fixture.lateMinutes);
      expect([...row.cells].filter(([, c]) => c.missingOut).map(([d]) => d).sort()).toEqual(fixture.missingOut);
      expect([...row.cells].filter(([, c]) => c.workedOnOffDay).map(([d]) => d).sort()).toEqual(fixture.workedOnOffDay);
      expect(row.totals).toEqual(fixture.totals);
      // Nothing was corrected by hand.
      expect([...row.cells.values()].some((c) => c.isManual)).toBe(false);
    });

    it("has the same days saved in the database as the live grid shows", async () => {
      const stored = await db
        .select({ date: attendanceDays.date, status: attendanceDays.status })
        .from(attendanceDays)
        .where(and(eq(attendanceDays.employeeId, idByKey.get(fixture.key)!)));
      const inMonth = Object.fromEntries(stored.filter((s) => s.date.startsWith(MONTH)).map((s) => [s.date, s.status]));
      expect(inMonth).toEqual(fixture.grid);
    });
  });
});
