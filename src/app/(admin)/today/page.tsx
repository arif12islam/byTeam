import type { Metadata } from "next";

import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <>
      <PageHeader
        title="Today"
        description="Who is in, who is late, and whether the device is online."
      />
      <ComingSoon
        milestone="M3"
        points={[
          "Present, late, absent and on leave counts for today",
          "First punch time for each employee",
          "Device status and unmatched punches",
        ]}
      />
    </>
  );
}
