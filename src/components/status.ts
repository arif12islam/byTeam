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

/** A saturated fill for a day in a calendar or grid, with text that reads on it. A day off stays calm so the days that matter stand out. */
export const statusFill: Record<AttendanceStatus, string> = {
  present: "bg-emerald-500 text-white",
  late: "bg-amber-400 text-amber-950",
  absent: "bg-rose-500 text-white",
  leave_paid: "bg-sky-500 text-white",
  leave_unpaid: "bg-sky-500 text-white",
  weekly_off: "bg-off-soft text-off",
  holiday: "bg-off-soft text-off",
};
