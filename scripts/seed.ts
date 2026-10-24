/**
 * Puts demo data into a database: eight made-up employees, one month of
 * punches, leave, bonuses and an advance, covering every case the system
 * handles (always on time, often late, absent with and without leave,
 * forgotten punch-out, double tap, joined mid-month).
 *
 *   npm run db:seed -- --yes                      # last month, codes 9001 to 9008
 *   npm run db:seed -- --yes --month=2026-09 --code-start=9101
 *
 * Use it on a test or demo database only. Punches can never be deleted, so the
 * demo cannot be undone. It needs an owner (npm run seed:owner) and the weekly
 * off days set in Settings. Without --yes it only says what it would do.
 */
import { loadEnvConfig } from "@next/env";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../src/db/schema";
import { buildDemoPlan, DEMO_EMPLOYEE_COUNT } from "../src/lib/demo/scenarios";
import { applyDemoPlan } from "../src/lib/demo/seed";
import { isValidMonth, shiftMonth, toOfficeMonth } from "../src/lib/time";

loadEnvConfig(process.cwd());

const DEMO_DEVICE_SERIAL = "DEMO-PUNCHES";

function flag(name: string): string | null {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return null;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : "";
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Fill it in .env.local first.");

  const month = flag("month") ?? shiftMonth(toOfficeMonth(new Date()), -1);
  if (!isValidMonth(month)) throw new Error("--month must look like 2026-09.");
  const codeStart = Number(flag("code-start") ?? "9001");
  if (!Number.isInteger(codeStart) || codeStart < 1) throw new Error("--code-start must be a whole number, like 9001.");
  const codes = Array.from({ length: DEMO_EMPLOYEE_COUNT }, (_, i) => String(codeStart + i));

  const host = new URL(url).host;
  if (flag("yes") === null) {
    console.log(`This would add ${DEMO_EMPLOYEE_COUNT} demo employees (codes ${codes[0]} to ${codes.at(-1)}) and their punches for ${month} to the database at ${host}.`);
    console.log("Punches cannot be deleted afterwards. Run it again with --yes to go ahead.");
    process.exit(1);
  }

  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });
  try {
    const [owner] = await db.select({ id: schema.users.id, email: schema.users.email }).from(schema.users).where(eq(schema.users.role, "owner")).limit(1);
    if (!owner) throw new Error("There is no owner yet. Run npm run seed:owner first.");

    const [settings] = await db.select({ days: schema.companySettings.weeklyOffDays }).from(schema.companySettings).where(eq(schema.companySettings.id, 1));
    const weeklyOffDays = settings?.days ?? [];
    if (weeklyOffDays.length === 0) throw new Error("Set the weekly off days in Settings first. The demo month depends on them.");

    const plan = buildDemoPlan(month, weeklyOffDays, codes);
    console.log(`Adding demo data for ${month} to ${host} ...`);
    const summary = await applyDemoPlan(db, plan, { actorId: owner.id, deviceSerial: DEMO_DEVICE_SERIAL });
    console.log(`Done: ${summary.employees} employees, ${summary.punches} punches, ${summary.leaveRequests} leave requests, ${summary.adjustments} bonuses and advances.`);
    console.log(`The made-up holiday is ${plan.holiday.date}. Open Attendance for ${month}, then create a payroll draft for it.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
