"use client";

import { Search } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { matchesPerson } from "@/lib/people-filter";

/**
 * A search box and an optional department list above server-rendered people.
 * Every person element carries `data-person` (their id), `data-name` and
 * `data-department`. Filtering only hides elements, so nothing is reordered,
 * nothing is re-rendered and the page is exactly as tall as before until
 * someone types. `people` is the number of distinct people on the page.
 */
export function PeopleFilter({
  departments = [],
  label = "Search people",
  children,
}: {
  departments?: readonly string[];
  label?: string;
  children: React.ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [shown, setShown] = useState<number | null>(null);

  function apply(nextQuery: string, nextDepartment: string) {
    setQuery(nextQuery);
    setDepartment(nextDepartment);
    const matched = new Set<string>();
    for (const el of root.current?.querySelectorAll<HTMLElement>("[data-person]") ?? []) {
      const match = matchesPerson({ name: el.dataset.name ?? "", department: el.dataset.department ?? "" }, nextQuery, nextDepartment);
      el.hidden = !match;
      if (match && el.dataset.person) matched.add(el.dataset.person);
    }
    setShown(nextQuery.trim() === "" && nextDepartment === "" ? null : matched.size);
  }

  const nobody = shown === 0;

  return (
    <div ref={root} className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-full flex-1 sm:min-w-0 sm:max-w-xs">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label={label}
            placeholder="Search by name"
            value={query}
            onChange={(e) => apply(e.target.value, department)}
            className="pl-9"
          />
        </div>
        {departments.length > 0 ? (
          <Select aria-label="Department" value={department} onChange={(e) => apply(query, e.target.value)} className="w-auto max-w-full sm:w-52">
            <option value="">All departments</option>
            {departments.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        ) : null}
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {shown === null ? "" : `${shown} shown`}
        </p>
      </div>
      {nobody ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
          <p>Nobody matches.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => apply("", "")}>
            Show everyone
          </Button>
        </div>
      ) : null}
      {children}
    </div>
  );
}
