import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { rawPunches } from "@/db/schema";
import { savePunches } from "@/lib/adms/store";
import { adaptAttlogBody, type StandardPunch } from "@/lib/adms/zkteco-adapter";
import { and, eq, sql } from "drizzle-orm";

import { addTestDevice, connect, testDatabaseUrl, uniqueCode, uniqueSerial, type TestDb } from "./helpers";

describe.skipIf(!testDatabaseUrl)("punch storage", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;

  beforeAll(() => {
    ({ db, close } = connect());
  });
  afterAll(() => close());

  function punch(deviceSn: string, empCode: string, iso: string): StandardPunch {
    return {
      deviceSn,
      empCode,
      punchedAt: new Date(iso),
      statusCode: 0,
      verifyCode: 15,
      rawLine: `${empCode}\t${iso}\t0\t15`,
    };
  }

  async function countFor(deviceSn: string) {
    const rows = await db.select({ id: rawPunches.id }).from(rawPunches).where(eq(rawPunches.deviceSn, deviceSn));
    return rows.length;
  }

  it("stores a batch once and ignores a resent batch", async () => {
    const sn = uniqueSerial();
    await addTestDevice(db, sn);
    const code = uniqueCode();
    const batch = [
      punch(sn, code, "2026-10-24T03:00:00Z"),
      punch(sn, code, "2026-10-24T12:00:00Z"),
      punch(sn, uniqueCode(), "2026-10-24T03:05:00Z"),
    ];

    expect(await savePunches(db, batch)).toEqual({ received: 3, inserted: 3 });
    expect(await savePunches(db, batch)).toEqual({ received: 3, inserted: 0 });
    expect(await countFor(sn)).toBe(3);
  });

  it("stores only the new punches when a batch partly overlaps", async () => {
    const sn = uniqueSerial();
    await addTestDevice(db, sn);
    const code = uniqueCode();
    await savePunches(db, [punch(sn, code, "2026-10-24T03:00:00Z"), punch(sn, code, "2026-10-24T12:00:00Z")]);

    const result = await savePunches(db, [
      punch(sn, code, "2026-10-24T12:00:00Z"),
      punch(sn, code, "2026-10-25T03:00:00Z"),
    ]);
    expect(result).toEqual({ received: 2, inserted: 1 });
    expect(await countFor(sn)).toBe(3);
  });

  it("counts a punch repeated inside one batch once", async () => {
    const sn = uniqueSerial();
    await addTestDevice(db, sn);
    const code = uniqueCode();
    const same = punch(sn, code, "2026-10-24T03:00:00Z");
    expect(await savePunches(db, [same, { ...same, rawLine: "second copy" }])).toEqual({ received: 2, inserted: 1 });
    expect(await countFor(sn)).toBe(1);
  });

  it("keeps the same code and time from two different devices", async () => {
    const a = uniqueSerial();
    const b = uniqueSerial();
    await addTestDevice(db, a);
    await addTestDevice(db, b);
    const code = uniqueCode();
    const result = await savePunches(db, [
      punch(a, code, "2026-10-24T03:00:00Z"),
      punch(b, code, "2026-10-24T03:00:00Z"),
    ]);
    expect(result.inserted).toBe(2);
  });

  it("stores a batch larger than one insert, and a resend of it adds nothing", async () => {
    const sn = uniqueSerial();
    await addTestDevice(db, sn);
    const codes = Array.from({ length: 60 }, () => uniqueCode());
    const body = codes
      .flatMap((code, i) =>
        Array.from({ length: 20 }, (_, n) => `${code}\t2026-10-24 ${String(9 + (n % 8)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:${String(n).padStart(2, "0")}\t0\t1`),
      )
      .join("\r\n");
    const { punches, skipped } = adaptAttlogBody(sn, body);
    expect(skipped).toBe(0);
    expect(punches).toHaveLength(1200);

    expect((await savePunches(db, punches)).inserted).toBe(1200);
    expect((await savePunches(db, punches)).inserted).toBe(0);
    expect(await countFor(sn)).toBe(1200);
  });

  it("keeps a punch from an employee code nobody has", async () => {
    const sn = uniqueSerial();
    await addTestDevice(db, sn);
    const code = uniqueCode();
    expect((await savePunches(db, [punch(sn, code, "2026-10-24T03:00:00Z")])).inserted).toBe(1);
  });

  it("stores the time as the exact instant and keeps the raw line", async () => {
    const sn = uniqueSerial();
    await addTestDevice(db, sn);
    const code = uniqueCode();
    const { punches } = adaptAttlogBody(sn, `${code}\t2026-10-24 09:00:00\t1\t15\t0\t0\t0\r\n`);
    await savePunches(db, punches);
    const [row] = await db.select().from(rawPunches).where(and(eq(rawPunches.deviceSn, sn), eq(rawPunches.empCode, code)));
    expect(row.punchedAt.toISOString()).toBe("2026-10-24T03:00:00.000Z");
    expect(row.statusCode).toBe(1);
    expect(row.verifyCode).toBe(15);
    expect(row.rawLine).toBe(`${code}\t2026-10-24 09:00:00\t1\t15\t0\t0\t0`);
  });

  it("refuses a punch from a device that is not registered", async () => {
    await expect(savePunches(db, [punch(uniqueSerial("NOPE"), uniqueCode(), "2026-10-24T03:00:00Z")])).rejects.toThrow();
  });
});

/** Runs a query that must fail and returns every message in the error chain. Drizzle wraps the database's own message. */
async function refusal(query: PromiseLike<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    const messages: string[] = [];
    for (let e: unknown = error; e instanceof Error; e = e.cause) messages.push(e.message);
    return messages.join(" | ");
  }
  return "";
}

describe.skipIf(!testDatabaseUrl)("the punch log is append-only", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;

  beforeAll(() => {
    ({ db, close } = connect());
  });
  afterAll(() => close());

  it("refuses to update, delete or empty the table", async () => {
    const sn = uniqueSerial();
    await addTestDevice(db, sn);
    const code = uniqueCode();
    await savePunches(db, [
      { deviceSn: sn, empCode: code, punchedAt: new Date("2026-10-24T03:00:00Z"), statusCode: 0, verifyCode: 1, rawLine: "x" },
    ]);

    expect(await refusal(db.update(rawPunches).set({ empCode: "1" }).where(eq(rawPunches.deviceSn, sn)))).toMatch(/append-only: UPDATE/);
    expect(await refusal(db.delete(rawPunches).where(eq(rawPunches.deviceSn, sn)))).toMatch(/append-only: DELETE/);
    expect(await refusal(db.execute(sql`truncate table raw_punches`))).toMatch(/append-only: TRUNCATE/);

    const rows = await db.select().from(rawPunches).where(eq(rawPunches.deviceSn, sn));
    expect(rows).toHaveLength(1);
    expect(rows[0].empCode).toBe(code);
  });
});
