import { getDb } from "@/db";
import { loadMonthGrid } from "@/lib/attendance/month";
import { loadPayrollSheet } from "@/lib/payroll/runs";
import { buildReportCsv } from "@/lib/reports/csv";
import { canAct } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";
import { isValidMonth, toOfficeDate, toOfficeMonth } from "@/lib/time";

/** Downloads the month's figures per employee as CSV. /reports/export?month=YYYY-MM, this month when left out. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!canAct(user.role, ["owner", "hr"])) return Response.json({ error: "You cannot export reports." }, { status: 403 });

  const now = new Date();
  const requested = new URL(request.url).searchParams.get("month");
  if (requested !== null && !isValidMonth(requested)) {
    return Response.json({ error: "Month must look like 2026-10." }, { status: 400 });
  }
  const month = requested ?? toOfficeMonth(now);

  const db = getDb();
  const [grid, sheet] = await Promise.all([loadMonthGrid(db, month, toOfficeDate(now)), loadPayrollSheet(db, month)]);
  const netByEmployee = new Map((sheet?.rows ?? []).map((row) => [row.employeeId, row.net]));

  return new Response(buildReportCsv(grid, netByEmployee), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="report-${month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
