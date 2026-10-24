import { describe, expect, it } from "vitest";

import { audit, toAuditJson, type AuditWriter } from "@/lib/audit";

describe("toAuditJson", () => {
  it("turns dates into ISO strings", () => {
    expect(toAuditJson({ at: new Date("2026-10-24T06:00:00Z") })).toEqual({
      at: "2026-10-24T06:00:00.000Z",
    });
  });

  it("drops undefined keys and keeps nulls", () => {
    expect(toAuditJson({ a: undefined, b: null, c: 0, d: false })).toEqual({
      b: null,
      c: 0,
      d: false,
    });
  });

  it("walks nested objects and arrays", () => {
    expect(toAuditJson({ days: [1, 5], shift: { name: "Day", grace: 10 } })).toEqual({
      days: [1, 5],
      shift: { name: "Day", grace: 10 },
    });
  });

  it("redacts secrets at any depth", () => {
    expect(
      toAuditJson({ email: "a@b.c", password: "x", account: { passwordHash: "y", accessToken: "z" } }),
    ).toEqual({
      email: "a@b.c",
      password: "[redacted]",
      account: { passwordHash: "[redacted]", accessToken: "[redacted]" },
    });
  });

  it("stringifies bigint", () => {
    expect(toAuditJson({ n: BigInt(5) })).toEqual({ n: "5" });
  });
});

describe("audit", () => {
  function fakeWriter() {
    const rows: unknown[] = [];
    const writer = {
      insert: () => ({
        values: async (row: unknown) => {
          rows.push(row);
        },
      }),
    } as unknown as AuditWriter;
    return { writer, rows };
  }

  it("writes the entry with before and after as clean JSON", async () => {
    const { writer, rows } = fakeWriter();
    await audit(writer, {
      actorId: "u1",
      action: "shift.update",
      entity: "shift",
      entityId: "s1",
      before: { graceMinutes: 5 },
      after: { graceMinutes: 10, updatedAt: new Date("2026-10-24T06:00:00Z") },
    });
    expect(rows).toEqual([
      {
        actorId: "u1",
        action: "shift.update",
        entity: "shift",
        entityId: "s1",
        before: { graceMinutes: 5 },
        after: { graceMinutes: 10, updatedAt: "2026-10-24T06:00:00.000Z" },
      },
    ]);
  });

  it("stores null for a missing before or after", async () => {
    const { writer, rows } = fakeWriter();
    await audit(writer, { actorId: null, action: "user.create", entity: "user", entityId: "u2" });
    expect(rows[0]).toMatchObject({ actorId: null, before: null, after: null });
  });
});
