import { getDb } from "@/db";
import { loadPeriodGrid } from "@/lib/attendance/month";
import { resolvePeriod, wholeMonthsIn } from "@/lib/period";
import { loadPayrollSheet } from "@/lib/payroll/runs";
import { buildReportCsv } from "@/lib/reports/csv";
import { netByEmployee } from "@/lib/reports/payroll-report";
import { canAct } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";
import { toOfficeDate } from "@/lib/time";

/**
 * Downloads the figures per employee as CSV. /reports/export?from=YYYY-MM-DD&to=YYYY-MM-DD,
 * or ?month=YYYY-MM, or this month when left out. Net pay adds up the payroll
 * runs of the whole months inside the period.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!canAct(user.role, ["owner", "hr"])) return Response.json({ error: "You cannot export reports." }, { status: 403 });

  const today = toOfficeDate(new Date());
  const query = new URL(request.url).searchParams;
  const { period } = resolvePeriod({ from: query.get("from"), to: query.get("to"), month: query.get("month") }, today);

  const db = getDb();
  const [grid, sheets] = await Promise.all([
    loadPeriodGrid(db, period, today),
    Promise.all(wholeMonthsIn(period).map((m) => loadPayrollSheet(db, m))),
  ]);
  const net = netByEmployee(sheets.filter((s): s is NonNullable<typeof s> => s !== null));

  return new Response(buildReportCsv(grid, net), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="report-${period.from}-to-${period.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
