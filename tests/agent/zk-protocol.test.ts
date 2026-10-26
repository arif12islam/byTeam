import { describe, expect, it } from "vitest";

import {
  checksum,
  CMD,
  decodeOption,
  decodePunches,
  decodeSizes,
  decodeUsers,
  decodeZkTime,
  encodePacket,
  encodeUser,
  encodeZkTime,
  FIRST_REPLY_ID,
  formatZkTime,
  FrameReader,
  makeCommKey,
  prepareBufferRequest,
  type ZkUser,
} from "../../agent/src/zk-protocol";

describe("packets", () => {
  it("builds the connect packet byte for byte as real clients send it", () => {
    const { bytes, replyId } = encodePacket(CMD.CONNECT, 0, FIRST_REPLY_ID);
    expect(bytes.toString("hex")).toBe("5050827d08000000e80317fc00000000");
    expect(replyId).toBe(0);
  });

  it("counts reply ids up and wraps them", () => {
    expect(encodePacket(CMD.GET_TIME, 7, 5).replyId).toBe(6);
    expect(encodePacket(CMD.GET_TIME, 7, 65533).replyId).toBe(65534);
    expect(encodePacket(CMD.GET_TIME, 7, 65534).replyId).toBe(0);
  });

  it("checksums an odd number of bytes", () => {
    expect(checksum(Buffer.from([1, 0, 1]))).toBe((~2 + 65535) & 0xffff);
  });

  it("reads packets that arrive in pieces and several at once", () => {
    const a = encodePacket(CMD.ACK_OK, 9, 1, Buffer.from("hello")).bytes;
    const b = encodePacket(CMD.DATA, 9, 2, Buffer.alloc(3000, 7)).bytes;
    const reader = new FrameReader();
    const all = Buffer.concat([a, b]);
    const frames = [];
    for (let i = 0; i < all.length; i += 5) {
      reader.push(all.subarray(i, i + 5));
      for (let f = reader.next(); f; f = reader.next()) frames.push(f);
    }
    expect(frames.map((f) => [f.command, f.sessionId, f.data.length])).toEqual([
      [CMD.ACK_OK, 9, 5],
      [CMD.DATA, 9, 3000],
    ]);
    expect(frames[0].data.toString()).toBe("hello");
  });

  it("refuses a stream that is out of step", () => {
    const reader = new FrameReader();
    reader.push(Buffer.from("HTTP/1.1 400 Bad"));
    expect(() => reader.next()).toThrow(/unexpected format/);
  });

  it("asks for a big read in the device's layout", () => {
    expect(prepareBufferRequest(CMD.USERTEMP_RRQ, 5).toString("hex")).toBe("01090005000000" + "00000000");
  });
});

describe("time", () => {
  it("encodes the way the device counts, months of 31 days", () => {
    const t = { year: 2026, month: 10, day: 25, hour: 9, minute: 16, second: 5 };
    expect(encodeZkTime(t)).toBe(((26 * 12 * 31 + 9 * 31 + 24) * 86400) + (9 * 60 + 16) * 60 + 5);
    expect(decodeZkTime(encodeZkTime(t))).toEqual(t);
    expect(formatZkTime(t)).toBe("2026-10-25 09:16:05");
  });

  it("round trips the last second of a year", () => {
    const t = { year: 2026, month: 12, day: 31, hour: 23, minute: 59, second: 59 };
    expect(decodeZkTime(encodeZkTime(t))).toEqual(t);
  });
});

describe("comm key", () => {
  it("answers the login challenge as the device expects", () => {
    expect(makeCommKey(0, 0).toString("hex")).toBe("617d3279");
    expect(makeCommKey(123456, 0x1234)).toHaveLength(4);
    // The algorithm drops the lowest byte of the sum, so sessions that differ higher up give different keys.
    expect(makeCommKey(123456, 0x1234).equals(makeCommKey(123456, 0x2234))).toBe(false);
    expect(makeCommKey(1, 0).equals(makeCommKey(2, 0))).toBe(false);
  });
});

const anwar: ZkUser = { uid: 3, userId: "1001", name: "Anwar Hossain", privilege: 0, password: "", card: 0, groupId: "1" };
const admin: ZkUser = { uid: 1, userId: "1", name: "Office admin", privilege: 14, password: "123", card: 4455, groupId: "1" };

function withSize(records: Buffer[]): Buffer {
  const body = Buffer.concat(records);
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length, 0);
  return Buffer.concat([head, body]);
}

describe("users", () => {
  it("writes and reads the 72 byte layout of newer firmware", () => {
    const record = encodeUser(admin, 72);
    expect(record).toHaveLength(72);
    expect(record.readUInt16LE(0)).toBe(1);
    expect(record.readUInt8(2)).toBe(14);
    expect(record.subarray(48, 52).toString()).toBe("1\0\0\0");
    const { users, recordSize } = decodeUsers(withSize([encodeUser(admin, 72), encodeUser(anwar, 72)]), 2);
    expect(recordSize).toBe(72);
    expect(users).toEqual([admin, anwar]);
  });

  it("writes and reads the 28 byte layout of older firmware", () => {
    const { users, recordSize } = decodeUsers(withSize([encodeUser(anwar, 28)]), 1);
    expect(recordSize).toBe(28);
    // That layout keeps 8 bytes of name.
    expect(users).toEqual([{ ...anwar, name: "Anwar Ho" }]);
  });

  it("refuses a letter in a user ID on firmware that only keeps numbers", () => {
    expect(() => encodeUser({ ...anwar, userId: "A12" }, 28)).toThrow(/only takes numbers/);
  });

  it("cuts a long name on a whole character", () => {
    const record = encodeUser({ ...anwar, name: "আনোয়ার হোসেন খান চৌধুরী" }, 72);
    const name = record.subarray(11, 35);
    expect(() => new TextDecoder("utf-8", { fatal: true }).decode(name.subarray(0, name.indexOf(0) === -1 ? 24 : name.indexOf(0)))).not.toThrow();
  });

  it("is empty when the device has no users", () => {
    expect(decodeUsers(Buffer.alloc(0), 0).users).toEqual([]);
  });
});

describe("punches", () => {
  const time = { year: 2026, month: 10, day: 26, hour: 8, minute: 55, second: 12 };

  it("reads the 40 byte records of newer firmware", () => {
    const r = Buffer.alloc(40);
    r.writeUInt16LE(3, 0);
    r.write("1001", 2);
    r.writeUInt8(1, 26);
    r.writeUInt32LE(encodeZkTime(time), 27);
    r.writeUInt8(0, 31);
    expect(decodePunches(withSize([r]), 1, [])).toEqual([{ userId: "1001", time, verify: 1, state: 0 }]);
  });

  it("reads 16 byte records, which carry the ID as a number", () => {
    const r = Buffer.alloc(16);
    r.writeUInt32LE(1001, 0);
    r.writeUInt32LE(encodeZkTime(time), 4);
    r.writeUInt8(15, 8);
    r.writeUInt8(1, 9);
    expect(decodePunches(withSize([r]), 1, [])).toEqual([{ userId: "1001", time, verify: 15, state: 1 }]);
  });

  it("reads 8 byte records, finding the ID from the user's slot", () => {
    const r = Buffer.alloc(8);
    r.writeUInt16LE(3, 0);
    r.writeUInt8(1, 2);
    r.writeUInt32LE(encodeZkTime(time), 3);
    r.writeUInt8(0, 7);
    expect(decodePunches(withSize([r]), 1, [anwar])).toEqual([{ userId: "1001", time, verify: 1, state: 0 }]);
  });
});

describe("device info", () => {
  it("reads the counts from the sizes reply", () => {
    const data = Buffer.alloc(80);
    data.writeInt32LE(16, 16);
    data.writeInt32LE(4, 24);
    data.writeInt32LE(5321, 32);
    expect(decodeSizes(data)).toEqual({ users: 16, fingers: 4, records: 5321 });
    expect(() => decodeSizes(Buffer.alloc(10))).toThrow();
  });

  it("reads an option value", () => {
    expect(decodeOption(Buffer.from("~SerialNumber=5275220900056\0", "ascii"), "~SerialNumber")).toBe("5275220900056");
    expect(decodeOption(Buffer.from("other\0"), "~SerialNumber")).toBeNull();
  });
});
