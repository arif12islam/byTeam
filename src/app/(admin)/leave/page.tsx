import type { Metadata } from "next";

import Link from "next/link";

import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Leave" };

export default function LeavePage() {
  return (
    <>
      <PageHeader
        title="Leave"
        description="Record leave, approve it, and track what each employee has left."
        actions={
          <Link href="/leave/types" className={buttonVariants({ variant: "outline" })}>
            Leave types
          </Link>
        }
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
