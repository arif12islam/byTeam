import { Avatar } from "@/components/ui/avatar";
import type { Balance } from "@/lib/leave/balances";
import { cn } from "@/lib/utils";

type Person = { id: string; name: string; empCode: string; department: string | null };
type LeaveType = { id: string; name: string };

/** The wording and bar for one person and one leave type. */
export function describeBalance(balance: Balance | undefined) {
  if (!balance) return null;
  const limited = balance.quota !== null && balance.remaining !== null;
  return {
    limited,
    text: limited ? `${balance.remaining} of ${balance.quota} left` : `${balance.used} taken`,
    over: limited && balance.remaining! < 0,
    share: limited && balance.quota! > 0 ? Math.min(1, balance.used / balance.quota!) : 0,
    used: balance.used,
    quota: balance.quota,
    pending: balance.pending,
  };
}

function UsedBar({ name, info }: { name: string; info: NonNullable<ReturnType<typeof describeBalance>> }) {
  if (!info.limited) return null;
  return (
    <div
      role="meter"
      aria-label={`${name} used`}
      aria-valuemin={0}
      aria-valuemax={info.quota!}
      aria-valuenow={Math.min(info.used, info.quota!)}
      className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
    >
      <div className={cn("h-full rounded-full", info.over ? "bg-danger" : "bg-brand")} style={{ width: `${info.share * 100}%` }} />
    </div>
  );
}

function Cell({ name, balance }: { name: string; balance: Balance | undefined }) {
  const info = describeBalance(balance);
  if (!info) return <span className="text-muted-foreground">-</span>;
  return (
    <div className="min-w-28">
      <p className={cn("text-sm tabular-nums", info.over ? "font-semibold text-danger" : "font-medium")}>{info.text}</p>
      <UsedBar name={name} info={info} />
      {info.pending > 0 ? <p className="mt-1 text-xs text-muted-foreground">{info.pending} waiting</p> : null}
    </div>
  );
}

/**
 * Balances: a table on wide screens with a column per leave type, and a card
 * per person on phones. Both carry the same `data-person` marks so the search
 * box above can hide people in either.
 */
export function BalancesTab({
  people,
  types,
  balanceOf,
  basisNote,
}: {
  people: Person[];
  types: LeaveType[];
  balanceOf: Map<string, Balance>;
  basisNote: string;
}) {
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{basisNote} Only approved leave is taken off. Weekly off days and holidays are not counted.</p>

      <div className="hidden max-h-[75vh] overflow-auto rounded-xl border border-border bg-card shadow-card md:block">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_var(--border)]">
            <tr className="text-left text-muted-foreground">
              <th scope="col" className="sticky left-0 z-20 min-w-48 bg-card px-4 py-3 font-medium">
                Employee
              </th>
              {types.map((t) => (
                <th key={t.id} scope="col" className="px-4 py-3 font-medium">
                  {t.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr
                key={p.id}
                data-person={p.id}
                data-name={p.name}
                data-department={p.department ?? ""}
                className="border-b border-border bg-card last:border-b-0 even:bg-[color-mix(in_srgb,var(--muted)_40%,var(--card))]"
              >
                <th scope="row" className="sticky left-0 z-10 bg-inherit px-4 py-3 text-left font-normal">
                  <div className="flex items-center gap-3">
                    <Avatar name={p.name} className="size-9" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{p.name}</p>
                      <p className="text-xs text-muted-foreground">Code {p.empCode}</p>
                    </div>
                  </div>
                </th>
                {types.map((t) => (
                  <td key={t.id} className="px-4 py-3 align-top">
                    <Cell name={t.name} balance={balanceOf.get(`${p.id}|${t.id}`)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="grid gap-3 md:hidden">
        {people.map((p) => (
          <li key={p.id} data-person={p.id} data-name={p.name} data-department={p.department ?? ""} className="rounded-xl border border-border bg-card p-4 shadow-card">
            <div className="flex items-center gap-3">
              <Avatar name={p.name} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{p.name}</p>
                <p className="text-xs text-muted-foreground">Code {p.empCode}</p>
              </div>
            </div>
            <ul className="mt-4 grid gap-4">
              {types.map((t) => {
                const info = describeBalance(balanceOf.get(`${p.id}|${t.id}`));
                if (!info) return null;
                return (
                  <li key={t.id}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-muted-foreground">{t.name}</span>
                      <span className={cn("shrink-0 font-medium tabular-nums", info.over && "font-semibold text-danger")}>{info.text}</span>
                    </div>
                    <UsedBar name={t.name} info={info} />
                    {info.pending > 0 ? <p className="mt-1 text-xs text-muted-foreground">{info.pending} waiting for approval</p> : null}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
