import { randomUUID } from "node:crypto";

import { desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { auditLog, companySettings } from "@/db/schema";
import { getCompanySettings, saveCompanySettings } from "@/lib/settings/company";
import { createUser } from "@/lib/users";

import { connect, testDatabaseUrl, type TestDb } from "./helpers";

vi.mock("server-only", () => ({}));

class Rollback extends Error {}

/**
 * The company settings are one shared row that other test files read while this
 * one runs, and a day is computed differently with the leaving punch off. So
 * everything here happens inside a transaction that is rolled back at the end,
 * and no other test ever sees the change. How a day is computed with it off is
 * covered in tests/attendance/compute-day.test.ts.
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
    const name = start.name || "Test company";

    const run = db.transaction(async (tx) => {
      const inTx = tx as unknown as TestDb;
      expect(await saveCompanySettings(inTx, { name, weeklyOffDays: start.weeklyOffDays, trackLeavingPunch: false }, actor)).toEqual({
        changed: start.trackLeavingPunch || name !== start.name,
      });
      expect((await getCompanySettings(tx)).trackLeavingPunch).toBe(false);

      // Left out: the saved choice stays.
      await saveCompanySettings(inTx, { name, weeklyOffDays: start.weeklyOffDays }, actor);
      expect((await getCompanySettings(tx)).trackLeavingPunch).toBe(false);
      // The same value again: nothing to save.
      expect(await saveCompanySettings(inTx, { name, weeklyOffDays: start.weeklyOffDays, trackLeavingPunch: false }, actor)).toEqual({ changed: false });

      const [latest] = await tx.select().from(auditLog).where(eq(auditLog.entity, "company_settings")).orderBy(desc(auditLog.createdAt)).limit(1);
      expect(latest.action).toBe("settings.update");
      expect(JSON.stringify(latest.after)).toContain('"trackLeavingPunch":false');

      // Turning it back on is a change too.
      expect(await saveCompanySettings(inTx, { name, weeklyOffDays: start.weeklyOffDays, trackLeavingPunch: true }, actor)).toEqual({ changed: true });
      expect((await getCompanySettings(tx)).trackLeavingPunch).toBe(true);

      throw new Rollback();
    });
    await expect(run).rejects.toBeInstanceOf(Rollback);

    // Nothing was kept.
    expect((await getCompanySettings(db)).trackLeavingPunch).toBe(start.trackLeavingPunch);
  });
});
