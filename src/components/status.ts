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

/** The fill for a day in a calendar or grid: a soft status background with bold status text. */
export const statusFill: Record<AttendanceStatus, string> = {
  present: "bg-success-soft text-success",
  late: "bg-warning-soft text-warning",
  absent: "bg-danger-soft text-danger",
  leave_paid: "bg-info-soft text-info",
  leave_unpaid: "bg-info-soft text-info",
  weekly_off: "bg-off-soft text-off",
  holiday: "bg-off-soft text-off",
};
