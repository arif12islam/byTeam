import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { auditLog, holidays } from "@/db/schema";
import { importHolidays } from "@/lib/settings/holiday-import";
import { createUser } from "@/lib/users";

import { connect, testDatabaseUrl, type TestDb } from "./helpers";

vi.mock("server-only", () => ({}));

// 2043 is used by no other test.
const DATES = ["2043-02-21", "2043-03-26", "2043-04-14", "2043-12-16"];

describe.skipIf(!testDatabaseUrl)("importing holidays", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let actor: string;

  beforeAll(async () => {
    ({ db, close } = connect());
    actor = (await createUser(db, { name: "Import tester", email: `imp-${randomUUID()}@example.com`, password: "password-1", role: "hr" }, null)).id;
    await db.delete(holidays).where(inArray(holidays.date, DATES));
  });
  afterAll(() => close());

  it("adds each one through the audited path, skips a date that already has a holiday, and ignores bad entries", async () => {
    await db.insert(holidays).values({ date: DATES[1], name: "Already here" });

    const result = await importHolidays(
      db,
      [
        { date: DATES[0], name: "Language Martyrs' Day" },
        { date: DATES[1], name: "Independence Day" },
        { date: DATES[2], name: "Bengali New Year" },
        { date: "2043-02-30", name: "Not a date" },
        { date: DATES[3], name: "   " },
        { date: DATES[0], name: "Same day twice" },
      ],
      actor,
    );

    expect(result.added).toBe(2);
    expect(result.skipped.sort()).toEqual(["2043-02-30", DATES[0], DATES[1], DATES[3]].sort());

    const saved = await db.select().from(holidays).where(inArray(holidays.date, DATES));
    expect(Object.fromEntries(saved.map((h) => [h.date, h.name]))).toEqual({
      [DATES[0]]: "Language Martyrs' Day",
      [DATES[1]]: "Already here",
      [DATES[2]]: "Bengali New Year",
    });

    // One audit row for each holiday added, and none for the skipped ones.
    const added = saved.filter((h) => h.date !== DATES[1]);
    const rows = await db.select().from(auditLog).where(inArray(auditLog.entityId, added.map((h) => h.id)));
    expect(rows.map((r) => r.action).sort()).toEqual(["holiday.create", "holiday.create"]);
    expect(await db.select().from(auditLog).where(eq(auditLog.entityId, saved.find((h) => h.date === DATES[1])!.id))).toHaveLength(0);
  });
});
