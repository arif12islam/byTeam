import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import { formatTaka } from "@/lib/salary/money";
import { formatMonth, formatOfficeDate } from "@/lib/time";

import type { Payslip } from "./payslip";

// Built-in fonts only: the fixed set every PDF reader has, so nothing is downloaded or embedded.
const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1f2933" },
  company: { fontSize: 11, color: "#52606d" },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", marginTop: 2 },
  rule: { borderBottomWidth: 1, borderBottomColor: "#1E6B52", marginTop: 12, marginBottom: 14 },
  twoColumns: { flexDirection: "row", justifyContent: "space-between" },
  label: { color: "#52606d", marginBottom: 2 },
  value: { fontFamily: "Helvetica-Bold", marginBottom: 8 },
  heading: { fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 6, fontSize: 11 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: "#d9e2ec" },
  netRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, marginTop: 6, borderTopWidth: 1, borderTopColor: "#1E6B52" },
  net: { fontFamily: "Helvetica-Bold", fontSize: 13 },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, color: "#7b8794", fontSize: 8 },
});

/** "BDT 1,234.50", with lakh grouping like the screens. */
function money(amount: string): string {
  return `BDT ${formatTaka(amount)}`;
}

function PayslipPage({ slip }: { slip: Payslip }) {
  const { employee, days } = slip;
  return (
    <Page size="A4" style={styles.page}>
      {slip.company ? <Text style={styles.company}>{slip.company}</Text> : null}
      <Text style={styles.title}>Payslip, {formatMonth(slip.month)}</Text>
      <View style={styles.rule} />

      <View style={styles.twoColumns}>
        <View>
          <Text style={styles.label}>Employee</Text>
          <Text style={styles.value}>{employee.name}</Text>
          <Text style={styles.label}>Department</Text>
          <Text style={styles.value}>{employee.department ?? "Not set"}</Text>
        </View>
        <View>
          <Text style={styles.label}>Employee code</Text>
          <Text style={styles.value}>{employee.empCode}</Text>
          <Text style={styles.label}>Designation</Text>
          <Text style={styles.value}>{employee.designation ?? "Not set"}</Text>
        </View>
      </View>

      <Text style={styles.heading}>Attendance</Text>
      <View style={styles.row}>
        <Text>Days paid</Text>
        <Text>
          {days.paid} of {days.inMonth}
        </Text>
      </View>
      <View style={styles.row}>
        <Text>Absent days</Text>
        <Text>{days.absent}</Text>
      </View>
      <View style={styles.row}>
        <Text>Unpaid leave days</Text>
        <Text>{days.unpaidLeave}</Text>
      </View>
      <View style={styles.row}>
        <Text>Late arrivals</Text>
        <Text>{days.late}</Text>
      </View>

      <Text style={styles.heading}>Pay</Text>
      {slip.lines.map((line) => (
        <View key={line.code} style={styles.row}>
          <Text>{line.label}</Text>
          <Text>
            {line.sign === "-" ? "- " : ""}
            {money(line.amount)}
          </Text>
        </View>
      ))}
      <View style={styles.netRow}>
        <Text style={styles.net}>Net pay</Text>
        <Text style={styles.net}>{money(slip.net)}</Text>
      </View>
      <Text style={{ color: "#52606d", marginTop: 4 }}>Net pay is rounded to a whole taka.</Text>

      <Text style={styles.footer} fixed>
        Finalized on {formatOfficeDate(slip.finalizedOn)}, version {slip.version}. Made by byTeam.
      </Text>
    </Page>
  );
}

/** One page per payslip, as a PDF file. */
export async function renderPayslips(slips: readonly Payslip[]): Promise<Buffer> {
  return renderToBuffer(
    <Document title={slips.length === 1 ? `Payslip ${slips[0].employee.empCode} ${slips[0].month}` : `Payslips ${slips[0]?.month ?? ""}`} author="byTeam">
      {slips.map((slip) => (
        <PayslipPage key={slip.employee.empCode} slip={slip} />
      ))}
    </Document>,
  );
}
