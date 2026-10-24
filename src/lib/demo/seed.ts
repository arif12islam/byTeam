import { eq } from "drizzle-orm";

import type { getDb } from "@/db";
import { devices, employees, holidays, shifts } from "@/db/schema";
import { savePunches } from "@/lib/adms/store";
import { recalc } from "@/lib/attendance/recalc";
import { createEmployee } from "@/lib/employees/employees";
import { decideLeave } from "@/lib/leave/decisions";
import { createLeaveRequest } from "@/lib/leave/requests";
import { createLeaveType, listLeaveTypes } from "@/lib/leave/types";
import { addPayrollAdjustment } from "@/lib/payroll/adjustments";
import { saveSalaryStructure } from "@/lib/salary/salary";
import { addHoliday } from "@/lib/settings/holidays";
import { createShift } from "@/lib/shifts/shifts";
import { daysInMonth, officeDateTimeToInstant, toOfficeDate } from "@/lib/time";

import { DEMO_SHIFT, type DemoPlan } from "./scenarios";

type Db = ReturnType<typeof getDb>;

/** A fake device that exists only to own the demo punches. It is switched off, so nothing real can be mistaken for it. */
export const DEMO_DEVICE = { name: "Demo punches (not a real device)" };

export type DemoSummary = { employees: number; punches: number; leaveRequests: number; adjustments: number };

/**
 * Puts a demo plan into the database through the same functions the screens
 * use, so every rule applies: audit rows, the punch log, leave approval,
 * recalculation. Run it on a test or demo database only. The punch log can
 * never be cleaned up afterwards.
 *
 * Refuses when a demo employee code is taken or the demo shift has been edited.
 */
export async function applyDemoPlan(
  db: Db,
  plan: DemoPlan,
  options: {
    actorId: string;
    deviceSerial: string;
    today?: string;
    /** Names of the shared setup rows. Tests give their own so files running together never meet. */
    names?: { shift?: string; paidLeave?: string; unpaidLeave?: string };
  },
): Promise<DemoSummary> {
  const { actorId } = options;
  const shiftName = options.names?.shift ?? DEMO_SHIFT.name;
  const today = options.today ?? toOfficeDate(new Date());
  const summary: DemoSummary = { employees: 0, punches: 0, leaveRequests: 0, adjustments: 0 };

  for (const person of plan.employees) {
    const [taken] = await db.select({ id: employees.id }).from(employees).where(eq(employees.empCode, person.empCode));
    if (taken) throw new Error(`Employee code ${person.empCode} is already in use.`);
  }

  // The shift, the leave types and the holiday are shared setup: reuse them when they are there.
  let [shift] = await db.select().from(shifts).where(eq(shifts.name, shiftName));
  if (!shift) shift = await createShift(db, { ...DEMO_SHIFT, name: shiftName }, actorId);
  if (shift.startTime.slice(0, 5) !== DEMO_SHIFT.startTime || shift.endTime.slice(0, 5) !== DEMO_SHIFT.endTime || shift.graceMinutes !== DEMO_SHIFT.graceMinutes) {
    throw new Error(`The shift "${shiftName}" has been changed, so the demo would not come out as planned. Change it back first.`);
  }

  const types = await listLeaveTypes(db);
  const typeNamed = async (name: string, isPaid: boolean) =>
    types.find((t) => t.name.toLowerCase() === name.toLowerCase()) ?? (await createLeaveType(db, { name, yearlyQuota: isPaid ? "15" : "", isPaid }, actorId));
  const paidName = options.names?.paidLeave ?? "Casual leave";
  const unpaidName = options.names?.unpaidLeave ?? "Unpaid leave";
  const paidType = await typeNamed(paidName, true);
  const unpaidType = await typeNamed(unpaidName, false);
  if (!paidType.isPaid || unpaidType.isPaid) throw new Error(`"${paidName}" must be a paid leave type and "${unpaidName}" an unpaid one.`);

  const [holiday] = await db.select().from(holidays).where(eq(holidays.date, plan.holiday.date));
  if (!holiday) await addHoliday(db, plan.holiday, actorId);

  let [device] = await db.select().from(devices).where(eq(devices.serialNo, options.deviceSerial));
  if (!device) [device] = await db.insert(devices).values({ serialNo: options.deviceSerial, name: DEMO_DEVICE.name, active: false }).returning();

  const ids: string[] = [];
  for (const person of plan.employees) {
    const employee = await createEmployee(
      db,
      {
        empCode: person.empCode,
        name: person.name,
        department: person.department,
        designation: person.designation,
        joinDate: person.joinDate,
        exitDate: "",
        shiftId: shift.id,
      },
      actorId,
    );
    ids.push(employee.id);
    summary.employees++;

    await saveSalaryStructure(db, employee.id, person.salary, actorId);

    const saved = await savePunches(
      db,
      person.punches.map((p) => ({
        deviceSn: device.serialNo,
        empCode: person.empCode,
        punchedAt: officeDateTimeToInstant(p.date, p.time)!,
        statusCode: 0,
        verifyCode: 1,
        rawLine: `${person.empCode}\t${p.date} ${p.time.length === 5 ? `${p.time}:00` : p.time}\t0\t1`,
      })),
    );
    summary.punches += saved.inserted;

    for (const leave of person.leave) {
      const created = await createLeaveRequest(
        db,
        { employeeId: employee.id, leaveTypeId: leave.kind === "paid" ? paidType.id : unpaidType.id, fromDate: leave.fromDate, toDate: leave.toDate, note: "Demo leave" },
        actorId,
      );
      if (!created.ok) throw new Error(`Demo leave for ${person.name}: ${created.error}`);
      const decided = await decideLeave(db, created.requestId, "approve", actorId, { today });
      if (!decided.ok) throw new Error(`Demo leave for ${person.name}: ${decided.error}`);
      summary.leaveRequests++;
    }

    for (const a of person.adjustments) {
      const added = await addPayrollAdjustment(db, { employeeId: employee.id, month: plan.month, type: a.type, amount: a.amount, note: a.note }, actorId, { today });
      if (!added.ok) throw new Error(`Demo ${a.type} for ${person.name}: ${added.error}`);
      summary.adjustments++;
    }
  }

  // Bring the stored attendance up to date for the month (up to today, so a current month has no future days).
  const last = `${plan.month}-${String(daysInMonth(plan.month)).padStart(2, "0")}`;
  await recalc(db, { employeeIds: ids, from: `${plan.month}-01`, to: last < today ? last : today });
  return summary;
}
