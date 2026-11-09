import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db";
import { listRecentOutages } from "@/lib/attendance/outages";
import { listDepartments } from "@/lib/employees/departments";
import { listMySubscriptions } from "@/lib/notifications/subscriptions";
import { getCompanySettings } from "@/lib/settings/company";
import { groupByYear, listHolidays } from "@/lib/settings/holidays";
import { requireRole } from "@/lib/session";
import { formatOfficeDate, toOfficeDate } from "@/lib/time";

import { removeHolidayAction } from "./actions";
import { EditOutageForm, OutageForm, RemoveOutageForm } from "./outage-forms";
import { CompanyForm } from "./company-form";
import { EditHolidayForm, HolidayForm } from "./holiday-form";
import { HolidayImport } from "./holiday-import";
import { AddDepartmentForm, DepartmentRowForms } from "./department-forms";
import { LoginForm } from "./login-form";
import { NotificationSettings } from "./notification-settings";

export const metadata: Metadata = { title: "Settings" };

const TABS = [
  { id: "company", label: "Company" },
  { id: "holidays", label: "Holidays" },
  { id: "outages", label: "Outages" },
  { id: "notifications", label: "Notifications" },
  { id: "login", label: "Your login" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function parseTab(value: string | string[] | undefined): TabId {
  return TABS.find((t) => t.id === value)?.id ?? "company";
}

export default function SettingsPage(props: PageProps<"/settings">) {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Company details, departments, weekly off days, public holidays, office outages and your login."
      />
      <Suspense fallback={<p className="mt-6 text-sm text-muted-foreground">Loading settings</p>}>
        <SettingsContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

function TabBar({ active }: { active: TabId }) {
  return (
    <nav aria-label="Settings sections" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-1 border-b border-border">
        {TABS.map((tab) => (
          <li key={tab.id}>
            <Link
              href={`/settings?tab=${tab.id}`}
              aria-current={tab.id === active ? "page" : undefined}
              className={`-mb-px flex min-h-10 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap ${
                tab.id === active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
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

async function SettingsContent({ searchParams }: { searchParams: PageProps<"/settings">["searchParams"] }) {
  const user = await requireRole("owner", "hr");
  const { tab: requested } = await searchParams;
  const tab = parseTab(requested);

  return (
    <div className="mt-6 grid max-w-3xl gap-6">
      <TabBar active={tab} />
      {tab === "company" && <CompanyTab />}
      {tab === "holidays" && <HolidaysTab />}
      {tab === "outages" && <OutagesTab />}
      {tab === "notifications" && <NotificationsTab userId={user.id} />}
      {tab === "login" && (
        <Section title="Your login" description="Change your name, and the email and password you sign in with.">
          <LoginForm name={user.name} email={user.email} />
        </Section>
      )}
    </div>
  );
}

async function CompanyTab() {
  const db = getDb();
  const [company, departments] = await Promise.all([getCompanySettings(db), listDepartments(db)]);
  return (
    <>
      <Section title="Company" description="Shown on payslips and reports.">
        <CompanyForm {...company} />
      </Section>

      <div id="departments" className="scroll-mt-6">
        <Section title="Departments" description="The list you choose from when you add or edit an employee. Renaming a department renames it for everyone in it. Delete one once nobody is in it.">
          <AddDepartmentForm />

          {departments.length === 0 ? (
            <p className="mt-6 rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
              No departments yet. Add the first one above, then pick it when you add an employee.
            </p>
          ) : (
            <ul className="mt-6 divide-y divide-border rounded-md border border-border">
              {departments.map((department) => (
                <DepartmentRowForms key={department.id} department={department} />
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}

async function HolidaysTab() {
  const holidays = await listHolidays(getDb());
  const groups = groupByYear(holidays);
  const thisYear = Number(toOfficeDate(new Date()).slice(0, 4));
  const importYears = [thisYear, thisYear + 1];
  return (
    <Section title="Holidays" description="Public holidays are paid days off. Attendance skips them.">
      <HolidayForm />
      <div className="mt-4">
        <HolidayImport years={importYears} />
      </div>

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
                  <li key={holiday.id}>
                    <div className="flex items-center justify-between gap-3 px-3 py-2">
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
                    </div>
                    <EditHolidayForm holiday={holiday} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

async function OutagesTab() {
  const outages = await listRecentOutages(getDb());
  return (
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
              <EditOutageForm outage={outage} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

async function NotificationsTab({ userId }: { userId: string }) {
  const mySubscriptions = await listMySubscriptions(getDb(), userId);
  return (
    <Section
      title="Notifications"
      description="Alerts on this phone or computer, even when byTeam is closed. They are checked about once an hour during office hours. Each device chooses its own."
    >
      <NotificationSettings subscriptions={mySubscriptions} />
    </Section>
  );
}
