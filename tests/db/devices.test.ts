import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { deviceCommands, devices, employees, shifts } from "@/db/schema";
import { MAX_ATTEMPTS, RESEND_AFTER_SECONDS } from "@/lib/adms/commands";
import { savePunches } from "@/lib/adms/store";
import { touchDevice } from "@/lib/devices/receive";
import { claimNextCommand, completeCommand, queueUserUpdate } from "@/lib/devices/queue";
import { listUnmatchedCodes } from "@/lib/punches/unmatched";

import { addTestDevice, connect, testDatabaseUrl, uniqueCode, uniqueSerial, type TestDb } from "./helpers";

describe.skipIf(!testDatabaseUrl)("devices and commands", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;

  beforeAll(() => {
    ({ db, close } = connect());
  });
  afterAll(() => close());

  async function queue(serial: string, ...commands: string[]) {
    return db.insert(deviceCommands).values(commands.map((command) => ({ deviceSn: serial, command }))).returning();
  }

  async function statusOf(id: number) {
    const [row] = await db.select().from(deviceCommands).where(eq(deviceCommands.id, id));
    return row;
  }

  describe("touchDevice", () => {
    it("accepts a registered active device and records the time", async () => {
      const sn = uniqueSerial();
      await addTestDevice(db, sn);
      const now = new Date("2026-10-24T06:00:00Z");
      expect(await touchDevice(db, sn, now)).toMatchObject({ serialNo: sn });
      const [row] = await db.select().from(devices).where(eq(devices.serialNo, sn));
      expect(row.lastSeenAt?.toISOString()).toBe(now.toISOString());
    });

    it("refuses an unknown device", async () => {
      expect(await touchDevice(db, uniqueSerial("NOPE"), new Date())).toBeNull();
    });

    it("refuses a switched-off device and leaves its last seen time alone", async () => {
      const sn = uniqueSerial();
      await addTestDevice(db, sn, false);
      expect(await touchDevice(db, sn, new Date())).toBeNull();
      const [row] = await db.select().from(devices).where(eq(devices.serialNo, sn));
      expect(row.lastSeenAt).toBeNull();
    });
  });

  describe("claimNextCommand", () => {
    it("gives commands oldest first, one at a time, and nothing when empty", async () => {
      const sn = uniqueSerial();
      await addTestDevice(db, sn);
      const [first, second] = await queue(sn, "FIRST", "SECOND");
      const now = new Date();

      expect(await claimNextCommand(db, sn, now)).toEqual({ id: first.id, command: "FIRST" });
      expect(await claimNextCommand(db, sn, now)).toEqual({ id: second.id, command: "SECOND" });
      expect(await claimNextCommand(db, sn, now)).toBeNull();
      expect((await statusOf(first.id)).status).toBe("sent");
    });

    it("never gives a device another device's command", async () => {
      const mine = uniqueSerial();
      const other = uniqueSerial();
      await addTestDevice(db, mine);
      await addTestDevice(db, other);
      await queue(other, "NOT FOR YOU");
      expect(await claimNextCommand(db, mine, new Date())).toBeNull();
    });

    it("gives one command to only one of several polls at the same moment", async () => {
      const sn = uniqueSerial();
      await addTestDevice(db, sn);
      await queue(sn, "A", "B", "C");

      const results = await Promise.all(Array.from({ length: 10 }, () => claimNextCommand(db, sn, new Date())));
      const got = results.filter((r) => r !== null);
      expect(got).toHaveLength(3);
      expect(new Set(got.map((r) => r!.id)).size).toBe(3);
    });

    it("offers an unconfirmed command again after the wait, then gives up after the last try", async () => {
      const sn = uniqueSerial();
      await addTestDevice(db, sn);
      const [cmd] = await queue(sn, "NEVER CONFIRMED");
      const wait = (RESEND_AFTER_SECONDS + 1) * 1000;
      let now = new Date("2026-10-24T06:00:00Z");

      expect(await claimNextCommand(db, sn, now)).not.toBeNull();
      now = new Date(now.getTime() + 60_000);
      expect(await claimNextCommand(db, sn, now)).toBeNull(); // too soon

      for (let attempt = 2; attempt <= MAX_ATTEMPTS; attempt += 1) {
        now = new Date(now.getTime() + wait);
        expect(await claimNextCommand(db, sn, now)).toMatchObject({ id: cmd.id });
        expect((await statusOf(cmd.id)).attempts).toBe(attempt);
      }

      now = new Date(now.getTime() + wait);
      expect(await claimNextCommand(db, sn, now)).toBeNull();
      const settled = await statusOf(cmd.id);
      expect(settled.status).toBe("failed");
      expect(settled.result).toMatch(/No reply/);
    });
  });

  describe("completeCommand", () => {
    it("marks a sent command done for zero or more and failed for a negative code", async () => {
      const sn = uniqueSerial();
      await addTestDevice(db, sn);
      const [a, b, c] = await queue(sn, "A", "B", "C");
      for (let i = 0; i < 3; i += 1) await claimNextCommand(db, sn, new Date());

      expect(await completeCommand(db, sn, { id: a.id, returnCode: 0, cmd: null }, new Date())).toBe(true);
      expect(await completeCommand(db, sn, { id: b.id, returnCode: -1002, cmd: null }, new Date())).toBe(true);
      expect(await completeCommand(db, sn, { id: c.id, returnCode: 7, cmd: null }, new Date())).toBe(true);

      expect(await statusOf(a.id)).toMatchObject({ status: "done", result: "Return=0" });
      expect(await statusOf(b.id)).toMatchObject({ status: "failed", result: "Return=-1002" });
      expect(await statusOf(c.id)).toMatchObject({ status: "done", result: "Return=7" });
    });

    it("ignores a repeat, a command never sent, and another device's command", async () => {
      const mine = uniqueSerial();
      const other = uniqueSerial();
      await addTestDevice(db, mine);
      await addTestDevice(db, other);
      const [sent, notSent] = await queue(mine, "SENT", "NOT SENT YET");
      const [theirs] = await queue(other, "THEIRS");
      await claimNextCommand(db, mine, new Date());
      await claimNextCommand(db, other, new Date());

      expect(await completeCommand(db, mine, { id: sent.id, returnCode: 0, cmd: null }, new Date())).toBe(true);
      expect(await completeCommand(db, mine, { id: sent.id, returnCode: -9, cmd: null }, new Date())).toBe(false);
      expect(await completeCommand(db, mine, { id: notSent.id, returnCode: 0, cmd: null }, new Date())).toBe(false);
      expect(await completeCommand(db, mine, { id: theirs.id, returnCode: 0, cmd: null }, new Date())).toBe(false);

      expect(await statusOf(sent.id)).toMatchObject({ status: "done", result: "Return=0" });
      expect((await statusOf(notSent.id)).status).toBe("pending");
      expect((await statusOf(theirs.id)).status).toBe("sent");
    });
  });

  describe("queueUserUpdate", () => {
    it("queues for active devices only, and not twice while the same command is waiting", async () => {
      const on = uniqueSerial();
      const off = uniqueSerial();
      await addTestDevice(db, on);
      await addTestDevice(db, off, false);
      const person = { empCode: uniqueCode(), name: "Test Person" };

      await queueUserUpdate(db, person);
      await queueUserUpdate(db, person);

      const forOn = await db.select().from(deviceCommands).where(eq(deviceCommands.deviceSn, on));
      const forOff = await db.select().from(deviceCommands).where(eq(deviceCommands.deviceSn, off));
      expect(forOn.filter((c) => c.command.includes(`PIN=${person.empCode}\t`))).toHaveLength(1);
      expect(forOff).toHaveLength(0);
    });
  });
});

describe.skipIf(!testDatabaseUrl)("unmatched punch codes", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;

  beforeAll(() => {
    ({ db, close } = connect());
  });
  afterAll(() => close());

  it("lists a code with no employee, and stops listing it once an employee has it", async () => {
    const sn = uniqueSerial();
    await addTestDevice(db, sn);
    const code = uniqueCode();
    const at = (iso: string) => ({ deviceSn: sn, empCode: code, punchedAt: new Date(iso), statusCode: 0, verifyCode: 1, rawLine: "x" });
    // Far in the future so these are the newest punches: the list shows only the 50 most recent codes, and other
    // tests leave unknown codes behind.
    await savePunches(db, [at("2200-10-24T03:00:00Z"), at("2200-10-24T12:00:00Z"), at("2200-10-25T03:00:00Z")]);

    const listed = (await listUnmatchedCodes(db)).find((u) => u.empCode === code);
    expect(listed).toMatchObject({ punches: 3, devices: [sn] });
    expect(listed?.firstPunchAt.toISOString()).toBe("2200-10-24T03:00:00.000Z");
    expect(listed?.lastPunchAt.toISOString()).toBe("2200-10-25T03:00:00.000Z");

    const [shift] = await db.insert(shifts).values({ name: `Test ${code}`, startTime: "09:00", endTime: "18:00" }).returning();
    await db.insert(employees).values({ empCode: code, name: "Now Known", joinDate: "2026-10-01", shiftId: shift.id });
    expect((await listUnmatchedCodes(db)).find((u) => u.empCode === code)).toBeUndefined();
  });
});
