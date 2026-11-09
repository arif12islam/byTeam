import { boolean, index, pgTable, smallint, text, timestamp, uuid, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { createdAt } from "./columns";
import { users } from "./setup";

/**
 * Push notifications (src/lib/notifications). One row per phone or browser
 * that turned them on: the address the push service gave it, the keys that
 * encrypt what is sent to it, and which alerts that device wants.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    onOffline: boolean("on_offline").notNull().default(true),
    onSummary: boolean("on_summary").notNull().default(true),
    onUnmatched: boolean("on_unmatched").notNull().default(true),
    createdAt: createdAt(),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
  },
  (t) => [index("push_subscriptions_user_id_idx").on(t.userId)],
);

/**
 * The server's own signing keys for web push (VAPID), made the first time a
 * device turns notifications on. One row. The private key never leaves the
 * server and is never shown or logged.
 */
export const pushKeys = pgTable(
  "push_keys",
  {
    id: smallint("id").primaryKey().default(1),
    publicKey: text("public_key").notNull(),
    privateKey: text("private_key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [check("push_keys_single_row", sql`${t.id} = 1`)],
);

/**
 * What has already been announced, so an alert is sent once and not at every
 * check. Keys look like "offline:SERIAL", "summary:2026-11-10" and
 * "unmatched:CODE"; the value says when or what.
 */
export const notificationState = pgTable("notification_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
