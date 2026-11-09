import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import { periodLabel } from "@/lib/period";
import { formatDuration, formatOfficeDate } from "@/lib/time";

import { cellText } from "./labels";
import type { GridRow, PeriodGrid } from "./month";

/** A day grid fits a landscape page up to a month. A longer period gets the totals table only. */
export const MAX_GRID_DAYS = 31;

// Built-in fonts only, like the payslip: nothing is downloaded or embedded.
const ink = "#18181b";
const muted = "#71717a";
const line = "#e4e4e7";
const tint = {
  L: "#fef3c7",
  A: "#fee2e2",
  PL: "#dbeafe",
  UL: "#dbeafe",
  W: "#f4f4f5",
  H: "#f4f4f5",
} as const;

const styles = StyleSheet.create({
  page: { paddingTop: 32, paddingBottom: 40, paddingHorizontal: 28, fontSize: 8, fontFamily: "Helvetica", color: ink },
  company: { fontSize: 9, color: muted },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginTop: 2 },
  sub: { color: muted, marginTop: 3, marginBottom: 10 },
  heading: { fontFamily: "Helvetica-Bold", fontSize: 10, marginTop: 6, marginBottom: 6 },
  headRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: ink, paddingVertical: 3 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: line, minHeight: 14, alignItems: "center" },
  th: { fontFamily: "Helvetica-Bold", color: muted },
  cell: { paddingHorizontal: 2 },
  right: { textAlign: "right" },
  center: { textAlign: "center" },
  legend: { color: muted, marginTop: 8, fontSize: 7 },
  footer: { position: "absolute", bottom: 18, left: 28, right: 28, flexDirection: "row", justifyContent: "space-between", color: muted, fontSize: 7 },
});

/**
 * The built-in fonts only cover Latin letters. Anything else (for example
 * Bangla letters in a name) would print as junk, so it becomes a question mark.
 */
export function pdfText(value: string | null | undefined): string {
  return (value ?? "").replace(/[^\u0020-\u007E\u00A0-\u00FF\u2018\u2019\u201C\u201D\u2013\u2014\u2022]/g, "?");
}

type Options = {
  company: string;
  trackLeavingPunch: boolean;
  /** For example "Filtered: department Sales." */
  filterNote: string | null;
  /** The office date the file was made on. */
  madeOn: string;
};

function Footer({ madeOn }: { madeOn: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>Made by byTeam on {formatOfficeDate(madeOn)}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

function Heading({ grid, options, title }: { grid: PeriodGrid; options: Options; title: string }) {
  return (
    <View>
      {options.company ? <Text style={styles.company}>{pdfText(options.company)}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.sub}>
        {periodLabel({ from: grid.from, to: grid.to })}, {grid.rows.length === 1 ? "1 employee" : `${grid.rows.length} employees`}
        {options.filterNote ? `. ${pdfText(options.filterNote)}` : ""}
      </Text>
    </View>
  );
}

const SUMMARY_WIDTHS = { code: 40, name: 150, department: 110, number: 46, late: 62, leaving: 70 };

function columnWidth(heading: string): number {
  return heading === "No leaving punch" ? SUMMARY_WIDTHS.leaving : heading === "Late time" ? SUMMARY_WIDTHS.late : SUMMARY_WIDTHS.number;
}

function SummaryPage({ grid, options }: { grid: PeriodGrid; options: Options }) {
  const numbers = ["Present", "Late", "Absent", "Leave", "Late time", ...(options.trackLeavingPunch ? ["No leaving punch"] : []), "Off day work"];
  const values = (row: GridRow) => [
    row.totals.present,
    row.totals.late,
    row.totals.absent,
    row.totals.leave,
    row.totals.lateMinutes > 0 ? formatDuration(row.totals.lateMinutes) : "-",
    ...(options.trackLeavingPunch ? [row.totals.missingOut] : []),
    row.totals.workedOffDays,
  ];

  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Heading grid={grid} options={options} title="Attendance summary" />
      <View style={styles.headRow} fixed>
        <Text style={[styles.th, styles.cell, { width: SUMMARY_WIDTHS.code }]}>Code</Text>
        <Text style={[styles.th, styles.cell, { width: SUMMARY_WIDTHS.name }]}>Name</Text>
        <Text style={[styles.th, styles.cell, { width: SUMMARY_WIDTHS.department }]}>Department</Text>
        {numbers.map((heading) => (
          <Text key={heading} style={[styles.th, styles.cell, styles.right, { width: columnWidth(heading) }]}>
            {heading}
          </Text>
        ))}
      </View>
      {grid.rows.map((row) => (
        <View key={row.employee.id} style={styles.row} wrap={false}>
          <Text style={[styles.cell, { width: SUMMARY_WIDTHS.code }]}>{pdfText(row.employee.empCode)}</Text>
          <Text style={[styles.cell, { width: SUMMARY_WIDTHS.name }]}>{pdfText(row.employee.name)}</Text>
          <Text style={[styles.cell, { width: SUMMARY_WIDTHS.department }]}>{pdfText(row.employee.department)}</Text>
          {values(row).map((value, i) => (
            <Text key={numbers[i]} style={[styles.cell, styles.right, { width: columnWidth(numbers[i]) }]}>
              {value}
            </Text>
          ))}
        </View>
      ))}
      {grid.rows.length === 0 ? <Text style={styles.sub}>Nobody matches these filters.</Text> : null}
      <Text style={styles.legend}>Present counts late days too. Late time is the minutes after the shift start, added up.</Text>
      <Footer madeOn={options.madeOn} />
    </Page>
  );
}

function GridPage({ grid, options }: { grid: PeriodGrid; options: Options }) {
  const dayWidth = 17;
  const totals = ["P", "L", "A", "Lv"];
  return (
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Heading grid={grid} options={options} title="Attendance by day" />
      <View style={styles.headRow} fixed>
        <Text style={[styles.th, styles.cell, { width: 130 }]}>Name</Text>
        {grid.dates.map((date) => (
          <Text key={date} style={[styles.th, styles.center, { width: dayWidth }]}>
            {Number(date.slice(8))}
          </Text>
        ))}
        {totals.map((heading) => (
          <Text key={heading} style={[styles.th, styles.right, { width: 24 }]}>
            {heading}
          </Text>
        ))}
      </View>
      {grid.rows.map((row) => (
        <View key={row.employee.id} style={styles.row} wrap={false}>
          <Text style={[styles.cell, { width: 130 }]}>{pdfText(row.employee.name)}</Text>
          {grid.dates.map((date) => {
            const cell = row.cells.get(date);
            const code = cell ? cellText(cell) : "";
            const background = cell ? tint[code.replace(/[!*]/g, "") as keyof typeof tint] : undefined;
            return (
              <Text key={date} style={[styles.center, { width: dayWidth, paddingVertical: 2, backgroundColor: background }]}>
                {options.trackLeavingPunch ? code : code.replace("!", "")}
              </Text>
            );
          })}
          {[row.totals.present, row.totals.late, row.totals.absent, row.totals.leave].map((value, i) => (
            <Text key={totals[i]} style={[styles.right, { width: 24 }]}>
              {value}
            </Text>
          ))}
        </View>
      ))}
      <Text style={styles.legend}>
        P present, L late, A absent, PL paid leave, UL unpaid leave, W weekly off day, H holiday. {options.trackLeavingPunch ? "! no leaving punch, " : ""}* corrected by hand. Totals: P present
        (late days included), L late, A absent, Lv leave.
      </Text>
      <Footer madeOn={options.madeOn} />
    </Page>
  );
}

/**
 * The attendance as a PDF in landscape: a totals table, and for a period of up
 * to a month a day by day grid after it.
 */
export async function renderAttendancePdf(grid: PeriodGrid, options: Options): Promise<Buffer> {
  const label = periodLabel({ from: grid.from, to: grid.to });
  return renderToBuffer(
    <Document title={`Attendance ${label}`} author="byTeam">
      <SummaryPage grid={grid} options={options} />
      {grid.dates.length <= MAX_GRID_DAYS && grid.rows.length > 0 ? <GridPage grid={grid} options={options} /> : null}
    </Document>,
  );
}
