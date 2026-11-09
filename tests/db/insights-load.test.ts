import { randomUUID } from "node:crypto";

import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { devices, employees, shifts } from "@/db/schema";
import { savePunches } from "@/lib/adms/store";
import { getInsights, INSIGHTS_TTL_MS, loadInsightsInput } from "@/lib/insights/load";
import { officeDateTimeToInstant } from "@/lib/time";

import { addTestDevice, connect, testDatabaseUrl, uniqueCode, uniqueSerial, type TestDb } from "./helpers";

vi.mock("server-only", () => ({}));

// May 2044 is used by no other test. Thursday 5 May is "today"; Monday 2 to Wednesday 4 are working days in any week setting.
const TODAY = "2044-05-05";
const NOW = officeDateTimeToInstant(TODAY, "12:00")!;

describe.skipIf(!testDatabaseUrl)("insights from the database", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let personId: string;
  let serial: string;

  beforeAll(async () => {
    ({ db, close } = connect());
    // Earlier runs of this file left people who were late in this month too. Switch them off, so only this run's person is in the grid:
    // a rule gives at most five facts, and equal people would push this one out.
    await db.update(employees).set({ active: false }).where(like(employees.name, "Insight Person %"));
    const code = uniqueCode();
    const [shift] = await db.insert(shifts).values({ name: `Insights shift ${code}`, startTime: "09:00", endTime: "18:00", graceMinutes: 10 }).returning();
    const [person] = await db.insert(employees).values({ empCode: code, name: `Insight Person ${code}`, joinDate: "2044-01-01", shiftId: shift.id }).returning();
    personId = person.id;

    serial = uniqueSerial("INS");
    const device = await addTestDevice(db, serial);
    // Quiet for three hours, with a clock five minutes fast.
    await db.update(devices).set({ lastSeenAt: new Date(NOW.getTime() - 3 * 3_600_000), name: `Insight door ${serial}`, clockOffsetSeconds: 300 }).where(eq(devices.id, device.id));

    // Late on three working days: 10:30 against a 09:00 start with 10 minutes grace.
    await savePunches(
      db,
      ["2044-05-02", "2044-05-03", "2044-05-04"].flatMap((date) =>
        ["10:30", "17:30"].map((time) => ({ deviceSn: serial, empCode: code, punchedAt: officeDateTimeToInstant(date, time)!, statusCode: 0, verifyCode: 1, rawLine: `${code} ${date} ${time} ${randomUUID()}` })),
      ),
    );
  });
  afterAll(() => close());

  it("loads this month and last month, and the rules turn what is there into facts", { timeout: 60_000 }, async () => {
    const input = await loadInsightsInput(db, NOW);
    expect(input.today).toBe(TODAY);
    expect(input.current.from).toBe("2044-05-01");
    expect(input.previous.from).toBe("2044-04-01");

    const mine = input.current.rows.find((row) => row.employee.id === personId);
    expect(mine?.totals.late).toBe(3);

    const { insights } = await getInsights(db, NOW);
    const up = insights.facts.find((f) => f.id === `lates-up:${personId}`);
    expect(up?.text).toContain("was late 3 times so far this month, the first lates in a while.");
    expect(up?.href).toBe(`/attendance/${personId}?month=2044-05`);

    // The quiet device and its clock, while the office is open.
    expect(insights.facts.find((f) => f.id === `device-offline:${serial}`)?.text).toContain(`Insight door ${serial} was last heard from 3 h ago`);
    expect(insights.facts.find((f) => f.id === `device-clock:${serial}`)?.text).toContain("5 min fast");
  });

  it("is reused for a few minutes, and worked out again after that or on a new day", { timeout: 60_000 }, async () => {
    const globalCache = globalThis as unknown as { byteamInsights?: unknown };
    globalCache.byteamInsights = undefined;

    const first = await getInsights(db, NOW);
    expect(await getInsights(db, new Date(NOW.getTime() + 60_000))).toBe(first);
    const later = await getInsights(db, new Date(NOW.getTime() + INSIGHTS_TTL_MS + 1_000));
    expect(later).not.toBe(first);
    const nextDay = await getInsights(db, new Date(NOW.getTime() + 24 * 3_600_000));
    expect(nextDay.insights).not.toBe(later.insights);
    globalCache.byteamInsights = undefined;
  });
});
