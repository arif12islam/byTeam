import type { Server } from "./byteam";
import { formatZkTime, type ZkPunch, type ZkSizes, type ZkTime, type ZkUser } from "./zk-protocol";

/** What the agent needs from a device. ZkClient provides it; tests use a fake. */
export type Device = {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  serialNumber(): Promise<string>;
  sizes(): Promise<ZkSizes>;
  users(): Promise<ZkUser[]>;
  punches(users: readonly ZkUser[]): Promise<ZkPunch[]>;
  writeUser(user: ZkUser): Promise<void>;
  time(): Promise<ZkTime>;
  setTime(time: ZkTime): Promise<void>;
};

/** Kept between cycles, and on disk between restarts. */
export type AgentState = {
  /** The newest punch time sent to byTeam, as "YYYY-MM-DD HH:MM:SS" device time. */
  sentUpTo: string | null;
  /** How many punches the device held at the last full read. */
  recordCount: number | null;
  lastFullReadAt: number | null;
  lastHandshakeAt: number | null;
  lastClockCheckAt: number | null;
  serial: string | null;
};

export const EMPTY_STATE: AgentState = {
  sentUpTo: null,
  recordCount: null,
  lastFullReadAt: null,
  lastHandshakeAt: null,
  lastClockCheckAt: null,
  serial: null,
};

const MINUTE = 60_000;
/** Read the whole log again after this long even when the count is unchanged, in case the count misled. */
export const FULL_READ_EVERY_MS = 30 * MINUTE;
export const HANDSHAKE_EVERY_MS = 30 * MINUTE;
export const CLOCK_CHECK_EVERY_MS = 60 * MINUTE;
/** A device clock further off than this is set to office time. */
export const CLOCK_TOLERANCE_SECONDS = 30;
/** Punches up to this long before the newest one already sent are sent again, which byTeam ignores. */
export const RESEND_WINDOW_MS = 24 * 60 * MINUTE;
export const UPLOAD_BATCH = 500;
/** Commands run in one cycle at most; the rest wait for the next one. */
export const MAX_COMMANDS_PER_CYCLE = 25;
/** byTeam reads a negative return code as failed. */
export const RETURN_FAILED = -1;

/** A punch as an ATTLOG line, the same as a push device sends: PIN, time, state, verify method. */
export function punchLine(punch: ZkPunch): string {
  return `${punch.userId}\t${formatZkTime(punch.time)}\t${punch.state}\t${punch.verify}\t0\t0\t0`;
}

/** Device time as milliseconds, for comparing two wall clock times. Not a real instant. */
function wallMs(time: ZkTime): number {
  return Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute, time.second);
}

function wallText(ms: number): string {
  const d = new Date(ms);
  return formatZkTime({
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  });
}

/** The punches still to send: everything on the first run, then those from shortly before the last sent one. */
export function punchesToSend(punches: readonly ZkPunch[], sentUpTo: string | null): ZkPunch[] {
  const sorted = [...punches].sort((a, b) => wallMs(a.time) - wallMs(b.time));
  if (sentUpTo === null) return sorted;
  const [date, clock] = sentUpTo.split(" ");
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi, s] = clock.split(":").map(Number);
  const cutoff = wallText(Date.UTC(y, mo - 1, d, h, mi, s) - RESEND_WINDOW_MS);
  return sorted.filter((p) => formatZkTime(p.time) >= cutoff);
}

/** The next free slot number on the device for a new user. */
export function nextUid(users: readonly ZkUser[]): number {
  return users.reduce((max, u) => Math.max(max, u.uid), 0) + 1;
}

/**
 * The user to write for a byTeam command. A person already on the device keeps
 * their slot, privilege, password and card: only the name changes, so a device
 * admin is never made an ordinary user by mistake.
 */
export function userForCommand(users: readonly ZkUser[], pin: string, name: string, privilege: number): ZkUser {
  const existing = users.find((u) => u.userId === pin);
  if (existing) return { ...existing, name };
  return { uid: nextUid(users), userId: pin, name, privilege, password: "", card: 0, groupId: "" };
}

export type Log = (message: string) => void;

export type CycleInput = {
  device: Device;
  server: Server;
  state: AgentState;
  /** The current instant and the office wall clock at that instant. */
  now: number;
  officeNow: () => ZkTime;
  log: Log;
};

/**
 * One round: read new punches from the device and send them to byTeam, carry
 * out any commands byTeam has for the device, and keep the device clock right.
 * byTeam only hears from the agent after the device answered, so a device that
 * is off or unplugged shows as offline on the Devices screen.
 */
export async function runCycle({ device, server, state, now, officeNow, log }: CycleInput): Promise<AgentState> {
  const next = { ...state };
  await device.connect();
  try {
    const serial = await device.serialNumber();
    if (serial !== next.serial) {
      log(`Connected to device ${serial}.`);
      next.serial = serial;
      next.lastHandshakeAt = null;
    }

    if (next.lastHandshakeAt === null || now - next.lastHandshakeAt >= HANDSHAKE_EVERY_MS) {
      await server.handshake(serial);
      next.lastHandshakeAt = now;
    }

    let users: ZkUser[] | null = null;
    const sizes = await device.sizes();
    const due = next.lastFullReadAt === null || now - next.lastFullReadAt >= FULL_READ_EVERY_MS;
    if (sizes.records !== next.recordCount || due) {
      users = await device.users();
      const punches = await device.punches(users);
      const toSend = punchesToSend(punches, next.sentUpTo);
      // Never past office time: a punch dated in the future by a wrong device clock must not hide later real ones.
      const ceiling = formatZkTime(officeNow());
      for (let i = 0; i < toSend.length; i += UPLOAD_BATCH) {
        const batch = toSend.slice(i, i + UPLOAD_BATCH);
        await server.upload(serial, batch.map(punchLine));
        // Saved after each batch, so a failure part way resends only what is left.
        const newest = formatZkTime(batch[batch.length - 1].time);
        next.sentUpTo = newest < ceiling ? newest : ceiling;
      }
      if (toSend.length > 0) log(`Sent ${toSend.length} punch${toSend.length === 1 ? "" : "es"} to byTeam (${punches.length} on the device).`);
      next.recordCount = sizes.records;
      next.lastFullReadAt = now;
    }

    for (let done = 0; done < MAX_COMMANDS_PER_CYCLE; ) {
      const commands = await server.nextCommands(serial);
      if (commands.length === 0) break;
      for (const command of commands) {
        done += 1;
        if (command.kind === "unsupported") {
          log(`byTeam sent a command the agent does not carry out, reported as failed: ${command.text.slice(0, 80)}`);
          await server.report(serial, command.id, RETURN_FAILED);
          continue;
        }
        try {
          users ??= await device.users();
          const user = userForCommand(users, command.pin, command.name, command.privilege);
          await device.writeUser(user);
          users = [...users.filter((u) => u.uid !== user.uid), user];
          await server.report(serial, command.id, 0);
          log(`Saved ${command.pin} (${command.name}) on the device.`);
        } catch (error) {
          log(`Could not save ${command.pin} on the device: ${(error as Error).message}`);
          await server.report(serial, command.id, RETURN_FAILED);
        }
      }
    }

    if (next.lastClockCheckAt === null || now - next.lastClockCheckAt >= CLOCK_CHECK_EVERY_MS) {
      const deviceTime = await device.time();
      const office = officeNow();
      const offset = Math.round((wallMs(deviceTime) - wallMs(office)) / 1000);
      let after = offset;
      if (Math.abs(offset) > CLOCK_TOLERANCE_SECONDS) {
        await device.setTime(office);
        after = 0;
        log(`Device clock was ${Math.abs(offset)} seconds ${offset > 0 ? "ahead" : "behind"}. Set it to ${formatZkTime(office)}.`);
      }
      // byTeam shows this on the Devices screen. It cannot judge the clock from punches the agent sends late.
      await server.reportClock(serial, after);
      next.lastClockCheckAt = now;
    }
  } finally {
    await device.disconnect();
  }
  return next;
}
