import { and, eq, like } from "drizzle-orm";

import type { getDb } from "@/db";
import { companySettings, employees } from "@/db/schema";
import { setEmployeeActive } from "@/lib/employees/employees";
import { shiftMonth, toOfficeMonth } from "@/lib/time";

import { buildDemoPlan, DEMO_EMPLOYEE_COUNT, type DemoPlan } from "./scenarios";
import { applyDemoPlan, type DemoSummary } from "./seed";

type Db = ReturnType<typeof getDb>;

/**
 * Sample data the owner can load into a real byTeam to look around before the
 * device is connected: the demo month (eight people, every case the app
 * handles) for last month, marked "Sample" everywhere it shows. Unlike the
 * demo seed it adds no public holiday, which would change real people's days.
 *
 * Punches can never be deleted, so it cannot be taken out again. The sample
 * people can be switched off in one go, after which they drop out of Today,
 * Attendance and new payroll runs.
 */

export const SAMPLE_PREFIX = "Sample ";
export const SAMPLE_DEVICE_SERIAL = "SAMPLE-PUNCHES";
const SAMPLE_DEVICE_NAME = "Sample punches (not a real device)";
const SAMPLE_SHIFT_NAME = "Sample day shift";

/** The first block of eight free codes from 9001, 9101, 9201 and so on, or null when all are taken. */
export function freeSampleCodes(taken: ReadonlySet<string>): string[] | null {
  for (let start = 9001; start <= 9901; start += 100) {
    const codes = Array.from({ length: DEMO_EMPLOYEE_COUNT }, (_, i) => String(start + i));
    if (codes.every((c) => !taken.has(c))) return codes;
  }
  return null;
}

/** The demo plan with every person's name starting "Sample ", so nobody can mistake them for staff. */
export function markAsSample(plan: DemoPlan): DemoPlan {
  return { ...plan, employees: plan.employees.map((e) => ({ ...e, name: `${SAMPLE_PREFIX}${e.name}`, department: `${e.department} (sample)` })) };
}

async function activeSamplePeople(db: Db) {
  return db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.active, true), like(employees.name, `${SAMPLE_PREFIX}%`)));
}

export async function countActiveSamplePeople(db: Db): Promise<number> {
  return (await activeSamplePeople(db)).length;
}

export type SampleResult = { ok: true; month: string; codes: string[]; summary: DemoSummary } | { ok: false; error: string };

export async function loadSampleData(db: Db, actorId: string, now = new Date()): Promise<SampleResult> {
  if ((await countActiveSamplePeople(db)) > 0) {
    return { ok: false, error: "Sample data is already loaded. Switch the sample people off first if you want a fresh set." };
  }

  const [settings] = await db.select({ days: companySettings.weeklyOffDays }).from(companySettings).where(eq(companySettings.id, 1));
  const weeklyOffDays = settings?.days ?? [];
  if (weeklyOffDays.length === 0) return { ok: false, error: "Set the weekly off days under Company first. The sample month depends on them." };

  const taken = new Set((await db.select({ code: employees.empCode }).from(employees)).map((r) => r.code));
  const codes = freeSampleCodes(taken);
  if (!codes) return { ok: false, error: "No free block of employee codes for the sample people (9001 to 9908 are taken)." };

  const month = shiftMonth(toOfficeMonth(now), -1);
  const plan = markAsSample(buildDemoPlan(month, weeklyOffDays, codes));
  try {
    const summary = await applyDemoPlan(db, plan, {
      actorId,
      deviceSerial: SAMPLE_DEVICE_SERIAL,
      deviceName: SAMPLE_DEVICE_NAME,
      holiday: false,
      names: { shift: SAMPLE_SHIFT_NAME },
    });
    return { ok: true, month, codes, summary };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

/** Switches every active sample person off, each with its own audit row. Returns how many. */
export async function switchOffSamplePeople(db: Db, actorId: string): Promise<number> {
  const people = await activeSamplePeople(db);
  for (const person of people) await setEmployeeActive(db, person.id, false, actorId);
  return people.length;
}
