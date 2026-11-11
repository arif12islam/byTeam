import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { PeopleFilter } from "@/components/people-filter";
import { HeroPanel } from "@/components/ui/hero-panel";
import { HeroStat } from "@/components/ui/hero-stat";
import { TabLinks } from "@/components/ui/tab-links";
import { getDb } from "@/db";
import { listEmployees } from "@/lib/employees/employees";
import { loadBalances } from "@/lib/leave/balances";
import { COMING_UP_DAYS, groupLeaveRequests, leaveHeroCounts } from "@/lib/leave/overview";
import { listLeaveRequests } from "@/lib/leave/requests";
import { getLeaveYearBasis, listLeaveTypes } from "@/lib/leave/types";
import { requireRole } from "@/lib/session";
import { toOfficeDate } from "@/lib/time";

import { BalancesTab } from "./balances-tab";
import { LeaveForm } from "./leave-form";
import { RecordLeave } from "./record-leave";
import { RequestsTab } from "./requests-tab";

export const metadata: Metadata = { title: "Leave" };

const TABS = [
  { id: "requests", label: "Requests" },
  { id: "balances", label: "Balances" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function parseTab(value: string | string[] | undefined): TabId {
  return TABS.find((t) => t.id === value)?.id ?? "requests";
}

export default function LeavePage(props: PageProps<"/leave">) {
  return (
    <>
      <PageHeader title="Leave" description="Record leave, approve it, and track what each employee has left." />
      <Suspense fallback={<p className="mt-6 text-sm text-muted-foreground">Loading leave</p>}>
        <LeaveContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function LeaveContent({ searchParams }: { searchParams: PageProps<"/leave">["searchParams"] }) {
  await requireRole("owner", "hr");
  const tab = parseTab((await searchParams).tab);

  const db = getDb();
  const today = toOfficeDate(new Date());
  const [people, types, requests, balances, basis] = await Promise.all([
    listEmployees(db, "active"),
    listLeaveTypes(db, { activeOnly: true }),
    listLeaveRequests(db),
    loadBalances(db, { onDate: today }),
    getLeaveYearBasis(db),
  ]);
  const balanceOf = new Map(balances.map((b) => [`${b.employeeId}|${b.leaveTypeId}`, b]));

  const counts = leaveHeroCounts(requests, today);
  const groups = groupLeaveRequests(requests, today);

  const basisNote =
    basis === "calendar"
      ? `Days left this year, 1 January to 31 December ${today.slice(0, 4)}.`
      : "Days left this year, counted from each person's joining date.";

  return (
    <div className="mt-6 grid gap-5">
      <HeroPanel>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <HeroStat label="Waiting for approval" value={counts.waiting} tone="warning" hint={counts.waiting > 0 ? "Needs a decision" : "All caught up"} className="col-span-2 sm:col-span-1" />
          <HeroStat label="On leave today" value={counts.onLeaveToday} tone="info" hint={counts.onLeaveToday === 1 ? "Request covers today" : "Requests cover today"} />
          <HeroStat label="Coming up" value={counts.comingUp} tone="info" hint={`Starting in the next ${COMING_UP_DAYS} days`} />
        </div>
        <div className="mt-5">
          <RecordLeave>
            {types.length === 0 ? (
              <p className="rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
                There are no leave types yet.{" "}
                <Link href="/leave/types" className="text-brand underline underline-offset-2">
                  Add the kinds of leave your office gives
                </Link>{" "}
                first, then come back to record leave.
              </p>
            ) : people.length === 0 ? (
              <p className="rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
                There are no employees yet.{" "}
                <Link href="/employees" className="text-brand underline underline-offset-2">
                  Add employees
                </Link>{" "}
                first.
              </p>
            ) : (
              <LeaveForm
                employees={people.map((p) => ({ id: p.id, name: p.name, empCode: p.empCode }))}
                leaveTypes={types.map((t) => ({ id: t.id, name: t.name }))}
              />
            )}
          </RecordLeave>
        </div>
      </HeroPanel>

      <TabLinks
        ariaLabel="Leave sections"
        active={`/leave?tab=${tab}`}
        tabs={[
          { href: "/leave?tab=requests", label: "Requests", count: counts.waiting > 0 ? counts.waiting : undefined },
          { href: "/leave?tab=balances", label: "Balances" },
        ]}
      />

      {tab === "requests" ? (
        requests.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
            No leave recorded yet. Press Record leave above when an employee asks for leave.
          </p>
        ) : (
          <RequestsTab waiting={groups.waiting} upcoming={groups.upcoming} past={groups.past} />
        )
      ) : people.length === 0 || types.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
          Balances show here once there are employees and leave types. Add them on the Employees and Leave types screens.
        </p>
      ) : people.length > 8 ? (
        <PeopleFilter>
          <BalancesTab people={people} types={types} balanceOf={balanceOf} basisNote={basisNote} />
        </PeopleFilter>
      ) : (
        <BalancesTab people={people} types={types} balanceOf={balanceOf} basisNote={basisNote} />
      )}
    </div>
  );
}
