import { getDb } from "@/db";
import { buildSalaryWorkbook } from "@/lib/payroll/export";
import { loadPayrollSheet } from "@/lib/payroll/runs";
import { canAct } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";
import { formatMonth, isValidMonth } from "@/lib/time";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Downloads a finalized month's salary sheet as Excel: /payroll/export?month=YYYY-MM. Owner and HR only. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!canAct(user.role, ["owner", "hr"])) return Response.json({ error: "You cannot download the salary sheet." }, { status: 403 });

  const month = new URL(request.url).searchParams.get("month");
  if (month === null || !isValidMonth(month)) return Response.json({ error: "Month must look like 2026-10." }, { status: 400 });

  const sheet = await loadPayrollSheet(getDb(), month);
  if (sheet === null) return Response.json({ error: `There is no payroll run for ${formatMonth(month)}.` }, { status: 404 });
  if (sheet.run.status !== "finalized") {
    return Response.json({ error: `${formatMonth(month)} is still a draft. Finalize it to download the salary sheet.` }, { status: 409 });
  }

  const file = await buildSalaryWorkbook(sheet);
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": XLSX,
      "Content-Disposition": `attachment; filename="salary-${month}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
