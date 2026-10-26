import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db";
import { countActiveSamplePeople } from "@/lib/demo/sample";
import { listRecentOutages } from "@/lib/attendance/outages";
import { getCompanySettings } from "@/lib/settings/company";
import { groupByYear, listHolidays } from "@/lib/settings/holidays";
import { requireRole } from "@/lib/session";
import { formatOfficeDate } from "@/lib/time";

import { removeHolidayAction } from "./actions";
import { OutageForm, RemoveOutageForm } from "./outage-forms";
import { SampleDataForm } from "./sample-data-form";
import { CompanyForm } from "./company-form";
import { HolidayForm } from "./holiday-form";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Company details, weekly off days, public holidays and office outages."
      />
      <Suspense fallback={<p className="mt-6 text-sm text-muted-foreground">Loading settings</p>}>
        <SettingsContent />
      </Suspense>
    </>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

async function SettingsContent() {
  const user = await requireRole("owner", "hr");

  const db = getDb();
  const [company, holidays, outages, activeSamples] = await Promise.all([
    getCompanySettings(db),
    listHolidays(db),
    listRecentOutages(db),
    countActiveSamplePeople(db),
  ]);
  const groups = groupByYear(holidays);

  return (
    <div className="mt-6 grid max-w-3xl gap-6">
      <Section title="Company" description="Shown on payslips and reports.">
        <CompanyForm {...company} />
      </Section>

      <Section
        title="Holidays"
        description="Public holidays are paid days off. Attendance skips them."
      >
        <HolidayForm />

        {groups.length === 0 ? (
          <p className="mt-6 rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
            No holidays yet. Add the public holidays for this year so they are not marked absent.
          </p>
        ) : (
          <div className="mt-6 space-y-5">
            {groups.map((group) => (
              <div key={group.year}>
                <h3 className="text-sm font-medium text-muted-foreground">{group.year}</h3>
                <ul className="mt-2 divide-y divide-border rounded-md border border-border">
                  {group.holidays.map((holiday) => (
                    <li key={holiday.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{holiday.name}</p>
                        <p className="text-xs text-muted-foreground">{formatOfficeDate(holiday.date)}</p>
                      </div>
                      <form action={removeHolidayAction}>
                        <input type="hidden" name="id" value={holiday.id} />
                        <Button type="submit" variant="ghost" size="sm" aria-label={`Remove ${holiday.name}`}>
                          Remove
                        </Button>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Office outages"
        description="When the power or the device was off and people could not punch, record it. Nobody is marked late for an arrival the outage caused, and a day it covered from start to finish is not marked absent."
      >
        <OutageForm />

        {outages.length === 0 ? (
          <p className="mt-6 rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
            No outages in the last month. Record one here as soon as you know the date and the times.
          </p>
        ) : (
          <ul className="mt-6 divide-y divide-border rounded-md border border-border">
            {outages.map((outage) => (
              <li key={outage.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{outage.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatOfficeDate(outage.date)}, {outage.startTime} to {outage.endTime}
                  </p>
                </div>
                <RemoveOutageForm id={outage.id} label={`${outage.reason} on ${outage.date}`} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {user.role === "owner" ? (
        <Section
          title="Sample data"
          description="To try every screen before the device is connected: eight made-up people named Sample ..., with last month's punches, late days, absences, leave, a bonus and an advance. Punches can never be deleted, so the sample stays in the history. Switch the sample people off before the real pilot and they drop out of Today, Attendance and new payroll runs."
        >
          <SampleDataForm activeSamples={activeSamples} />
        </Section>
      ) : null}
    </div>
  );
}
