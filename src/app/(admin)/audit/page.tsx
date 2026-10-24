import type { Metadata } from "next";

import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Audit log" };

export default function AuditPage() {
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every manual change, approval and payroll action, with who made it."
      />
      <ComingSoon
        milestone="M6"
        points={[
          "Filter by person, action and date",
          "Before and after values for each change",
        ]}
      />
    </>
  );
}
