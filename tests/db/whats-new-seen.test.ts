import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { users } from "@/db/schema";
import { LATEST_RELEASE } from "@/lib/whats-new/releases";
import { markReleaseSeen } from "@/lib/whats-new/seen";

import { connect, testDatabaseUrl, type TestDb } from "./helpers";

describe.skipIf(!testDatabaseUrl)("marking the What's new tour as seen", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;

  beforeAll(() => {
    ({ db, close } = connect());
  });
  afterAll(() => close());

  const person = async () => {
    const id = `seen-${randomUUID()}`;
    await db.insert(users).values({ id, name: "Seen tester", email: `${id}@example.test`, role: "hr" });
    return id;
  };
  const seenBy = async (id: string) => (await db.select({ seen: users.lastSeenRelease }).from(users).where(eq(users.id, id)))[0].seen;

  it("starts empty, records the newest release for that person only, and can be repeated", async () => {
    const a = await person();
    const b = await person();
    expect(await seenBy(a)).toBeNull();

    await markReleaseSeen(db, a);
    expect(await seenBy(a)).toBe(LATEST_RELEASE.id);
    expect(await seenBy(b)).toBeNull();

    await markReleaseSeen(db, a);
    expect(await seenBy(a)).toBe(LATEST_RELEASE.id);
  });
});
