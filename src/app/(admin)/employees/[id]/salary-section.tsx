import { getDb } from "@/db";
import { formatTaka } from "@/lib/salary/money";
import { listSalaryStructures, salaryBreakdown, structureForMonth } from "@/lib/salary/salary";
import { formatMonth, toOfficeMonth } from "@/lib/time";

import { SalaryForm } from "./salary-form";

/** Reads the current time, so render it after the session check, inside Suspense. */
export async function SalarySection({ employeeId }: { employeeId: string }) {
  const structures = await listSalaryStructures(getDb(), employeeId);
  const thisMonth = toOfficeMonth(new Date());
  const inForce = structureForMonth(structures, thisMonth);
  const latest = structures[0];

  const start = {
    gross: latest?.gross.replace(/\.00$/, "") ?? "",
    basicPct: latest?.basicPct ?? "",
    housePct: latest?.housePct ?? "",
    medicalPct: latest?.medicalPct ?? "",
    conveyancePct: latest?.conveyancePct ?? "",
    month: thisMonth,
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
      <h2 className="text-base font-semibold">Salary</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {structures.length === 0
          ? "No salary yet. Add one so payroll can include this person."
          : "A new salary starts from the month you choose. Earlier months keep the old one."}
      </p>

      <div className="mt-5">
        <SalaryForm employeeId={employeeId} start={start} />
      </div>

      {structures.length > 0 ? (
        <div className="mt-8">
          <h3 className="text-sm font-medium text-muted-foreground">History</h3>
          <ul className="mt-2 divide-y divide-border rounded-md border border-border">
            {structures.map((s) => {
              const parts = salaryBreakdown(s);
              const rows = [
                ["Basic", s.basicPct, parts.basic],
                ["House rent", s.housePct, parts.house],
                ["Medical", s.medicalPct, parts.medical],
                ["Conveyance", s.conveyancePct, parts.conveyance],
              ] as const;
              return (
                <li key={s.id} className="px-3 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium">
                      From {formatMonth(s.effectiveFrom.slice(0, 7))}
                      {inForce?.id === s.id ? (
                        <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-xs font-medium text-accent-foreground">
                          In use now
                        </span>
                      ) : null}
                    </p>
                    <p className="text-sm font-medium">{formatTaka(s.gross)} taka</p>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
                    {rows.map(([label, pct, amount]) => (
                      <div key={label}>
                        <dt>
                          {label} {Number(pct)}%
                        </dt>
                        <dd className="text-foreground">{formatTaka(amount)}</dd>
                      </div>
                    ))}
                    {parts.other !== "0.00" ? (
                      <div>
                        <dt>Other</dt>
                        <dd className="text-foreground">{formatTaka(parts.other)}</dd>
                      </div>
                    ) : null}
                  </dl>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
