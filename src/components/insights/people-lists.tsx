import { Trophy, UserRoundSearch } from "lucide-react";
import Link from "next/link";

import { Card, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import type { PersonLine } from "@/lib/insights/summary";

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function Row({ person, detail }: { person: PersonLine; detail: string }) {
  return (
    <li>
      <Link href={person.href} className="flex min-h-12 items-center gap-3 py-2 hover:bg-secondary/60">
        <Avatar name={person.name} className="size-8 text-xs" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{person.name}</span>
          <span className="block text-xs text-muted-foreground">{detail}</span>
        </span>
      </Link>
    </li>
  );
}

/** Who has been on time every day, and who has had the most lates and absences. Names open the person's calendar. */
export function PeopleLists({ onTime, needsLook }: { onTime: readonly PersonLine[]; needsLook: readonly PersonLine[] }) {
  return (
    <>
      <Card>
        <CardTitle icon={Trophy}>Most on time</CardTitle>
        {onTime.length === 0 ? (
          <p className="mt-4 rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">Nobody yet. Names appear after a few on-time days.</p>
        ) : (
          <ul className="mt-1 divide-y divide-border">
            {onTime.map((p) => (
              <Row key={p.id} person={p} detail={`${plural(p.present, "day")} on time, none late or absent`} />
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardTitle icon={UserRoundSearch}>Most lates and absences</CardTitle>
        {needsLook.length === 0 ? (
          <p className="mt-4 rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">No lates or absences this month.</p>
        ) : (
          <ul className="mt-1 divide-y divide-border">
            {needsLook.map((p) => (
              <Row key={p.id} person={p} detail={[p.late > 0 ? plural(p.late, "late") : null, p.absent > 0 ? plural(p.absent, "absence") : null].filter(Boolean).join(", ")} />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
