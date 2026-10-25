"use server";

import { cookies } from "next/headers";

import { requireRole } from "@/lib/session";

import { parseView, VIEW_COOKIE } from "./view";

/** Remembers whether the wide Attendance screen shows calendars or the table. Not data, so no audit row. */
export async function setAttendanceView(value: string) {
  await requireRole("owner", "hr");
  (await cookies()).set(VIEW_COOKIE, parseView(value), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
