import { getDb } from "@/db";
import { runNightlyRecalc } from "@/lib/attendance/nightly";

/**
 * Nightly recalculation, called by Vercel Cron at 02:00 Dhaka (see vercel.json)
 * or by system cron on a VPS later. Rebuilds the previous office day for every
 * active employee.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runNightlyRecalc(getDb());
    return Response.json({ ok: true, date: result.date, employees: result.employees, days: result.days, removed: result.removed });
  } catch (error) {
    console.error("[cron] nightly recalculation failed", error);
    return Response.json({ ok: false, error: "Recalculation failed" }, { status: 500 });
  }
}
