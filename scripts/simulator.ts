/**
 * Pretends to be a ZKTeco face and fingerprint device, so the whole path from
 * device to database can be tried without the real thing.
 *
 *   npm run sim -- --url http://localhost:3000 --sn SIM0000001
 *
 * The serial number must first be added on the Devices screen. Options:
 *
 *   --url       app address, default http://localhost:3000
 *   --sn        serial number to announce, default SIM0000001
 *   --codes     employee codes that punch, default 1001,1002,1003,1004,1005
 *   --scenario  all (default), handshake, live, burst, resend or poll
 *   --verify    count the stored punches in DATABASE_URL and say PASS or FAIL
 *
 * What it does, in order: handshake, a few live punches one at a time, a
 * delayed burst (the device was offline all of yesterday and catches up in one
 * upload), the same burst sent again, and polling for commands, answering each
 * as a device would.
 */
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";

import {
  attlogBody,
  deviceTime,
  punchKey,
  readCommandReply,
  uniquePunches,
  workDay,
  type SimPunch,
} from "./simulator-lib";

loadEnvConfig(process.cwd());

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const base = option("url", "http://localhost:3000").replace(/\/$/, "");
const sn = option("sn", "SIM0000001");
const codes = option("codes", "1001,1002,1003,1004,1005").split(",").map((c) => c.trim()).filter(Boolean);
const scenario = option("scenario", "all");
const verify = process.argv.includes("--verify");

const expected = new Map<string, SimPunch>();
let failed = false;

function say(text: string) {
  console.log(text);
}

function problem(text: string) {
  failed = true;
  console.log(`  PROBLEM: ${text}`);
}

async function call(method: "GET" | "POST", path: string, body?: string): Promise<{ status: number; text: string }> {
  const response = await fetch(`${base}${path}`, {
    method,
    body,
    headers: body === undefined ? undefined : { "Content-Type": "text/plain" },
    cache: "no-store",
  });
  return { status: response.status, text: await response.text() };
}

async function handshake() {
  say("\n1. Handshake: the device starts up and asks for its settings");
  const { status, text } = await call("GET", `/iclock/cdata?SN=${sn}&options=all&pushver=2.4.1&language=69`);
  if (status === 403) {
    problem(`The server does not know serial number ${sn}. Add it on the Devices screen first.`);
    throw new Error("device not registered");
  }
  if (status !== 200) return problem(`Expected 200, got ${status}: ${text.trim()}`);
  say(`  ${status} OK. Settings received:`);
  for (const line of text.split("\n").filter(Boolean)) say(`    ${line.replace("\t", "<TAB>")}`);
}

async function upload(punches: SimPunch[], label: string) {
  const { status, text } = await call("POST", `/iclock/cdata?SN=${sn}&table=ATTLOG&Stamp=9999`, attlogBody(punches));
  if (status !== 200 || text.trim() !== "OK") problem(`${label}: expected "OK", got ${status} ${text.trim()}`);
  else say(`  ${label}: ${punches.length} punches sent, server said OK`);
  for (const p of punches) expected.set(punchKey(p), p);
}

async function live() {
  say("\n2. Live punches: people punch in, one upload each, as they happen");
  const now = new Date();
  for (const [i, code] of codes.entries()) {
    await upload([{ code, at: new Date(now.getTime() + i * 1000), status: 0 }], `Code ${code} at ${deviceTime(new Date(now.getTime() + i * 1000))}`);
  }
}

function burstPunches(): SimPunch[] {
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
  const date = deviceTime(yesterday).slice(0, 10);
  return workDay(codes, date);
}

async function burst() {
  say("\n3. Delayed burst: the device was offline all of yesterday and now catches up in one upload");
  await upload(burstPunches(), "Yesterday's punches");
}

async function resend() {
  say("\n4. Duplicate resend: the same batch arrives again, and a half old, half new batch");
  const old = burstPunches();
  await upload(old, "Same batch again");
  const twoDaysAgo = deviceTime(new Date(Date.now() - 48 * 3600 * 1000)).slice(0, 10);
  const mixed = [...old.slice(0, Math.ceil(old.length / 2)), ...workDay(codes.slice(0, 2), twoDaysAgo)];
  await upload(mixed, "Half old, half new");
}

async function poll() {
  say("\n5. Polling: the device asks for commands and reports how each went");
  for (let i = 0; i < 20; i += 1) {
    const { status, text } = await call("GET", `/iclock/getrequest?SN=${sn}`);
    if (status !== 200) return problem(`Poll expected 200, got ${status}`);
    const command = readCommandReply(text);
    if (!command) {
      say(i === 0 ? "  Nothing waiting for this device." : "  Nothing more waiting.");
      return;
    }
    say(`  Got command ${command.id}: ${command.command.replace(/\t/g, " ")}`);
    const report = await call("POST", `/iclock/devicecmd?SN=${sn}`, `ID=${command.id}&Return=0&CMD=DATA\r\n`);
    if (report.status !== 200 || report.text.trim() !== "OK") problem(`Report expected OK, got ${report.status} ${report.text.trim()}`);
    else say(`  Reported command ${command.id} as done`);
  }
}

async function check() {
  const url = process.env.DATABASE_URL;
  if (!url) return problem("--verify needs DATABASE_URL, in the environment or .env.local.");
  const unique = uniquePunches([...expected.values()]);
  const sql = postgres(url, { max: 1 });
  try {
    const rows = await sql<{ emp_code: string; punched_at: Date }[]>`
      select emp_code, punched_at from raw_punches where device_sn = ${sn}`;
    const stored = new Map(rows.map((r) => [`${r.emp_code}|${deviceTime(r.punched_at)}`, true]));
    const missing = unique.filter((p) => !stored.has(punchKey(p)));
    const total = rows.length;
    say(`\nCheck against the database for ${sn}:`);
    say(`  Distinct punches sent: ${unique.length}`);
    say(`  Rows stored for this device: ${total}`);
    if (missing.length > 0) problem(`${missing.length} punches sent were not stored.`);
    if (total !== unique.length) {
      say(`  (This device holds ${total - unique.length} more than this run sent: from earlier runs. Use a fresh serial number for an exact count.)`);
    }
    if (missing.length === 0 && total >= unique.length) say("  Every punch was stored, and a resent punch was not stored twice.");
  } finally {
    await sql.end();
  }
}

async function main() {
  say(`Simulating device ${sn} against ${base}`);
  const steps: Record<string, () => Promise<void>> = { handshake, live, burst, resend, poll };
  if (scenario === "all") {
    for (const step of Object.values(steps)) await step();
  } else if (steps[scenario]) {
    await steps[scenario]();
  } else {
    throw new Error(`Unknown scenario "${scenario}". Use all, handshake, live, burst, resend or poll.`);
  }

  if (verify) await check();
  const unique = uniquePunches([...expected.values()]).length;
  say(`\nSent ${unique} distinct punches in total. ${failed ? "Finished with problems." : "No problems."}`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
