CREATE TYPE "public"."device_command_status" AS ENUM('pending', 'sent', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "device_commands" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "device_commands_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"device_sn" text NOT NULL,
	"command" text NOT NULL,
	"status" "device_command_status" DEFAULT 'pending' NOT NULL,
	"result" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"serial_no" text NOT NULL,
	"name" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_serial_no_unique" UNIQUE("serial_no")
);
--> statement-breakpoint
CREATE TABLE "raw_punches" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "raw_punches_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"device_sn" text NOT NULL,
	"emp_code" text NOT NULL,
	"punched_at" timestamp with time zone NOT NULL,
	"status_code" smallint,
	"verify_code" smallint,
	"raw_line" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "raw_punches_device_emp_time_key" UNIQUE("device_sn","emp_code","punched_at")
);
--> statement-breakpoint
ALTER TABLE "device_commands" ADD CONSTRAINT "device_commands_device_sn_devices_serial_no_fk" FOREIGN KEY ("device_sn") REFERENCES "public"."devices"("serial_no") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_punches" ADD CONSTRAINT "raw_punches_device_sn_devices_serial_no_fk" FOREIGN KEY ("device_sn") REFERENCES "public"."devices"("serial_no") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_commands_queue_idx" ON "device_commands" USING btree ("device_sn","status","id");--> statement-breakpoint
CREATE INDEX "raw_punches_punched_at_idx" ON "raw_punches" USING btree ("punched_at");--> statement-breakpoint
CREATE INDEX "raw_punches_emp_code_idx" ON "raw_punches" USING btree ("emp_code");