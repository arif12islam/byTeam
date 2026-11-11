import { formatOfficeDate, toOfficeDate } from "@/lib/time";

/** The status badge and the line under it, for the top of a payroll month. Pure. */
export function describeRunStatus(run: { status: string; version: number; finalizedAt: Date | null; finalizedByName: string | null }): {
  tone: "success" | "warning";
  badge: string;
  detail: string;
} {
  if (run.status !== "finalized") {
    return { tone: "warning", badge: "Draft", detail: "Not final until the admin finalizes it." };
  }
  const when = run.finalizedAt ? `Finalized ${formatOfficeDate(toOfficeDate(run.finalizedAt))}` : "Finalized";
  const who = run.finalizedAt && run.finalizedByName ? ` by ${run.finalizedByName}` : "";
  return { tone: "success", badge: `Finalized v${run.version}`, detail: `${when}${who}. Attendance, leave, bonuses and advances are locked.` };
}
