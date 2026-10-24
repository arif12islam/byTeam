CREATE TYPE "public"."attendance_adjustment_field" AS ENUM('status', 'first_in', 'last_out');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('present', 'late', 'absent', 'leave_paid', 'leave_unpaid', 'weekly_off', 'holiday');--> statement-breakpoint
CREATE TABLE "attendance_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"date" date NOT NULL,
	"field" "attendance_adjustment_field" NOT NULL,
	"new_value" text,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_adjustments_reason_not_blank" CHECK ("attendance_adjustments"."reason" ~ '\S')
);
--> statement-breakpoint
CREATE TABLE "attendance_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"date" date NOT NULL,
	"first_in" timestamp with time zone,
	"last_out" timestamp with time zone,
	"status" "attendance_status" NOT NULL,
	"late_minutes" integer DEFAULT 0 NOT NULL,
	"early_minutes" integer DEFAULT 0 NOT NULL,
	"missing_out" boolean DEFAULT false NOT NULL,
	"worked_on_off_day" boolean DEFAULT false NOT NULL,
	"punch_count" integer DEFAULT 0 NOT NULL,
	"is_manual" boolean DEFAULT false NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_days_employee_date_key" UNIQUE("employee_id","date"),
	CONSTRAINT "attendance_days_minutes_not_negative" CHECK ("attendance_days"."late_minutes" >= 0 and "attendance_days"."early_minutes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "attendance_adjustments" ADD CONSTRAINT "attendance_adjustments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_adjustments" ADD CONSTRAINT "attendance_adjustments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_adjustments_lookup_idx" ON "attendance_adjustments" USING btree ("employee_id","date","field","created_at");--> statement-breakpoint
CREATE INDEX "attendance_days_date_idx" ON "attendance_days" USING btree ("date","status");