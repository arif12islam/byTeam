export type AttendanceView = "calendar" | "table";

export const VIEW_COOKIE = "attendance_view";

export function parseView(value: string | undefined): AttendanceView {
  return value === "table" ? "table" : "calendar";
}
