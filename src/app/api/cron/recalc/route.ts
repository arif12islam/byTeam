import { previousDate, toOfficeDate } from "@/lib/time";

/**
 * Nightly recalculation, called by Vercel Cron at 02:00 Dhaka (see vercel.json)
 * or by system cron on a VPS later. The attendance engine is wired in at M3;
 * until then this only confirms the job is reachable and authorized.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date = previousDate(toOfficeDate(new Date()));

  return Response.json({ ok: true, date, recalculated: 0 });
}
