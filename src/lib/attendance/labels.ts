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
