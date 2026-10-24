import type { Metadata } from "next";

import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Leave" };

export default function LeavePage() {
  return (
    <>
      <PageHeader
        title="Leave"
        description="Record leave, approve it, and track what each employee has left."
      />
      <ComingSoon
        milestone="M4"
        points={[
          "Casual, sick, annual and unpaid leave with yearly quotas",
          "Approve or reject requests",
          "Approved leave replaces absent days automatically",
        ]}
      />
    </>
  );
}
