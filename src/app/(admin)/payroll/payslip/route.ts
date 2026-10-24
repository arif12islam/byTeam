import { z } from "zod";

import { getDb } from "@/db";
import { renderPayslips } from "@/lib/payroll/payslip-pdf";
import { loadPayslips } from "@/lib/payroll/payslip";
import { canAct } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";
import { isValidMonth } from "@/lib/time";

const employeeSchema = z.uuid();

/**
 * Downloads payslips of a finalized month as one PDF:
 * /payroll/payslip?month=YYYY-MM&employee=<id> for one person, or without
 * `employee` for everyone, one page each. Owner and HR only.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!canAct(user.role, ["owner", "hr"])) return Response.json({ error: "You cannot download payslips." }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const month = params.get("month");
  if (month === null || !isValidMonth(month)) return Response.json({ error: "Month must look like 2026-10." }, { status: 400 });
  const employee = params.get("employee");
  if (employee !== null && !employeeSchema.safeParse(employee).success) {
    return Response.json({ error: "That is not a valid employee." }, { status: 400 });
  }

  const result = await loadPayslips(getDb(), month, employee ?? undefined);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });

  const file = await renderPayslips(result.slips);
  const name = employee ? `payslip-${month}-${result.slips[0].employee.empCode}.pdf` : `payslips-${month}.pdf`;
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
