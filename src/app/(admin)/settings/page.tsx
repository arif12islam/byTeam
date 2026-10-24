import type { Metadata } from "next";

import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Company details, working week, holidays and devices."
      />
      <ComingSoon
        milestone="M1 and M2"
        points={[
          "Weekly off days and public holidays",
          "Shifts with start time, end time and grace",
          "Attendance devices by serial number",
        ]}
      />
    </>
  );
}
