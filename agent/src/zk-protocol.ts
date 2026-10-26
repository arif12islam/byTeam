/**
 * The ZKTeco "standalone" protocol, spoken over TCP port 4370 by devices that
 * cannot push (like the K40H). The office agent is the client: it connects to
 * the device, reads users and punches, writes users and sets the clock.
 *
 * Everything here is pure: building packets, reading frames, and turning the
 * device's binary records into values. The byte layouts follow the widely used
 * open implementations of this protocol (pyzk), including the size checks that
 * tell older 8 and 16 byte punch records and 28 byte user records from the
 * 40 and 72 byte ones newer firmware uses.
 */

export const CMD = {
  CONNECT: 1000,
  EXIT: 1001,
  ENABLE_DEVICE: 1002,
  DISABLE_DEVICE: 1003,
  AUTH: 1102,
  ACK_OK: 2000,
  ACK_ERROR: 2001,
  ACK_DATA: 2002,
  ACK_UNAUTH: 2005,
  PREPARE_DATA: 1500,
  DATA: 1501,
  FREE_DATA: 1502,
  PREPARE_BUFFER: 1503,
  READ_BUFFER: 1504,
  GET_FREE_SIZES: 50,
  ATTLOG_RRQ: 13,
  USERTEMP_RRQ: 9,
  USER_WRQ: 8,
  OPTIONS_RRQ: 11,
  GET_TIME: 201,
  SET_TIME: 202,
  REFRESH_DATA: 1013,
} as const;

/** Which table CMD_USERTEMP_RRQ reads: the users. */
export const FCT_USER = 5;

/** The largest piece of a big read the device is asked for at once. */
export const MAX_CHUNK = 0xffc0;

const USHRT_MAX = 65535;
const MAGIC_1 = 0x5050;
const MAGIC_2 = 0x7d82;

/** The reply id a session starts from. The first packet then carries 0. */
export const FIRST_REPLY_ID = USHRT_MAX - 1;

/** The device's 16 bit checksum over a packet whose checksum field is still 0. */
export function checksum(bytes: Uint8Array): number {
  let sum = 0;
  let i = 0;
  for (; i + 1 < bytes.length; i += 2) {
    sum += bytes[i] | (bytes[i + 1] << 8);
    if (sum > USHRT_MAX) sum -= USHRT_MAX;
  }
  if (i < bytes.length) sum += bytes[bytes.length - 1];
  while (sum > USHRT_MAX) sum -= USHRT_MAX;
  sum = ~sum;
  while (sum < 0) sum += USHRT_MAX;
  return sum & 0xffff;
}

/**
 * One packet ready to send, wrapped for TCP. The checksum is taken with the
 * current reply id and the header carries the next one, as the device expects.
 */
export function encodePacket(
  command: number,
  sessionId: number,
  replyId: number,
  data: Uint8Array = new Uint8Array(),
): { bytes: Buffer; replyId: number } {
  const body = Buffer.from(data);
  const unsigned = Buffer.alloc(8);
  unsigned.writeUInt16LE(command, 0);
  unsigned.writeUInt16LE(0, 2);
  unsigned.writeUInt16LE(sessionId, 4);
  unsigned.writeUInt16LE(replyId, 6);
  const sum = checksum(Buffer.concat([unsigned, body]));

  let next = replyId + 1;
  if (next >= USHRT_MAX) next -= USHRT_MAX;

  const header = Buffer.alloc(8);
  header.writeUInt16LE(command, 0);
  header.writeUInt16LE(sum, 2);
  header.writeUInt16LE(sessionId, 4);
  header.writeUInt16LE(next, 6);

  const top = Buffer.alloc(8);
  top.writeUInt16LE(MAGIC_1, 0);
  top.writeUInt16LE(MAGIC_2, 2);
  top.writeUInt32LE(header.length + body.length, 4);
  return { bytes: Buffer.concat([top, header, body]), replyId: next };
}

export type Frame = { command: number; checksum: number; sessionId: number; replyId: number; data: Buffer };

/**
 * Splits the TCP byte stream into packets. Bytes arrive in pieces of any size,
 * so they are kept until a whole packet is there. Throws when the stream does
 * not start with the protocol's marker, which means it is out of step.
 */
export class FrameReader {
  private buffer = Buffer.alloc(0);

  push(chunk: Uint8Array): void {
    this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)]);
  }

  next(): Frame | null {
    if (this.buffer.length < 8) return null;
    if (this.buffer.readUInt16LE(0) !== MAGIC_1 || this.buffer.readUInt16LE(2) !== MAGIC_2) {
      throw new Error("The device sent data in an unexpected format.");
    }
    const length = this.buffer.readUInt32LE(4);
    if (length < 8) throw new Error("The device sent a packet that is too short.");
    if (this.buffer.length < 8 + length) return null;

    const packet = this.buffer.subarray(8, 8 + length);
    this.buffer = this.buffer.subarray(8 + length);
    return {
      command: packet.readUInt16LE(0),
      checksum: packet.readUInt16LE(2),
      sessionId: packet.readUInt16LE(4),
      replyId: packet.readUInt16LE(6),
      data: Buffer.from(packet.subarray(8)),
    };
  }
}

/** A wall clock time on the device, which keeps local office time with no time zone. */
export type ZkTime = { year: number; month: number; day: number; hour: number; minute: number; second: number };

/** The device packs a time into one number, counting months as 31 days. */
export function decodeZkTime(value: number): ZkTime {
  let t = value;
  const second = t % 60;
  t = Math.floor(t / 60);
  const minute = t % 60;
  t = Math.floor(t / 60);
  const hour = t % 24;
  t = Math.floor(t / 24);
  const day = (t % 31) + 1;
  t = Math.floor(t / 31);
  const month = (t % 12) + 1;
  t = Math.floor(t / 12);
  return { year: t + 2000, month, day, hour, minute, second };
}

export function encodeZkTime(time: ZkTime): number {
  return (
    ((time.year % 100) * 12 * 31 + (time.month - 1) * 31 + time.day - 1) * 86400 +
    (time.hour * 60 + time.minute) * 60 +
    time.second
  );
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** "2026-10-25 09:16:00", the form punches are sent to byTeam in. */
export function formatZkTime(time: ZkTime): string {
  return `${pad(time.year, 4)}-${pad(time.month)}-${pad(time.day)} ${pad(time.hour)}:${pad(time.minute)}:${pad(time.second)}`;
}

/**
 * The answer to the device's login challenge, made from the comm key set on
 * the device (Menu, Comm., PC Connection) and the session id it gave.
 */
export function makeCommKey(key: number, sessionId: number, ticks = 50): Buffer {
  let k = 0;
  for (let i = 0; i < 32; i += 1) {
    k = key & (1 << i) ? ((k << 1) | 1) >>> 0 : (k << 1) >>> 0;
  }
  k = (k + sessionId) >>> 0;

  const b = Buffer.alloc(4);
  b.writeUInt32LE(k, 0);
  const x = Buffer.from([b[0] ^ 0x5a, b[1] ^ 0x4b, b[2] ^ 0x53, b[3] ^ 0x4f]); // "ZKSO"
  const swapped = Buffer.from([x[2], x[3], x[0], x[1]]);
  const t = ticks & 0xff;
  return Buffer.from([swapped[0] ^ t, swapped[1] ^ t, t, swapped[3] ^ t]);
}

/** What CMD_GET_FREE_SIZES says is stored on the device. */
export type ZkSizes = { users: number; fingers: number; records: number };

export function decodeSizes(data: Buffer): ZkSizes {
  if (data.length < 80) throw new Error("The device did not report how much it holds.");
  return { users: data.readInt32LE(16), fingers: data.readInt32LE(24), records: data.readInt32LE(32) };
}

/** The request that starts a big read, like all punches or all users. */
export function prepareBufferRequest(command: number, fct = 0, ext = 0): Buffer {
  const b = Buffer.alloc(11);
  b.writeInt8(1, 0);
  b.writeInt16LE(command, 1);
  b.writeInt32LE(fct, 3);
  b.writeInt32LE(ext, 7);
  return b;
}

export function readBufferRequest(start: number, size: number): Buffer {
  const b = Buffer.alloc(8);
  b.writeInt32LE(start, 0);
  b.writeInt32LE(size, 4);
  return b;
}

/** Text from a fixed width field: up to the first zero byte, without stray spaces. */
function fixedText(bytes: Buffer): string {
  const end = bytes.indexOf(0);
  return (end === -1 ? bytes : bytes.subarray(0, end)).toString("utf8").trim();
}

export type ZkUser = {
  /** The device's own slot number for the user. */
  uid: number;
  /** The user ID typed on the device, which byTeam uses as the employee code. */
  userId: string;
  name: string;
  privilege: number;
  password: string;
  card: number;
  groupId: string;
};

/** The whole user table as read from the device. The first 4 bytes give its size. */
export function decodeUsers(data: Buffer, count: number): { users: ZkUser[]; recordSize: number } {
  if (count <= 0 || data.length < 4) return { users: [], recordSize: 72 };
  const total = data.readUInt32LE(0);
  const recordSize = Math.floor(total / count);
  const body = data.subarray(4);
  const users: ZkUser[] = [];

  for (let at = 0; at + recordSize <= body.length && users.length < count; at += recordSize) {
    const r = body.subarray(at, at + recordSize);
    if (recordSize === 28) {
      users.push({
        uid: r.readUInt16LE(0),
        privilege: r.readUInt8(2),
        password: fixedText(r.subarray(3, 8)),
        name: fixedText(r.subarray(8, 16)),
        card: r.readUInt32LE(16),
        groupId: String(r.readUInt8(21)),
        userId: String(r.readUInt32LE(24)),
      });
    } else if (recordSize >= 72) {
      users.push({
        uid: r.readUInt16LE(0),
        privilege: r.readUInt8(2),
        password: fixedText(r.subarray(3, 11)),
        name: fixedText(r.subarray(11, 35)),
        card: r.readUInt32LE(35),
        groupId: fixedText(r.subarray(40, 47)),
        userId: fixedText(r.subarray(48, 72)),
      });
    } else {
      throw new Error(`The device keeps users in a format the agent does not know (${recordSize} bytes each).`);
    }
  }
  return { users, recordSize };
}

/** Text written into a fixed width field, cut on a whole character so nothing is half written. */
function fixedField(text: string, width: number): Buffer {
  const out = Buffer.alloc(width);
  let used = 0;
  for (const ch of text) {
    const bytes = Buffer.from(ch, "utf8");
    if (used + bytes.length > width) break;
    bytes.copy(out, used);
    used += bytes.length;
  }
  return out;
}

/** One user to write with CMD_USER_WRQ, in the layout the device reads them in. */
export function encodeUser(user: ZkUser, recordSize: number): Buffer {
  if (recordSize === 28) {
    if (!/^\d{1,9}$/.test(user.userId)) throw new Error(`This device only takes numbers as user IDs, not "${user.userId}".`);
    const b = Buffer.alloc(28);
    b.writeUInt16LE(user.uid, 0);
    b.writeUInt8(user.privilege, 2);
    fixedField(user.password, 5).copy(b, 3);
    fixedField(user.name, 8).copy(b, 8);
    b.writeUInt32LE(user.card >>> 0, 16);
    b.writeUInt8(Number(user.groupId) || 0, 21);
    b.writeUInt16LE(0, 22);
    b.writeUInt32LE(Number(user.userId), 24);
    return b;
  }
  const b = Buffer.alloc(72);
  b.writeUInt16LE(user.uid, 0);
  b.writeUInt8(user.privilege, 2);
  fixedField(user.password, 8).copy(b, 3);
  fixedField(user.name, 24).copy(b, 11);
  b.writeUInt32LE(user.card >>> 0, 35);
  fixedField(user.groupId, 7).copy(b, 40);
  fixedField(user.userId, 24).copy(b, 48);
  return b;
}

export type ZkPunch = {
  userId: string;
  time: ZkTime;
  /** How the person was verified (fingerprint, card, password). */
  verify: number;
  /** The punch state chosen on the device (check in, check out). */
  state: number;
};

/**
 * The whole punch log as read from the device. Older firmware keeps 8 byte
 * records that name the user by slot, so `users` is needed to find their ID.
 */
export function decodePunches(data: Buffer, count: number, users: readonly ZkUser[]): ZkPunch[] {
  if (count <= 0 || data.length < 4) return [];
  const total = data.readUInt32LE(0);
  const recordSize = Math.floor(total / count);
  const body = data.subarray(4);
  const byUid = new Map(users.map((u) => [u.uid, u.userId]));
  const punches: ZkPunch[] = [];

  for (let at = 0; at + recordSize <= body.length && punches.length < count; at += recordSize) {
    const r = body.subarray(at, at + recordSize);
    if (recordSize === 8) {
      const uid = r.readUInt16LE(0);
      punches.push({ userId: byUid.get(uid) ?? String(uid), verify: r.readUInt8(2), time: decodeZkTime(r.readUInt32LE(3)), state: r.readUInt8(7) });
    } else if (recordSize === 16) {
      punches.push({ userId: String(r.readUInt32LE(0)), time: decodeZkTime(r.readUInt32LE(4)), verify: r.readUInt8(8), state: r.readUInt8(9) });
    } else if (recordSize >= 40) {
      punches.push({ userId: fixedText(r.subarray(2, 26)), verify: r.readUInt8(26), time: decodeZkTime(r.readUInt32LE(27)), state: r.readUInt8(31) });
    } else {
      throw new Error(`The device keeps punches in a format the agent does not know (${recordSize} bytes each).`);
    }
  }
  return punches;
}

/** The value of one device option from a CMD_OPTIONS_RRQ reply, like "~SerialNumber=5275220900056". */
export function decodeOption(data: Buffer, name: string): string | null {
  const text = fixedText(data);
  const prefix = `${name}=`;
  return text.startsWith(prefix) ? text.slice(prefix.length).trim() : null;
}
