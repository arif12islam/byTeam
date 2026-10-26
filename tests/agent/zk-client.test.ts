import { afterEach, describe, expect, it } from "vitest";

import { ZkClient } from "../../agent/src/zk-client";
import type { ZkPunch, ZkUser } from "../../agent/src/zk-protocol";

import { startFakeDevice, type FakeDevice, type FakeDeviceOptions } from "./fake-device";

const users: ZkUser[] = [
  { uid: 1, userId: "1", name: "Office admin", privilege: 14, password: "123", card: 0, groupId: "1" },
  { uid: 2, userId: "1001", name: "Anwar Hossain", privilege: 0, password: "", card: 0, groupId: "1" },
];

const at = (day: number, hour: number, minute: number) => ({ year: 2026, month: 10, day, hour, minute, second: 0 });
const punches: ZkPunch[] = [
  { userId: "1001", time: at(25, 8, 52), verify: 1, state: 0 },
  { userId: "1001", time: at(25, 18, 4), verify: 1, state: 1 },
];

let device: FakeDevice | null = null;
afterEach(async () => {
  await device?.close();
  device = null;
});

async function connectTo(options: FakeDeviceOptions = {}, commKey = 0) {
  device = await startFakeDevice({ users, punches, ...options });
  const client = new ZkClient({ host: "127.0.0.1", port: device.port, commKey, timeoutMs: 2000 });
  await client.connect();
  return client;
}

describe("ZkClient against a pretend device", () => {
  for (const [label, options] of [
    ["answers in one packet", {}],
    ["answers in pieces", { chunked: true }],
    ["answers a few bytes at a time", { chunked: true, dribble: true }],
    ["keeps older 28 and 16 byte records", { userRecordSize: 28, punchRecordSize: 16 }],
    ["keeps the oldest 8 byte punch records", { punchRecordSize: 8 }],
  ] as const) {
    it(`reads serial, users and punches from a device that ${label}`, async () => {
      const client = await connectTo(options);
      expect(await client.serialNumber()).toBe("5275220900056");
      expect(await client.sizes()).toMatchObject({ users: 2, records: 2 });
      const read = await client.users();
      expect(read.map((u) => [u.uid, u.userId, u.privilege])).toEqual([
        [1, "1", 14],
        [2, "1001", 0],
      ]);
      expect(await client.punches(read)).toEqual(punches);
      await client.disconnect();
    });
  }

  it("reads a large log that needs several pieces", async () => {
    const many: ZkPunch[] = Array.from({ length: 2500 }, (_, i) => ({
      userId: String(1000 + (i % 20)),
      time: { year: 2026, month: 1 + (i % 12), day: 1 + (i % 28), hour: 8, minute: i % 60, second: 0 },
      verify: 1,
      state: 0,
    }));
    const client = await connectTo({ punches: many, chunked: true });
    const read = await client.punches(await client.users());
    expect(read).toHaveLength(2500);
    expect(read[2499]).toEqual(many[2499]);
    await client.disconnect();
  });

  it("adds a new user and updates one in place", async () => {
    const client = await connectTo();
    await client.users();
    await client.writeUser({ uid: 3, userId: "1002", name: "Farhana Akter", privilege: 0, password: "", card: 0, groupId: "" });
    await client.writeUser({ ...users[1], name: "Anwar H." });
    const after = await client.users();
    expect(after.find((u) => u.userId === "1002")?.name).toBe("Farhana Akter");
    expect(after.find((u) => u.userId === "1001")?.name).toBe("Anwar H.");
    expect(after).toHaveLength(3);
    await client.disconnect();
  });

  it("reads and sets the clock", async () => {
    const client = await connectTo({ time: at(26, 9, 30) });
    expect(await client.time()).toEqual(at(26, 9, 30));
    await client.setTime(at(26, 9, 45));
    expect(device?.state.time).toEqual(at(26, 9, 45));
    await client.disconnect();
  });

  it("logs in with the comm key when the device asks for one", async () => {
    const client = await connectTo({ commKey: 4321 }, 4321);
    expect(await client.serialNumber()).toBe("5275220900056");
    await client.disconnect();
  });

  it("says so when the comm key is wrong", async () => {
    device = await startFakeDevice({ commKey: 4321 });
    const client = new ZkClient({ host: "127.0.0.1", port: device.port, commKey: 1, timeoutMs: 2000 });
    await expect(client.connect()).rejects.toThrow(/comm key/);
  });

  it("explains when nothing answers at that address", async () => {
    device = await startFakeDevice();
    const port = device.port;
    await device.close();
    device = null;
    const client = new ZkClient({ host: "127.0.0.1", port, commKey: 0, timeoutMs: 1000 });
    await expect(client.connect()).rejects.toThrow(/Cannot reach the device|No answer from the device/);
  });
});
