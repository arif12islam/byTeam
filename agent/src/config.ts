import type { ZkTime } from "./zk-protocol";

/** The agent's settings, from agent.json next to it. */
export type Config = {
  server: string;
  device: { host: string; port: number; commKey: number };
  pollSeconds: number;
  timeZone: string;
};

export function parseConfig(text: string): Config {
  // Windows PowerShell writes a byte order mark at the start of UTF-8 files.
  const raw = JSON.parse(text.replace(/^\uFEFF/, "")) as Partial<Config> & { device?: Partial<Config["device"]> };
  const server = typeof raw.server === "string" ? raw.server.trim() : "";
  if (!/^https?:\/\/[^\s/]+/.test(server)) throw new Error('"server" must be the byTeam address, like https://byteam.bykorp.com');
  const host = typeof raw.device?.host === "string" ? raw.device.host.trim() : "";
  if (!host) throw new Error('"device.host" must be the device IP address, like 192.168.1.201');
  return {
    server,
    device: { host, port: Number(raw.device?.port ?? 4370) || 4370, commKey: Number(raw.device?.commKey ?? 0) || 0 },
    pollSeconds: Math.min(Math.max(Number(raw.pollSeconds ?? 60) || 60, 15), 600),
    timeZone: typeof raw.timeZone === "string" && raw.timeZone ? raw.timeZone : "Asia/Dhaka",
  };
}

/** The office wall clock right now, in the form the device keeps time. */
export function officeTime(timeZone: string, at = new Date()): ZkTime {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, Number(p.value)]),
  );
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second };
}
