import { getDb } from "@/db";
import { buildGridWorkbook } from "@/lib/attendance/export";
import { loadPeriodGrid } from "@/lib/attendance/month";
import { resolvePeriod } from "@/lib/period";
import { canAct } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";
import { toOfficeDate } from "@/lib/time";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Downloads the grid as Excel. /attendance/export?from=YYYY-MM-DD&to=YYYY-MM-DD,
 * or ?month=YYYY-MM, or this month when left out.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!canAct(user.role, ["owner", "hr"])) return Response.json({ error: "You cannot export attendance." }, { status: 403 });

  const today = toOfficeDate(new Date());
  const query = new URL(request.url).searchParams;
  const { period } = resolvePeriod({ from: query.get("from"), to: query.get("to"), month: query.get("month") }, today);

  const grid = await loadPeriodGrid(getDb(), period, today);
  const file = await buildGridWorkbook(grid);

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": XLSX,
      "Content-Disposition": `attachment; filename="attendance-${period.from}-to-${period.to}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
