import { getDb } from "@/db";
import { buildGridCsv, buildGridWorkbook } from "@/lib/attendance/export";
import { describeFilters, filterGrid, filterSlug, parseExportOptions } from "@/lib/attendance/export-options";
import { renderAttendancePdf } from "@/lib/attendance/export-pdf";
import { loadPeriodGrid } from "@/lib/attendance/month";
import { resolvePeriod } from "@/lib/period";
import { canAct } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";
import { getCompanySettings } from "@/lib/settings/company";
import { toOfficeDate } from "@/lib/time";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Downloads the attendance as Excel, PDF or CSV.
 * /attendance/export?from=YYYY-MM-DD&to=YYYY-MM-DD (or ?month=YYYY-MM, or this month when left out)
 * plus any of format=xlsx|pdf|csv, department=<name>, employee=<id> and
 * only=late|absent|leave|missing_out|worked_off_day.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!canAct(user.role, ["owner", "hr"])) return Response.json({ error: "You cannot export attendance." }, { status: 403 });

  const today = toOfficeDate(new Date());
  const query = new URL(request.url).searchParams;
  const { period } = resolvePeriod({ from: query.get("from"), to: query.get("to"), month: query.get("month") }, today);
  const options = parseExportOptions(query);

  const [full, company] = await Promise.all([loadPeriodGrid(getDb(), period, today), getCompanySettings(getDb())]);
  const employeeName = full.rows.find((row) => row.employee.id === options.employeeId)?.employee.name ?? null;
  const grid = filterGrid(full, options);
  const filterNote = describeFilters(options, employeeName);
  const slug = filterSlug(options);
  const name = `attendance-${period.from}-to-${period.to}${slug ? `-${slug}` : ""}`;
  const headers = { "Cache-Control": "no-store" };

  if (options.format === "pdf") {
    const file = await renderAttendancePdf(grid, { company: company.name, trackLeavingPunch: company.trackLeavingPunch, filterNote, madeOn: today });
    return new Response(new Uint8Array(file), {
      headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}.pdf"` },
    });
  }

  if (options.format === "csv") {
    // The byte order mark lets Excel read names in any script.
    const csv = `﻿${buildGridCsv(grid, { trackLeavingPunch: company.trackLeavingPunch })}`;
    return new Response(csv, {
      headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` },
    });
  }

  const file = await buildGridWorkbook(grid, { trackLeavingPunch: company.trackLeavingPunch, filterNote });
  return new Response(new Uint8Array(file), {
    headers: { ...headers, "Content-Type": XLSX, "Content-Disposition": `attachment; filename="${name}.xlsx"` },
  });
}
