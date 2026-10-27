import { statusLabel } from "@/lib/attendance/labels";
import { formatTaka } from "@/lib/salary/money";
import { formatMonth, formatOfficeDate, formatOfficeDateTime } from "@/lib/time";

/**
 * Audit log entries for people to read. The log stores records exactly as
 * they were saved, with database ids, field codes and UTC timestamps. These
 * functions turn them into labels and values a person understands: names for
 * ids, dates in office time, taka amounts and plain words for codes. They only
 * change how an entry is shown, never what was stored. Pure.
 */

/** Names for the ids an entry may point at, loaded for the entries on screen. */
export type AuditRefs = {
  employees: ReadonlyMap<string, { name: string; empCode: string }>;
  users: ReadonlyMap<string, string>;
  shifts: ReadonlyMap<string, string>;
  leaveTypes: ReadonlyMap<string, string>;
  /** Payroll run id to its month, YYYY-MM-DD. */
  payrollRuns: ReadonlyMap<string, string>;
};

export const NO_REFS: AuditRefs = {
  employees: new Map(),
  users: new Map(),
  shifts: new Map(),
  leaveTypes: new Map(),
  payrollRuns: new Map(),
};

type Kind =
  | "hidden"
  | "text"
  | "number"
  | "money"
  | "percent"
  | "date"
  | "month"
  | "instant"
  | "time"
  | "bool"
  | "minutes"
  | "days"
  | "weekdays"
  | "enum"
  | "employee"
  | "user"
  | "shift"
  | "leaveType"
  | "payrollRun"
  | "adjustedValue";

/**
 * Every field the app writes to the log, with its label and how to show its
 * value. A field missing here is still shown, with a label made from its name.
 */
const FIELDS: Record<string, { label: string; kind: Kind }> = {
  // Bookkeeping the entry itself already says (who, when), or nothing a person needs.
  id: { label: "Id", kind: "hidden" },
  createdAt: { label: "Created", kind: "hidden" },
  updatedAt: { label: "Updated", kind: "hidden" },
  createdBy: { label: "Created by", kind: "hidden" },
  computedAt: { label: "Computed", kind: "hidden" },
  ruleSetSnapshot: { label: "Pay rules used", kind: "hidden" },
  breakdown: { label: "Breakdown", kind: "hidden" },
  emailVerified: { label: "Email verified", kind: "hidden" },
  image: { label: "Picture", kind: "hidden" },
  clockOffsetSeconds: { label: "Clock offset", kind: "hidden" },
  clockCheckedAt: { label: "Clock checked", kind: "hidden" },

  // People and accounts
  name: { label: "Name", kind: "text" },
  empCode: { label: "Employee code", kind: "text" },
  department: { label: "Department", kind: "text" },
  designation: { label: "Designation", kind: "text" },
  joinDate: { label: "Joined", kind: "date" },
  exitDate: { label: "Left", kind: "date" },
  shiftId: { label: "Shift", kind: "shift" },
  active: { label: "Active", kind: "bool" },
  employeeId: { label: "Employee", kind: "employee" },
  email: { label: "Email", kind: "text" },
  role: { label: "Role", kind: "enum" },

  // Salary
  gross: { label: "Gross salary", kind: "money" },
  basicPct: { label: "Basic", kind: "percent" },
  housePct: { label: "House rent", kind: "percent" },
  medicalPct: { label: "Medical", kind: "percent" },
  conveyancePct: { label: "Conveyance", kind: "percent" },
  effectiveFrom: { label: "Starts", kind: "date" },

  // Payroll
  month: { label: "Month", kind: "month" },
  type: { label: "Kind", kind: "enum" },
  amount: { label: "Amount", kind: "money" },
  note: { label: "Note", kind: "text" },
  status: { label: "Status", kind: "enum" },
  version: { label: "Version", kind: "number" },
  finalizedBy: { label: "Finalized by", kind: "user" },
  finalizedAt: { label: "Finalized", kind: "instant" },
  employees: { label: "Employees", kind: "number" },
  skipped: { label: "Left out", kind: "number" },
  net: { label: "Net pay", kind: "money" },
  reason: { label: "Reason", kind: "text" },
  runId: { label: "Payroll", kind: "payrollRun" },

  // Pay rules, worded as on the Pay rules screen
  effectiveFromMonth: { label: "Starts in", kind: "month" },
  lateMode: { label: "Lates", kind: "enum" },
  lateEveryN: { label: "Lates that cost one day", kind: "number" },
  lateAmount: { label: "Each late costs", kind: "money" },
  deductionBase: { label: "A day of pay is worked out from", kind: "enum" },
  divisor: { label: "Divided by", kind: "enum" },
  unpaidLeaveAsAbsent: { label: "Unpaid leave deducted like absent days", kind: "bool" },

  // Shifts and settings
  startTime: { label: "Starts", kind: "time" },
  endTime: { label: "Ends", kind: "time" },
  graceMinutes: { label: "Grace", kind: "minutes" },
  weeklyOffDays: { label: "Weekly off days", kind: "weekdays" },
  leaveYearBasis: { label: "Leave year starts", kind: "enum" },
  currency: { label: "Currency", kind: "text" },
  timezone: { label: "Time zone", kind: "text" },
  date: { label: "Date", kind: "date" },

  // Leave
  leaveTypeId: { label: "Leave type", kind: "leaveType" },
  fromDate: { label: "From", kind: "date" },
  toDate: { label: "To", kind: "date" },
  days: { label: "Days", kind: "days" },
  unpaidDays: { label: "Unpaid days", kind: "days" },
  decidedBy: { label: "Decided by", kind: "user" },
  decidedAt: { label: "Decided", kind: "instant" },
  yearlyQuota: { label: "Days a year", kind: "days" },
  isPaid: { label: "Paid", kind: "bool" },

  // Devices
  serialNo: { label: "Serial number", kind: "text" },
  lastSeenAt: { label: "Last seen", kind: "instant" },
  queued: { label: "Commands queued", kind: "number" },

  // Attendance corrections
  firstIn: { label: "Arrival", kind: "instant" },
  lastOut: { label: "Leaving", kind: "instant" },
  isManual: { label: "Corrected by hand", kind: "bool" },
  field: { label: "What was corrected", kind: "enum" },
  newValue: { label: "New value", kind: "adjustedValue" },
};

/** Plain words for the codes stored in enum columns. */
const ENUM_LABELS: Record<string, string> = {
  ...statusLabel,
  // Bonuses and advances
  bonus: "Bonus",
  advance: "Advance",
  other_addition: "Other addition",
  other_deduction: "Other deduction",
  // Leave, payroll runs and device commands
  pending: "Waiting for a decision",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  draft: "Draft",
  finalized: "Finalized",
  sent: "Sent",
  done: "Done",
  failed: "Failed",
  // Pay rules
  none: "Lates cost nothing",
  days_per_lates: "Several lates cost one day",
  fixed_per_late: "Each late costs a fixed amount",
  gross: "Gross salary",
  basic: "Basic salary",
  working_days: "Working days in the month",
  month_days: "Days in the month",
  thirty: "30",
  // Settings and users
  calendar: "1 January each year",
  anniversary: "Each person's joining date",
  owner: "Admin",
  hr: "HR",
  // Attendance corrections
  first_in: "Arrival time",
  last_out: "Leaving time",
};

/** What kinds of record are called, for the filter and for entries. */
export const ENTITY_LABELS: Record<string, string> = {
  attendance_day: "Attendance day",
  company_settings: "Company settings",
  device: "Device",
  employee: "Employee",
  holiday: "Holiday",
  leave_request: "Leave",
  leave_type: "Leave type",
  office_outage: "Office outage",
  payroll_adjustment: "Bonus or advance",
  payroll_run: "Payroll",
  rule_set: "Pay rules",
  salary_structure: "Salary",
  shift: "Shift",
  user: "User",
};

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "someFieldName" as "Some field name", for a field this file does not know. */
function labelFromName(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_.]+/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function entityLabel(entity: string): string {
  return ENTITY_LABELS[entity] ?? labelFromName(entity);
}

function enumLabel(value: string): string {
  return ENUM_LABELS[value] ?? labelFromName(value);
}

/** An employee as "Anwar Hossain (9001)", or "an employee who was removed" when the id is unknown. */
export function employeeName(id: string, refs: AuditRefs): string {
  const person = refs.employees.get(id);
  return person ? `${person.name} (${person.empCode})` : "an employee no longer on record";
}

function userName(id: string, refs: AuditRefs): string {
  return refs.users.get(id) ?? "a removed user";
}

/** A YYYY-MM-DD date, or the first of a month, as "Oct 2026". */
function monthOf(value: string): string {
  return /^\d{4}-\d{2}/.test(value) ? formatMonth(value.slice(0, 7)) : value;
}

function isDateText(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function instantText(value: unknown): string | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? null : formatOfficeDateTime(instant);
}

/** Anything else as short text: numbers and words as they are, lists and objects as plain JSON. */
function plain(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/**
 * One field's value for people to read. `record` is the whole record the
 * value came from, for values whose meaning depends on another field (the new
 * value of an attendance correction depends on which field was corrected).
 */
export function formatAuditValue(
  field: string,
  value: unknown,
  refs: AuditRefs,
  record: Record<string, unknown> = {},
): string | null {
  if (value === null || value === undefined || value === "") return null;
  const kind = FIELDS[field]?.kind ?? "text";

  switch (kind) {
    case "money":
      return typeof value === "string" || typeof value === "number" ? `৳${formatTaka(String(value))}` : plain(value);
    case "percent":
      return `${Number(value)}%`;
    case "date":
      return isDateText(value) ? formatOfficeDate(value) : plain(value);
    case "month":
      return typeof value === "string" ? monthOf(value) : plain(value);
    case "instant":
      return instantText(value) ?? plain(value);
    case "time":
      return typeof value === "string" ? value.slice(0, 5) : plain(value);
    case "bool":
      return value === true ? "Yes" : value === false ? "No" : plain(value);
    case "minutes":
      return `${Number(value)} min`;
    case "days": {
      const n = Number(value);
      return `${n} ${n === 1 ? "day" : "days"}`;
    }
    case "weekdays":
      return Array.isArray(value)
        ? value.map((d) => WEEKDAY_NAMES[Number(d)] ?? String(d)).join(", ") || "None"
        : plain(value);
    case "enum":
      return typeof value === "string" ? enumLabel(value) : plain(value);
    case "employee":
      return typeof value === "string" ? employeeName(value, refs) : plain(value);
    case "user":
      return typeof value === "string" ? userName(value, refs) : plain(value);
    case "shift":
      return typeof value === "string" ? (refs.shifts.get(value) ?? "a removed shift") : plain(value);
    case "leaveType":
      return typeof value === "string" ? (refs.leaveTypes.get(value) ?? "a removed leave type") : plain(value);
    case "payrollRun": {
      const month = typeof value === "string" ? refs.payrollRuns.get(value) : undefined;
      return month ? `Payroll for ${monthOf(month)}` : "a removed payroll run";
    }
    case "adjustedValue":
      // A corrected status is a status code; a corrected time is an instant.
      if (record.field === "status" && typeof value === "string") return enumLabel(value);
      return instantText(value) ?? plain(value);
    default:
      return plain(value);
  }
}

/** Who the record is about comes first, then fields in the order listed above, then any unknown ones. */
const FIELD_ORDER = ["employeeId", ...Object.keys(FIELDS).filter((f) => f !== "employeeId")];
const orderOf = (field: string) => {
  const at = FIELD_ORDER.indexOf(field);
  return at === -1 ? FIELD_ORDER.length : at;
};

export type ReadableChange = { field: string; label: string; before: string | null; after: string | null };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * What an entry changed, for people to read. For a creation every shown field
 * of the new record is listed with nothing before it, for a deletion every
 * shown field of the old record, and for an update only the fields whose value
 * differs. Bookkeeping fields (ids, timestamps the entry already shows) are left out.
 */
export function readableChanges(before: unknown, after: unknown, refs: AuditRefs): ReadableChange[] {
  const b = isRecord(before) ? before : {};
  const a = isRecord(after) ? after : {};

  const changes: ReadableChange[] = [];
  for (const field of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (FIELDS[field]?.kind === "hidden") continue;
    // Compare what was stored, so a value that only formats the same is still a change.
    if (JSON.stringify(b[field] ?? null) === JSON.stringify(a[field] ?? null)) continue;
    changes.push({
      field,
      label: FIELDS[field]?.label ?? labelFromName(field),
      before: formatAuditValue(field, b[field], refs, b),
      after: formatAuditValue(field, a[field], refs, a),
    });
  }
  return changes.sort((x, y) => orderOf(x.field) - orderOf(y.field));
}

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

/**
 * A short name for the record an entry is about, like "Advance of ৳15,000.00
 * for Anwar Hossain (9001), Oct 2026" or "Day shift". Built from the record as
 * logged (the newer copy when there are two), with names looked up for ids.
 */
export function describeAuditRecord(
  entry: { entity: string; entityId: string; before: unknown; after: unknown },
  refs: AuditRefs,
): string {
  const after = isRecord(entry.after) ? entry.after : {};
  const before = isRecord(entry.before) ? entry.before : {};
  const r: Record<string, unknown> = { ...before, ...after };
  const person = text(r.employeeId) ? employeeName(r.employeeId as string, refs) : null;

  switch (entry.entity) {
    case "employee":
      return text(r.name) ? `${r.name}${text(r.empCode) ? ` (${r.empCode})` : ""}` : employeeName(entry.entityId, refs);
    case "payroll_adjustment": {
      const kind = text(r.type) ? enumLabel(r.type as string) : "Bonus or advance";
      const amount = formatAuditValue("amount", r.amount, refs);
      const month = text(r.month) ? monthOf(r.month as string) : null;
      return [`${kind}${amount ? ` of ${amount}` : ""}${person ? ` for ${person}` : ""}`, month].filter(Boolean).join(", ");
    }
    case "payroll_run": {
      const month = text(r.month) ? (r.month as string) : refs.payrollRuns.get(entry.entityId);
      return month ? `Payroll for ${monthOf(month)}` : "Payroll";
    }
    case "salary_structure": {
      const from = isDateText(r.effectiveFrom) ? formatOfficeDate(r.effectiveFrom) : null;
      return `Salary${person ? ` of ${person}` : ""}${from ? ` from ${from}` : ""}`;
    }
    case "leave_request": {
      const kind = text(r.leaveTypeId) ? (refs.leaveTypes.get(r.leaveTypeId as string) ?? "Leave") : "Leave";
      const from = isDateText(r.fromDate) ? formatOfficeDate(r.fromDate) : null;
      const to = isDateText(r.toDate) ? formatOfficeDate(r.toDate) : null;
      const span = from && to ? (from === to ? from : `${from} to ${to}`) : null;
      return [`${kind}${person ? ` for ${person}` : ""}`, span].filter(Boolean).join(", ");
    }
    case "leave_type":
    case "shift":
      return text(r.name) ?? entityLabel(entry.entity);
    case "device":
      return text(r.name) ? `${r.name}${text(r.serialNo) ? ` (${r.serialNo})` : ""}` : (text(r.serialNo) ?? "Device");
    case "holiday": {
      const day = isDateText(r.date) ? formatOfficeDate(r.date) : null;
      return [text(r.name) ?? "Holiday", day].filter(Boolean).join(", ");
    }
    case "office_outage": {
      const day = isDateText(r.date) ? formatOfficeDate(r.date) : null;
      const span = text(r.startTime) && text(r.endTime) ? `${String(r.startTime).slice(0, 5)} to ${String(r.endTime).slice(0, 5)}` : null;
      return ["Office outage", day, span].filter(Boolean).join(", ");
    }
    case "rule_set":
      return text(r.effectiveFromMonth) ? `Pay rules from ${monthOf(r.effectiveFromMonth as string)}` : "Pay rules";
    case "company_settings":
      return "Company settings";
    case "user":
      return text(r.name) ? `${r.name}${text(r.email) ? ` (${r.email})` : ""}` : userName(entry.entityId, refs);
    case "attendance_day": {
      // Logged as "<employee id>:<YYYY-MM-DD>".
      const cut = entry.entityId.lastIndexOf(":");
      const employeeId = cut > 0 ? entry.entityId.slice(0, cut) : entry.entityId;
      const date = cut > 0 ? entry.entityId.slice(cut + 1) : "";
      return [employeeName(employeeId, refs), isDateText(date) ? formatOfficeDate(date) : null].filter(Boolean).join(", ");
    }
    default:
      return entityLabel(entry.entity);
  }
}

/** The ids an entry points at, so their names can be loaded in one go for a page of entries. */
export function referencedIds(entries: readonly { entity: string; entityId: string; before: unknown; after: unknown }[]): {
  employees: string[];
  users: string[];
  shifts: string[];
  leaveTypes: string[];
  payrollRuns: string[];
} {
  const ids = { employees: new Set<string>(), users: new Set<string>(), shifts: new Set<string>(), leaveTypes: new Set<string>(), payrollRuns: new Set<string>() };
  const bucket: Partial<Record<Kind, Set<string>>> = {
    employee: ids.employees,
    user: ids.users,
    shift: ids.shifts,
    leaveType: ids.leaveTypes,
    payrollRun: ids.payrollRuns,
  };

  for (const entry of entries) {
    if (entry.entity === "employee") ids.employees.add(entry.entityId);
    if (entry.entity === "payroll_run") ids.payrollRuns.add(entry.entityId);
    if (entry.entity === "user") ids.users.add(entry.entityId);
    if (entry.entity === "attendance_day") {
      const cut = entry.entityId.lastIndexOf(":");
      if (cut > 0) ids.employees.add(entry.entityId.slice(0, cut));
    }
    for (const record of [entry.before, entry.after]) {
      if (!isRecord(record)) continue;
      for (const [field, value] of Object.entries(record)) {
        const set = bucket[FIELDS[field]?.kind ?? "text"];
        if (set && typeof value === "string" && value !== "") set.add(value);
      }
    }
  }
  return {
    employees: [...ids.employees],
    users: [...ids.users],
    shifts: [...ids.shifts],
    leaveTypes: [...ids.leaveTypes],
    payrollRuns: [...ids.payrollRuns],
  };
}
