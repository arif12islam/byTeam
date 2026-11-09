"use client";

import { Download } from "lucide-react";
import { useActionState, useState } from "react";

import { Field, FormMessage, type FormState } from "@/components/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { Candidate, HolidayPreviewState } from "@/lib/settings/holiday-import";
import { formatOfficeDate } from "@/lib/time";

import { importHolidaysAction, previewHolidaysAction } from "./actions";

/**
 * Import a year of public holidays in two steps: see the list first, tick what
 * to add, then add. Nothing is saved until the second step.
 */
export function HolidayImport({ years }: { years: number[] }) {
  const [preview, previewAction, previewing] = useActionState<HolidayPreviewState, FormData>(previewHolidaysAction, {});
  const [source, setSource] = useState<"google" | "paste">("google");

  return (
    <details className="group rounded-md border border-border">
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <Download aria-hidden className="size-4" />
        Import public holidays
        <span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">From Google&apos;s calendar or a list</span>
      </summary>
      <div className="space-y-5 border-t border-border p-3">
        <form action={previewAction} className="space-y-4">
          <fieldset>
            <legend className="text-sm font-medium">Where from</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["google", "Google's calendar", "Bangladesh public holidays, fetched now"],
                  ["paste", "Paste a list", "One holiday a line, like 2026-12-16 Victory Day"],
                ] as const
              ).map(([value, label, hint]) => (
                <label key={value} className="flex min-h-10 cursor-pointer items-start gap-2 rounded-md border border-input bg-card p-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent">
                  <input type="radio" name="source" value={value} checked={source === value} onChange={() => setSource(value)} className="mt-0.5 size-4 accent-primary" />
                  <span>
                    <span className="font-medium">{label}</span>
                    <span className="block text-xs text-muted-foreground">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            <Field label="Year" htmlFor="holiday-import-year">
              <Select id="holiday-import-year" name="year" defaultValue={String(years[0])}>
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </Select>
            </Field>
            {source === "paste" ? (
              <Field label="Your list" htmlFor="holiday-import-text" hint="Dates like 2026-12-16, 16/12/2026 or 16 Dec 2026, then the name.">
                <textarea
                  id="holiday-import-text"
                  name="text"
                  rows={6}
                  className="block w-full rounded-md border border-input bg-card px-3 py-2 text-base shadow-xs sm:text-sm"
                  placeholder={"2026-12-16 Victory Day\n2026-12-25 Christmas Day"}
                />
              </Field>
            ) : (
              <p className="self-end text-xs text-muted-foreground">Google&apos;s calendar is a guide, not the government&apos;s list. Eid and other moon dates move, so check each one.</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" pending={previewing}>
              Show the list
            </Button>
            {preview.error ? (
              <p role="alert" className="text-sm text-destructive">
                {preview.error}
              </p>
            ) : null}
          </div>
        </form>

        {preview.candidates ? (
          <HolidayPicker key={preview.candidates.map((c) => c.date).join()} candidates={preview.candidates} year={preview.year ?? 0} problems={preview.problems ?? []} />
        ) : null}
      </div>
    </details>
  );
}

function Row({ item, checked, onChange }: { item: Candidate; checked: boolean; onChange: (on: boolean) => void }) {
  const disabled = item.alreadyAdded;
  return (
    <li>
      <label className={`flex min-h-11 items-start gap-3 px-3 py-2 ${disabled ? "opacity-60" : "cursor-pointer"}`}>
        <input
          type="checkbox"
          name="pick"
          value={JSON.stringify({ date: item.date, name: item.name })}
          checked={checked && !disabled}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-1 size-4 accent-primary"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{item.name}</span>
          <span className="block text-xs text-muted-foreground">{formatOfficeDate(item.date)}</span>
        </span>
        <span className="flex flex-wrap justify-end gap-1">
          {item.alreadyAdded ? <Badge>Already added</Badge> : null}
          {item.onWeeklyOff ? <Badge>Weekly off day</Badge> : null}
          {item.past && !item.alreadyAdded ? <Badge tone="warning">Before today</Badge> : null}
        </span>
      </label>
    </li>
  );
}

function HolidayPicker({ candidates, year, problems }: { candidates: Candidate[]; year: number; problems: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(importHolidaysAction, {});
  const [checked, setChecked] = useState<Set<string>>(() => new Set(candidates.filter((c) => c.selected).map((c) => c.date)));

  const days = candidates.filter((c) => c.kind === "holiday");
  const others = candidates.filter((c) => c.kind === "observance");
  const count = candidates.filter((c) => checked.has(c.date) && !c.alreadyAdded).length;
  const pastTicked = candidates.some((c) => c.past && checked.has(c.date) && !c.alreadyAdded);
  const toggle = (date: string, on: boolean) =>
    setChecked((current) => {
      const next = new Set(current);
      if (on) next.add(date);
      else next.delete(date);
      return next;
    });

  const group = (title: string, hint: string, list: Candidate[]) =>
    list.length === 0 ? null : (
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="mb-2 text-xs text-muted-foreground">{hint}</p>
        <ul className="divide-y divide-border rounded-md border border-border">
          {list.map((item) => (
            <Row key={item.date} item={item} checked={checked.has(item.date)} onChange={(on) => toggle(item.date, on)} />
          ))}
        </ul>
      </div>
    );

  return (
    <form action={action} className="space-y-4 border-t border-border pt-4">
      <p className="text-sm text-muted-foreground">
        {candidates.length} dates for {year}. Public holidays that are still to come are ticked. Untick any that is not a day off for your office.
      </p>
      {problems.length > 0 ? (
        <p className="rounded-md border border-dashed border-input p-3 text-xs text-muted-foreground">
          {problems.length === 1 ? "1 line" : `${problems.length} lines`} could not be read and were left out: {problems.slice(0, 3).join("; ")}
          {problems.length > 3 ? "..." : ""}
        </p>
      ) : null}
      {group("Public holidays", "Days Google lists as public holidays.", days)}
      {group("Other observances", "Festivals and special days. Usually not days off, so these start unticked.", others)}
      {pastTicked ? (
        <p role="status" className="rounded-md border border-border bg-secondary/60 p-3 text-xs">
          Some ticked dates are before today. Adding them changes days that were already counted, for example from absent to a holiday. Months with finalized payroll stay as they are.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" pending={pending} disabled={count === 0}>
          {count === 0 ? "Add holidays" : `Add ${count} ${count === 1 ? "holiday" : "holidays"}`}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
