import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Field } from "@/components/field";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { getDb } from "@/db";
import {
  AUDIT_PAGE_SIZE,
  changedFields,
  describeAuditAction,
  listAuditEntries,
  loadAuditFilterOptions,
  type AuditEntry,
  type AuditFilters,
} from "@/lib/audit-log";
import { requireRole } from "@/lib/session";
import { formatOfficeDateTime } from "@/lib/time";

export const metadata: Metadata = { title: "Audit log" };

export default function AuditPage(props: PageProps<"/audit">) {
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every manual change, approval and payroll action, with who made it. Nothing here can be edited."
      />
      <Suspense fallback={<p className="mt-6 text-sm text-muted-foreground">Loading the audit log</p>}>
        <AuditContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

const param = (value: string | string[] | undefined): string => (typeof value === "string" ? value.trim().slice(0, 100) : "");

/** The filters as a query string, for the paging links. */
function query(filters: AuditFilters, page: number): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) search.set(key, value);
  if (page > 1) search.set("page", String(page));
  const text = search.toString();
  return text ? `?${text}` : "";
}

function Changes({ entry }: { entry: AuditEntry }) {
  const changes = changedFields(entry.before, entry.after);
  if (changes.length === 0) return <p className="mt-2 text-sm text-muted-foreground">No field values were recorded for this entry.</p>;

  return (
    <dl className="mt-2 divide-y divide-border rounded-md border border-border text-sm">
      {changes.map((change) => (
        <div key={change.field} className="grid gap-1 px-3 py-2 sm:grid-cols-[10rem_1fr]">
          <dt className="break-words font-medium">{change.field}</dt>
          <dd className="min-w-0 break-words text-muted-foreground">
            {change.before !== null ? <span className="line-through">{truncate(change.before)}</span> : null}
            {change.before !== null && change.after !== null ? " to " : null}
            {change.after !== null ? <span className="text-foreground">{truncate(change.after)}</span> : null}
            {change.before === null && change.after === null ? "empty" : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function truncate(text: string, max = 240): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

async function AuditContent({ searchParams }: { searchParams: PageProps<"/audit">["searchParams"] }) {
  await requireRole("owner", "hr");

  const raw = await searchParams;
  const filters: AuditFilters = {
    actor: param(raw.actor) || undefined,
    action: param(raw.action) || undefined,
    entity: param(raw.entity) || undefined,
    record: param(raw.record) || undefined,
    from: param(raw.from) || undefined,
    to: param(raw.to) || undefined,
  };
  const requestedPage = Number(param(raw.page)) || 1;

  const db = getDb();
  const [options, result] = await Promise.all([loadAuditFilterOptions(db), listAuditEntries(db, filters, requestedPage)]);
  const filtered = Object.values(filters).some(Boolean);
  const first = result.total === 0 ? 0 : (result.page - 1) * AUDIT_PAGE_SIZE + 1;
  const last = Math.min(result.total, result.page * AUDIT_PAGE_SIZE);

  return (
    <div className="mt-6 grid max-w-4xl gap-6">
      <form method="get" className="rounded-lg border border-border bg-card p-5 md:p-6">
        <h2 className="text-base font-semibold">Filter</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Who" htmlFor="audit-actor">
            <Select id="audit-actor" name="actor" defaultValue={filters.actor ?? ""}>
              <option value="">Anyone</option>
              {options.hasSystem ? <option value="system">System (scripts)</option> : null}
              {options.actors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="What they did" htmlFor="audit-action">
            <Select id="audit-action" name="action" defaultValue={filters.action ?? ""}>
              <option value="">Anything</option>
              {options.actions.map((a) => (
                <option key={a} value={a}>
                  {describeAuditAction(a)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Kind of record" htmlFor="audit-entity">
            <Select id="audit-entity" name="entity" defaultValue={filters.entity ?? ""}>
              <option value="">Any</option>
              {options.entities.map((e) => (
                <option key={e} value={e}>
                  {e.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="One record" htmlFor="audit-record" hint="Paste a record id to see everything that happened to it.">
            <Input id="audit-record" name="record" defaultValue={filters.record ?? ""} maxLength={100} />
          </Field>
          <Field label="From" htmlFor="audit-from">
            <Input id="audit-from" name="from" type="date" defaultValue={filters.from ?? ""} />
          </Field>
          <Field label="To" htmlFor="audit-to">
            <Input id="audit-to" name="to" type="date" defaultValue={filters.to ?? ""} />
          </Field>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="submit">Show entries</Button>
          {filtered ? (
            <Link href="/audit" className={buttonVariants({ variant: "ghost" })}>
              Clear filters
            </Link>
          ) : null}
        </div>
      </form>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {result.total === 0 ? "No entries" : `Showing ${first} to ${last} of ${result.total} ${result.total === 1 ? "entry" : "entries"}`}
        {filtered ? " that match" : ""}.
      </p>

      {result.total === 0 ? (
        <p className="rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
          {filtered
            ? "Nothing matches these filters. Widen the dates or clear a filter."
            : "Nothing has been recorded yet. Changes made in byTeam appear here as they happen."}
        </p>
      ) : (
        <ul className="grid gap-3">
          {result.entries.map((entry) => (
            <li key={entry.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-sm font-semibold">{describeAuditAction(entry.action)}</p>
                <p className="text-xs text-muted-foreground">{formatOfficeDateTime(entry.createdAt)}</p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                By {entry.actorName ?? (entry.actorId ? "a removed user" : "the system")}. {entry.entity.replace(/_/g, " ")}{" "}
                <span className="font-mono text-xs" title={entry.entityId}>
                  {entry.entityId.length > 12 ? `${entry.entityId.slice(0, 8)}...` : entry.entityId}
                </span>
                {" "}
                <Link href={`/audit${query({ record: entry.entityId }, 1)}`} className="text-primary underline-offset-4 hover:underline">
                  See its history
                </Link>
              </p>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium">What changed</summary>
                <Changes entry={entry} />
              </details>
            </li>
          ))}
        </ul>
      )}

      {result.pages > 1 ? (
        <nav aria-label="Pages" className="flex flex-wrap items-center gap-3">
          {result.page > 1 ? (
            <Link href={`/audit${query(filters, result.page - 1)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Newer entries
            </Link>
          ) : null}
          <span className="text-sm text-muted-foreground">
            Page {result.page} of {result.pages}
          </span>
          {result.page < result.pages ? (
            <Link href={`/audit${query(filters, result.page + 1)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Older entries
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
