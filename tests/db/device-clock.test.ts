import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { devices } from "@/db/schema";
import { clockState, recordClockCheck } from "@/lib/devices/clock";
import { listDevices } from "@/lib/devices/devices";

import { addTestDevice, connect, testDatabaseUrl, uniqueSerial, type TestDb } from "./helpers";

describe.skipIf(!testDatabaseUrl)("device clock check", () => {
  let db: TestDb;
  let close: () => Promise<unknown>;
  const at = (iso: string) => new Date(iso);
  const received = at("2026-10-26T04:00:00Z");

  const stored = async (serial: string) => {
    const [row] = await db.select({ offset: devices.clockOffsetSeconds, checkedAt: devices.clockCheckedAt }).from(devices).where(eq(devices.serialNo, serial));
    return row;
  };

  beforeAll(() => {
    ({ db, close } = connect());
  });
  afterAll(() => close());

  it("starts unchecked", async () => {
    const serial = uniqueSerial();
    await addTestDevice(db, serial);
    expect(await stored(serial)).toEqual({ offset: null, checkedAt: null });
    const row = (await listDevices(db)).find((d) => d.serialNo === serial)!;
    expect(clockState(row.clockOffsetSeconds)).toEqual({ kind: "unchecked" });
  });

  it("saves the estimate from a live punch, with when it was checked", async () => {
    const serial = uniqueSerial();
    await addTestDevice(db, serial);
    await recordClockCheck(db, serial, [at("2026-10-26T03:49:00Z")], received);
    expect(await stored(serial)).toEqual({ offset: -660, checkedAt: received });
    const row = (await listDevices(db)).find((d) => d.serialNo === serial)!;
    expect(clockState(row.clockOffsetSeconds)).toEqual({ kind: "drifted", direction: "behind", minutes: 11 });
  });

  it("clears the flag when a later punch shows the clock is right", async () => {
    const serial = uniqueSerial();
    await addTestDevice(db, serial);
    await recordClockCheck(db, serial, [at("2026-10-26T03:40:00Z")], received);
    expect(clockState((await stored(serial)).offset).kind).toBe("drifted");
    await recordClockCheck(db, serial, [at("2026-10-26T04:59:50Z")], at("2026-10-26T05:00:00Z"));
    expect(clockState((await stored(serial)).offset).kind).toBe("ok");
  });

  it("does not take an old backlog for a slow clock, and keeps the earlier estimate", async () => {
    const serial = uniqueSerial();
    await addTestDevice(db, serial);
    await recordClockCheck(db, serial, [at("2026-10-26T03:59:50Z")], received);
    const backlog = Array.from({ length: 50 }, (_, i) => at(`2026-10-25T0${(i % 9) + 1}:00:00Z`));
    await recordClockCheck(db, serial, backlog, at("2026-10-26T06:00:00Z"));
    expect(await stored(serial)).toEqual({ offset: -10, checkedAt: received });
  });

  it("flags a device that is ahead even when it sends a big batch", async () => {
    const serial = uniqueSerial();
    await addTestDevice(db, serial);
    const batch = [...Array.from({ length: 30 }, (_, i) => at(`2026-10-25T0${(i % 9) + 1}:00:00Z`)), at("2026-10-26T04:20:00Z")];
    await recordClockCheck(db, serial, batch, received);
    expect(clockState((await stored(serial)).offset)).toEqual({ kind: "drifted", direction: "ahead", minutes: 20 });
  });

  it("does nothing for an upload with no punches, an unknown serial, and never throws", async () => {
    const serial = uniqueSerial();
    await addTestDevice(db, serial);
    await recordClockCheck(db, serial, [], received);
    expect(await stored(serial)).toEqual({ offset: null, checkedAt: null });
    await expect(recordClockCheck(db, "NOSUCHDEVICE1", [at("2026-10-26T03:00:00Z")], received)).resolves.toBeUndefined();
  });
});
