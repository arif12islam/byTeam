import { randomUUID } from "node:crypto";

import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { auditLog, employees, shifts, users } from "@/db/schema";
import { savePunches } from "@/lib/adms/store";
import { updateEmployee } from "@/lib/employees/employees";
import { getInsights, loadInsightsInput } from "@/lib/insights/load";
import { officeDateTimeToInstant } from "@/lib/time";

import { addTestDevice, connect, testDatabaseUrl, uniqueCode, uniqueSerial, type TestDb } from "./helpers";

vi.mock("server-only", () => ({}));

// May 2042 is used by no other test. Thursday 8 May is "today"; Monday 5 to Wednesday 7 are working days in any week setting.
const TODAY = "2042-05-08";
const NOW = officeDateTimeToInstant(TODAY, "12:00")!;
class Rollback extends Error {}

const cache = globalThis as unknown as { byteamInsights?: unknown };

describe.skipIf(!testDatabaseUrl)("leaving people out of Insights", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let userId: string;
  let shiftId: string;
  let manager: { id: string; name: string; code: string };
  let staff: { id: string; name: string; code: string };

  async function addLatePerson(label: string) {
    const code = uniqueCode();
    const [person] = await db.insert(employees).values({ empCode: code, name: `Exclude Person ${label} ${code}`, joinDate: "2042-01-01", shiftId }).returning();
    const serial = uniqueSerial("EXC");
    await addTestDevice(db, serial, false);
    // Late on three working days: 10:30 against a 09:00 start with 10 minutes grace.
    await savePunches(
      db,
      ["2042-05-05", "2042-05-06", "2042-05-07"].flatMap((date) =>
        ["10:30", "17:30"].map((time) => ({ deviceSn: serial, empCode: code, punchedAt: officeDateTimeToInstant(date, time)!, statusCode: 0, verifyCode: 1, rawLine: `${code} ${date} ${time} ${randomUUID()}` })),
      ),
    );
    return { id: person.id, name: person.name, code };
  }

  const details = (person: { name: string }, excludeFromInsights: boolean) => ({ name: person.name, joinDate: "2042-01-01", shiftId, excludeFromInsights });

  beforeAll(async () => {
    ({ db, close } = connect());
    // Earlier runs left people who were late in this month too. Switch them off so only this run's people count.
    await db.update(employees).set({ active: false }).where(like(employees.name, "Exclude Person %"));
    userId = `exclude-user-${uniqueCode()}`;
    await db.insert(users).values({ id: userId, name: "Tester", email: `${userId}@example.test`, role: "hr" });
    const [shift] = await db.insert(shifts).values({ name: `Exclude shift ${uniqueCode()}`, startTime: "09:00", endTime: "18:00", graceMinutes: 10 }).returning();
    shiftId = shift.id;
    manager = await addLatePerson("manager");
    staff = await addLatePerson("staff");
    cache.byteamInsights = undefined;
  });
  afterAll(async () => {
    cache.byteamInsights = undefined;
    await close();
  });

  it("names both people until one is left out", { timeout: 60_000 }, async () => {
    const { insights } = await getInsights(db, NOW);
    expect(insights.facts.some((f) => f.subject === manager.id)).toBe(true);
    expect(insights.facts.some((f) => f.subject === staff.id)).toBe(true);
  });

  // Who is left out is part of what other Insights tests read, so the changes below happen in a transaction that is rolled back.
  it("stops naming a person once they are left out, at once, and names them again when switched back in", { timeout: 60_000 }, async () => {
    const run = db.transaction(async (tx) => {
      const inTx = tx as unknown as TestDb;

      const saved = await updateEmployee(inTx, manager.id, details(manager, true), userId);
      expect(saved?.changed).toBe(true);
      const rows = await inTx.select().from(auditLog).where(eq(auditLog.entityId, manager.id));
      const update = rows.find((r) => r.action === "employee.update");
      expect(update?.before).toMatchObject({ excludeFromInsights: false });
      expect(update?.after).toMatchObject({ excludeFromInsights: true });

      // Still inside the cache time: the answer changes anyway, because who is left out is part of the cache key.
      const out = await getInsights(inTx, new Date(NOW.getTime() + 60_000));
      expect(out.insights.facts.some((f) => f.subject === manager.id)).toBe(false);
      expect(out.insights.facts.some((f) => f.subject === staff.id)).toBe(true);
      expect(out.leftOut.map((p) => p.id)).toContain(manager.id);

      const input = await loadInsightsInput(inTx, NOW);
      expect(input.current.rows.some((r) => r.employee.id === manager.id)).toBe(false);
      expect(input.previous.rows.some((r) => r.employee.id === manager.id)).toBe(false);
      expect(input.current.rows.some((r) => r.employee.id === staff.id)).toBe(true);

      await updateEmployee(inTx, manager.id, details(manager, false), userId);
      const back = await getInsights(inTx, new Date(NOW.getTime() + 120_000));
      expect(back.insights.facts.some((f) => f.subject === manager.id)).toBe(true);
      expect(back.leftOut.map((p) => p.id)).not.toContain(manager.id);

      throw new Rollback();
    });
    await expect(run).rejects.toBeInstanceOf(Rollback);

    // Nothing was kept.
    expect((await db.select().from(employees).where(eq(employees.id, manager.id)))[0].excludeFromInsights).toBe(false);
  });
});
