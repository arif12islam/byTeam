import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { LeaveRequestRow } from "@/lib/leave/requests";
import { formatOfficeDate } from "@/lib/time";

import { DecisionButtons } from "./decision-buttons";

const statusLabel = { pending: "Waiting for approval", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled" } as const;
const statusTone = { pending: "warning", approved: "success", rejected: "danger", cancelled: "off" } as const;

/** Past requests shown before the rest fold away. */
export const PAST_SHOWN = 10;

function dates(from: string, to: string): string {
  return from === to ? formatOfficeDate(from) : `${formatOfficeDate(from)} to ${formatOfficeDate(to)}`;
}

function RequestRow({ r }: { r: LeaveRequestRow }) {
  return (
    <li className="flex items-start gap-3 px-4 py-4 sm:px-5">
      <Avatar name={r.employeeName} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <p className="min-w-0 text-sm font-semibold">
            {r.employeeName} <span className="font-normal text-muted-foreground">({r.empCode})</span>
          </p>
          <Badge tone={statusTone[r.status]}>{statusLabel[r.status]}</Badge>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{r.leaveTypeName}</span>, {dates(r.fromDate, r.toDate)}, {r.days}{" "}
          {r.days === 1 ? "working day" : "working days"}
          {r.unpaidDays > 0 ? `, ${r.unpaidDays} unpaid` : ""}
        </p>
        {r.note ? <p className="mt-0.5 text-sm text-muted-foreground">{r.note}</p> : null}
        <DecisionButtons id={r.id} status={r.status} />
      </div>
    </li>
  );
}

function Section({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold sm:px-5">
        {title}
        <span className="rounded-md bg-secondary px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{count}</span>
      </h2>
      {count === 0 ? <p className="px-4 py-5 text-sm text-muted-foreground sm:px-5">{empty}</p> : children}
    </section>
  );
}

/** The Requests tab: what is waiting, what is on now or coming, and what is over. */
export function RequestsTab({
  waiting,
  upcoming,
  past,
}: {
  waiting: LeaveRequestRow[];
  upcoming: LeaveRequestRow[];
  past: LeaveRequestRow[];
}) {
  const shownPast = past.slice(0, PAST_SHOWN);
  const olderPast = past.slice(PAST_SHOWN);
  return (
    <div className="grid gap-5">
      <Section title="Waiting for approval" count={waiting.length} empty="Nothing is waiting. New requests show here until you approve or reject them.">
        <ul className="divide-y divide-border">
          {waiting.map((r) => (
            <RequestRow key={r.id} r={r} />
          ))}
        </ul>
      </Section>
      <Section
        title="Upcoming and recent"
        count={upcoming.length}
        empty={
          <>
            No approved leave is on now or coming up. Press Record leave above when an employee asks for time off, then approve it here.
          </>
        }
      >
        <ul className="divide-y divide-border">
          {upcoming.map((r) => (
            <RequestRow key={r.id} r={r} />
          ))}
        </ul>
      </Section>
      <Section title="Past" count={past.length} empty="Older, rejected and cancelled requests will collect here.">
        <ul className="divide-y divide-border">
          {shownPast.map((r) => (
            <RequestRow key={r.id} r={r} />
          ))}
        </ul>
        {olderPast.length > 0 ? (
          <details className="group border-t border-border">
            <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm font-medium text-brand hover:bg-secondary/50 sm:px-5 [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">Show older ({olderPast.length})</span>
              <span className="hidden group-open:inline">Hide older</span>
            </summary>
            <ul className="divide-y divide-border border-t border-border">
              {olderPast.map((r) => (
                <RequestRow key={r.id} r={r} />
              ))}
            </ul>
          </details>
        ) : null}
      </Section>
    </div>
  );
}
