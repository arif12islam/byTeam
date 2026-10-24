import type { Metadata } from "next";

import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Attendance" };

export default function AttendancePage() {
  return (
    <>
      <PageHeader
        title="Attendance"
        description="Monthly attendance for every employee, built from device punches."
      />
      <ComingSoon
        milestone="M3"
        points={[
          "Calendar grid per employee with late, early leave and absent marks",
          "Raw punches behind each day",
          "Manual corrections with a reason",
          "Excel export",
        ]}
      />
    </>
  );
}
