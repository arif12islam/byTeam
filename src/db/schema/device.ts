import {
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt, updatedAt } from "./columns";

/**
 * Serial number whitelist and health. Only devices listed here and marked
 * active are accepted on the /iclock routes.
 */
export const devices = pgTable("devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  serialNo: text("serial_no").notNull().unique(),
  name: text("name").notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Every punch exactly as the device sent it. Append-only: a database trigger
 * (see the raw_punches_append_only migration) refuses UPDATE and DELETE, so
 * the log can serve as its own audit trail. The unique key makes a resent
 * batch a no-op: insert with onConflictDoNothing.
 *
 * punched_at is the device clock read as Asia/Dhaka. emp_code is not a foreign
 * key on purpose: a punch from an unknown code is still kept and shown to HR
 * as unmatched.
 */
export const rawPunches = pgTable(
  "raw_punches",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    deviceSn: text("device_sn")
      .notNull()
      .references(() => devices.serialNo, { onDelete: "restrict" }),
    empCode: text("emp_code").notNull(),
    punchedAt: timestamp("punched_at", { withTimezone: true }).notNull(),
    /** Device status field: check in, check out and so on. Meaning varies by firmware. */
    statusCode: smallint("status_code"),
    /** How the person was verified: fingerprint, face, card, password. */
    verifyCode: smallint("verify_code"),
    rawLine: text("raw_line").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("raw_punches_device_emp_time_key").on(t.deviceSn, t.empCode, t.punchedAt),
    index("raw_punches_punched_at_idx").on(t.punchedAt),
    index("raw_punches_emp_code_idx").on(t.empCode),
  ],
);

export const DEVICE_COMMAND_STATUSES = ["pending", "sent", "done", "failed"] as const;
export type DeviceCommandStatus = (typeof DEVICE_COMMAND_STATUSES)[number];

export const deviceCommandStatus = pgEnum("device_command_status", DEVICE_COMMAND_STATUSES);

/**
 * Queue of commands for a device to pick up. The device polls for them and
 * reports each result by id, so the id is a plain number the device can echo
 * back, for example "C:12:DATA UPDATE USERINFO ...".
 */
export const deviceCommands = pgTable(
  "device_commands",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    deviceSn: text("device_sn")
      .notNull()
      .references(() => devices.serialNo, { onDelete: "restrict" }),
    command: text("command").notNull(),
    status: deviceCommandStatus("status").notNull().default("pending"),
    /** The device's return code or message when it reports back. */
    result: text("result"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: createdAt(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("device_commands_queue_idx").on(t.deviceSn, t.status, t.id)],
);
