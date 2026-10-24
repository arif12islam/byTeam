import { getDb } from "@/db";
import { buildGridWorkbook } from "@/lib/attendance/export";
import { loadMonthGrid } from "@/lib/attendance/month";
import { canAct } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";
import { isValidMonth, toOfficeDate, toOfficeMonth } from "@/lib/time";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Downloads the monthly grid as Excel. /attendance/export?month=YYYY-MM, this month when left out. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!canAct(user.role, ["owner", "hr"])) return Response.json({ error: "You cannot export attendance." }, { status: 403 });

  const now = new Date();
  const requested = new URL(request.url).searchParams.get("month");
  if (requested !== null && !isValidMonth(requested)) {
    return Response.json({ error: "Month must look like 2026-10." }, { status: 400 });
  }
  const month = requested ?? toOfficeMonth(now);

  const grid = await loadMonthGrid(getDb(), month, toOfficeDate(now));
  const file = await buildGridWorkbook(grid);

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": XLSX,
      "Content-Disposition": `attachment; filename="attendance-${month}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
