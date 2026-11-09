import { randomUUID } from "node:crypto";

import { desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { auditLog, companySettings } from "@/db/schema";
import { getCompanySettings, saveCompanySettings } from "@/lib/settings/company";
import { createUser } from "@/lib/users";

import { connect, testDatabaseUrl, type TestDb } from "./helpers";

vi.mock("server-only", () => ({}));

/**
 * The company settings are one shared row that other test files read, so this
 * flips the choice and puts it back inside a single test, with nothing else
 * in between. How a day is computed with it off is covered in
 * tests/attendance/compute-day.test.ts.
 */
describe.skipIf(!testDatabaseUrl)("leaving punch setting", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  let actor: string;

  beforeAll(async () => {
    ({ db, close } = connect());
    actor = (await createUser(db, { name: "Setting tester", email: `set-${randomUUID()}@example.com`, password: "password-1", role: "owner" }, null)).id;
    await db.insert(companySettings).values({ id: 1, name: "Test company" }).onConflictDoNothing();
  });
  afterAll(async () => {
    await close();
  });

  it("saves the choice, audits it, keeps it when left out, and treats the same value as no change", async () => {
    const start = await getCompanySettings(db);
    try {
      expect(await saveCompanySettings(db, { name: start.name || "Test company", weeklyOffDays: start.weeklyOffDays, trackLeavingPunch: false }, actor)).toEqual({
        changed: start.trackLeavingPunch,
      });
      expect((await getCompanySettings(db)).trackLeavingPunch).toBe(false);

      // Left out: the saved choice stays.
      await saveCompanySettings(db, { name: start.name || "Test company", weeklyOffDays: start.weeklyOffDays }, actor);
      expect((await getCompanySettings(db)).trackLeavingPunch).toBe(false);
      // Same value again: nothing to save.
      expect(await saveCompanySettings(db, { name: start.name || "Test company", weeklyOffDays: start.weeklyOffDays, trackLeavingPunch: false }, actor)).toEqual({
        changed: false,
      });

      const [latest] = await db.select().from(auditLog).where(eq(auditLog.entity, "company_settings")).orderBy(desc(auditLog.createdAt)).limit(1);
      expect(latest.action).toBe("settings.update");
      expect(JSON.stringify(latest.after)).toContain('"trackLeavingPunch":false');
    } finally {
      await saveCompanySettings(db, { name: start.name || "Test company", weeklyOffDays: start.weeklyOffDays, trackLeavingPunch: true }, actor);
    }
    expect((await getCompanySettings(db)).trackLeavingPunch).toBe(true);
  });
});
