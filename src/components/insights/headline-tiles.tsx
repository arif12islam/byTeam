import { CalendarCheck, Clock, UserCheck, UserX } from "lucide-react";

import { StatTile } from "@/components/ui/stat-tile";
import { formatRate } from "@/lib/reports/attendance-report";
import { deltaText, type Headline } from "@/lib/insights/summary";

/** Four numbers for the month so far. The dot shows only when a number is worse than at this point last month. */
export function HeadlineTiles({ headline: h }: { headline: Headline }) {
  const worse = (now: number, then: number) => h.compare && now > then;
  const t = h.today;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile
        label="Attendance"
        icon={UserCheck}
        value={formatRate(h.rate)}
        tone={h.compare && h.rate !== null && h.ratePrev !== null && h.rate < h.ratePrev ? "warning" : "neutral"}
        hint={h.rate === null ? "No working days yet this month" : h.compare && h.ratePrev !== null ? `${formatRate(h.ratePrev)} at this point last month` : "This month so far"}
      />
      <StatTile
        label="Lates"
        icon={Clock}
        value={h.lates}
        tone={worse(h.lates, h.latesPrev) ? "warning" : "neutral"}
        hint={deltaText(h.lates, h.latesPrev, h.compare) ?? "This month so far"}
      />
      <StatTile
        label="Absences"
        icon={UserX}
        value={h.absences}
        tone={worse(h.absences, h.absencesPrev) ? "danger" : "neutral"}
        hint={deltaText(h.absences, h.absencesPrev, h.compare) ?? "Before today"}
      />
      <StatTile
        label="In today"
        icon={CalendarCheck}
        value={t.kind === "day-off" ? "Day off" : t.kind === "no-records" ? "-" : `${t.inOffice} of ${t.due}`}
        hint={t.kind === "open" ? (t.onLeave > 0 ? `${t.onLeave} on leave` : "Punched in so far") : t.kind === "day-off" ? "No one is due in" : "No records yet"}
      />
    </div>
  );
}
