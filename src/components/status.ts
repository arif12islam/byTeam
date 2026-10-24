import type { AttendanceStatus } from "@/db/schema/attendance";
import type { Tone } from "@/components/ui/tone";

/** The color each attendance status wears wherever days are drawn. */
export const statusTone: Record<AttendanceStatus, Tone> = {
  present: "success",
  late: "warning",
  absent: "danger",
  leave_paid: "info",
  leave_unpaid: "info",
  weekly_off: "off",
  holiday: "off",
};
