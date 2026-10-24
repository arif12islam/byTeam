import type { Metadata } from "next";

import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Pay rules" };

export default function RulesPage() {
  return (
    <>
      <PageHeader
        title="Pay rules"
        description="How lates, absences and unpaid leave affect salary."
      />
      <ComingSoon
        milestone="M5"
        points={[
          "Grace minutes and late policy",
          "Deduction base and divisor for an absent day",
          "Each rule set applies from a chosen month",
        ]}
      />
    </>
  );
}
