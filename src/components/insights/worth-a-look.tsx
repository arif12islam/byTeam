import { Lightbulb } from "lucide-react";

import { FactList } from "@/components/insights/fact-list";
import { Card, CardTitle } from "@/components/ui/card";
import type { Fact } from "@/lib/insights/facts";

/** How many facts show before "Show all". */
const FIRST = 6;

/** The ranked facts: the first few in view, the rest behind one tap. */
export function WorthALook({ facts }: { facts: readonly Fact[] }) {
  const first = facts.slice(0, FIRST);
  const rest = facts.slice(FIRST);
  return (
    <Card>
      <CardTitle icon={Lightbulb} count={facts.length || undefined}>
        Worth a look
      </CardTitle>
      {facts.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
          Nothing unusual so far. Facts appear as the month builds up, for example when lates go up, someone forgets to punch out, or the device goes quiet.
        </p>
      ) : (
        <>
          <FactList facts={first} rich className="mt-1" />
          {rest.length > 0 ? (
            <details className="group border-t border-border">
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-primary underline-offset-4 hover:underline group-open:hidden">
                Show {rest.length} more
              </summary>
              <FactList facts={rest} rich />
            </details>
          ) : null}
        </>
      )}
    </Card>
  );
}
