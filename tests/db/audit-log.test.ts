import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auditLog, users } from "@/db/schema";
import { AUDIT_PAGE_SIZE, listAuditEntries, loadAuditFilterOptions } from "@/lib/audit-log";
import { officeDateTimeToInstant } from "@/lib/time";

import { connect, testDatabaseUrl, uniqueCode, type TestDb } from "./helpers";

describe.skipIf(!testDatabaseUrl)("audit log listing", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  // A kind of record no other test writes, so every query here is limited to these rows.
  let entity: string;
  let ana: string;
  let ben: string;

  const at = (date: string, time: string) => officeDateTimeToInstant(date, time)!;
  const row = (over: Partial<typeof auditLog.$inferInsert>) => ({
    actorId: ana,
    action: "thing.create",
    entity,
    entityId: "rec-1",
    before: null,
    after: { name: "x" },
    createdAt: at("2020-03-05", "12:00"),
    ...over,
  });
  const list = (filters = {}, page = 1) => listAuditEntries(db, { entity, ...filters }, page);

  beforeAll(async () => {
    ({ db, close } = connect());
    const code = uniqueCode();
    entity = `testthing_${code}`;
    ana = `test-ana-${code}`;
    ben = `test-ben-${code}`;
    await db.insert(users).values([
      { id: ana, name: `Ana ${code}`, email: `${ana}@example.test`, role: "hr" },
      { id: ben, name: `Ben ${code}`, email: `${ben}@example.test`, role: "owner" },
    ]);
    await db.insert(auditLog).values([
      row({ entityId: "rec-1", createdAt: at("2020-03-05", "00:10") }), // just after midnight in Dhaka
      row({ entityId: "rec-1", action: "thing.update", createdAt: at("2020-03-05", "23:30"), before: { name: "x" }, after: { name: "y" } }),
      row({ entityId: "rec-2", actorId: ben, action: "thing.update", createdAt: at("2020-03-06", "00:10") }),
      row({ entityId: "rec-3", actorId: null, action: "thing.seed", createdAt: at("2020-03-07", "09:00") }),
      row({ entityId: "rec-2", actorId: ben, action: "thing.delete", createdAt: at("2020-03-08", "09:00"), before: { name: "y" }, after: null }),
    ]);
  });
  afterAll(() => close());

  const ids = (r: Awaited<ReturnType<typeof list>>) => r.entries.map((e) => `${e.entityId}:${e.action}`);

  it("lists everything of a kind, newest first, with the person's name", async () => {
    const result = await list();
    expect(result.total).toBe(5);
    expect(ids(result)).toEqual(["rec-2:thing.delete", "rec-3:thing.seed", "rec-2:thing.update", "rec-1:thing.update", "rec-1:thing.create"]);
    expect(result.entries[0].actorName).toMatch(/^Ben /);
    expect(result.entries[1].actorName).toBeNull(); // the system
    expect(result.entries[3]).toMatchObject({ before: { name: "x" }, after: { name: "y" } });
  });

  it("filters by person, and by the system", async () => {
    expect((await list({ actor: ben })).total).toBe(2);
    expect((await list({ actor: ana })).total).toBe(2);
    expect(ids(await list({ actor: "system" }))).toEqual(["rec-3:thing.seed"]);
  });

  it("filters by action and by one record", async () => {
    expect(ids(await list({ action: "thing.update" }))).toEqual(["rec-2:thing.update", "rec-1:thing.update"]);
    expect(ids(await list({ record: "rec-2" }))).toEqual(["rec-2:thing.delete", "rec-2:thing.update"]);
    expect((await list({ record: "nobody" })).total).toBe(0);
  });

  it("combines filters: all of them must match", async () => {
    expect(ids(await list({ actor: ben, action: "thing.update" }))).toEqual(["rec-2:thing.update"]);
    expect((await list({ actor: ana, action: "thing.delete" })).total).toBe(0);
    expect(ids(await list({ actor: "system", record: "rec-3" }))).toEqual(["rec-3:thing.seed"]);
  });

  it("reads the dates as Dhaka days, both ends included", async () => {
    // 23:30 on the 5th is in, and 00:10 on the 6th is out. 00:10 on the 5th is in.
    expect(ids(await list({ from: "2020-03-05", to: "2020-03-05" }))).toEqual(["rec-1:thing.update", "rec-1:thing.create"]);
    expect(ids(await list({ from: "2020-03-06", to: "2020-03-06" }))).toEqual(["rec-2:thing.update"]);
    expect((await list({ from: "2020-03-07" })).total).toBe(2);
    expect((await list({ to: "2020-03-05" })).total).toBe(2);
    expect((await list({ from: "2020-03-09" })).total).toBe(0);
  });

  it("ignores a date that is not a date", async () => {
    expect((await list({ from: "yesterday", to: "2020-02-30" })).total).toBe(5);
  });

  it("pages by 50, keeps the page in range, and counts every match", async () => {
    const code = uniqueCode();
    const many = `testmany_${code}`;
    await db.insert(auditLog).values(
      Array.from({ length: 120 }, (_, i) => ({
        actorId: ana,
        action: "thing.create",
        entity: many,
        entityId: `n-${String(i).padStart(3, "0")}`,
        createdAt: new Date(Date.UTC(2020, 0, 1, 0, 0, i)),
      })),
    );
    const first = await listAuditEntries(db, { entity: many }, 1);
    expect([first.total, first.pages, first.page, first.entries.length]).toEqual([120, 3, 1, AUDIT_PAGE_SIZE]);
    expect(first.entries[0].entityId).toBe("n-119");

    const third = await listAuditEntries(db, { entity: many }, 3);
    expect([third.page, third.entries.length]).toEqual([3, 20]);
    expect(third.entries.at(-1)?.entityId).toBe("n-000");

    // No row on two pages, none missed.
    const all = [...first.entries, ...(await listAuditEntries(db, { entity: many }, 2)).entries, ...third.entries];
    expect(new Set(all.map((e) => e.entityId)).size).toBe(120);

    expect((await listAuditEntries(db, { entity: many }, 99)).page).toBe(3);
    expect((await listAuditEntries(db, { entity: many }, 0)).page).toBe(1);
    expect((await listAuditEntries(db, { entity: many }, Number.NaN)).page).toBe(1);
  });

  it("says one page and no entries when nothing matches", async () => {
    expect(await list({ record: "nobody" })).toMatchObject({ total: 0, pages: 1, page: 1, entries: [] });
  });

  it("offers only the people, actions and kinds that appear in the log", async () => {
    const options = await loadAuditFilterOptions(db);
    expect(options.actors.map((a) => a.id)).toEqual(expect.arrayContaining([ana, ben]));
    expect(options.actions).toEqual(expect.arrayContaining(["thing.create", "thing.update", "thing.seed", "thing.delete"]));
    expect(options.entities).toContain(entity);
    expect(options.hasSystem).toBe(true);
    // Ordered by name: Ana comes before Ben.
    const order = options.actors.map((a) => a.id);
    expect(order.indexOf(ana)).toBeLessThan(order.indexOf(ben));
  });
});
