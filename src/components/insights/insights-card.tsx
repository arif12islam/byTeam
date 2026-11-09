import { Lightbulb } from "lucide-react";
import Link from "next/link";

import { FactList } from "@/components/insights/fact-list";
import { Card, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { factsForToday } from "@/lib/insights/facts";
import { getInsights } from "@/lib/insights/load";

/**
 * The few facts most worth a look, for the Today screen. It shows nothing at
 * all when there is nothing to say, and nothing when working the facts out
 * fails: Today must never break because of it. Reads the database, so render
 * it inside Suspense.
 */
export async function InsightsCard() {
  let facts;
  try {
    facts = factsForToday((await getInsights(getDb())).insights);
  } catch (error) {
    console.error("[insights] could not work out the facts", error);
    return null;
  }
  if (facts.length === 0) return null;

  return (
    <Card className="p-3 sm:p-3.5">
      <CardTitle
        icon={Lightbulb}
        action={
          <Link href="/insights" className="text-xs font-medium text-primary underline-offset-4 hover:underline">
            See all
          </Link>
        }
      >
        Worth a look
      </CardTitle>
      <FactList facts={facts} className="mt-1" />
    </Card>
  );
}
