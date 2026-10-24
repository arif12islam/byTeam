import type { AttendanceStatus } from "@/db/schema/attendance";

/** Status names for people to read. */
export const statusLabel: Record<AttendanceStatus, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  leave_paid: "Paid leave",
  leave_unpaid: "Unpaid leave",
  weekly_off: "Weekly off day",
  holiday: "Holiday",
};

/** The short code shown in the monthly grid and in the Excel export. */
export const statusCode: Record<AttendanceStatus, string> = {
  present: "P",
  late: "L",
  absent: "A",
  leave_paid: "PL",
  leave_unpaid: "UL",
  weekly_off: "W",
  holiday: "H",
};

/** A grid cell as text: the code, with ! for no leaving punch and * for corrected by hand. */
export function cellText(cell: { status: AttendanceStatus; missingOut: boolean; isManual: boolean }): string {
  return `${statusCode[cell.status]}${cell.missingOut ? "!" : ""}${cell.isManual ? "*" : ""}`;
}
