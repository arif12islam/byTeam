CREATE TYPE "public"."deduction_base" AS ENUM('gross', 'basic');--> statement-breakpoint
CREATE TYPE "public"."divisor" AS ENUM('thirty', 'month_days', 'working_days');--> statement-breakpoint
CREATE TYPE "public"."late_mode" AS ENUM('none', 'days_per_lates', 'fixed_per_late');--> statement-breakpoint
CREATE TYPE "public"."payroll_adjustment_type" AS ENUM('bonus', 'advance', 'other_addition', 'other_deduction');--> statement-breakpoint
CREATE TYPE "public"."payroll_run_status" AS ENUM('draft', 'finalized');--> statement-breakpoint
CREATE TABLE "payroll_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"month" date NOT NULL,
	"type" "payroll_adjustment_type" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_adjustments_month_start" CHECK (extract(day from "payroll_adjustments"."month") = 1),
	CONSTRAINT "payroll_adjustments_amount_positive" CHECK ("payroll_adjustments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "payroll_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"payable_days" integer NOT NULL,
	"absent_days" integer DEFAULT 0 NOT NULL,
	"late_count" integer DEFAULT 0 NOT NULL,
	"unpaid_leave_days" integer DEFAULT 0 NOT NULL,
	"gross" numeric(12, 2) NOT NULL,
	"deductions" numeric(12, 2) DEFAULT '0' NOT NULL,
	"additions" numeric(12, 2) DEFAULT '0' NOT NULL,
	"net" numeric(12, 2) NOT NULL,
	"breakdown" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_items_run_employee_key" UNIQUE("run_id","employee_id"),
	CONSTRAINT "payroll_items_counts_not_negative" CHECK ("payroll_items"."payable_days" >= 0 and "payroll_items"."absent_days" >= 0 and "payroll_items"."late_count" >= 0 and "payroll_items"."unpaid_leave_days" >= 0),
	CONSTRAINT "payroll_items_money_not_negative" CHECK ("payroll_items"."gross" >= 0 and "payroll_items"."deductions" >= 0 and "payroll_items"."additions" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month" date NOT NULL,
	"status" "payroll_run_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"rule_set_snapshot" jsonb,
	"created_by" text NOT NULL,
	"finalized_by" text,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_runs_month_key" UNIQUE("month"),
	CONSTRAINT "payroll_runs_month_start" CHECK (extract(day from "payroll_runs"."month") = 1),
	CONSTRAINT "payroll_runs_version_positive" CHECK ("payroll_runs"."version" >= 1),
	CONSTRAINT "payroll_runs_finalize_recorded" CHECK (("payroll_runs"."status" = 'draft' and "payroll_runs"."rule_set_snapshot" is null and "payroll_runs"."finalized_by" is null and "payroll_runs"."finalized_at" is null)
        or ("payroll_runs"."status" = 'finalized' and "payroll_runs"."rule_set_snapshot" is not null and "payroll_runs"."finalized_by" is not null and "payroll_runs"."finalized_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "rule_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"effective_from_month" date NOT NULL,
	"late_mode" "late_mode" DEFAULT 'none' NOT NULL,
	"late_every_n" integer,
	"late_amount" numeric(12, 2),
	"deduction_base" "deduction_base" NOT NULL,
	"divisor" "divisor" NOT NULL,
	"unpaid_leave_as_absent" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rule_sets_effective_from_month_key" UNIQUE("effective_from_month"),
	CONSTRAINT "rule_sets_month_start" CHECK (extract(day from "rule_sets"."effective_from_month") = 1),
	CONSTRAINT "rule_sets_every_n_positive" CHECK ("rule_sets"."late_every_n" is null or "rule_sets"."late_every_n" >= 1),
	CONSTRAINT "rule_sets_amount_not_negative" CHECK ("rule_sets"."late_amount" is null or "rule_sets"."late_amount" >= 0),
	CONSTRAINT "rule_sets_late_mode_fields" CHECK (("rule_sets"."late_mode" = 'none' and "rule_sets"."late_every_n" is null and "rule_sets"."late_amount" is null)
        or ("rule_sets"."late_mode" = 'days_per_lates' and "rule_sets"."late_every_n" is not null and "rule_sets"."late_amount" is null)
        or ("rule_sets"."late_mode" = 'fixed_per_late' and "rule_sets"."late_amount" is not null and "rule_sets"."late_every_n" is null))
);
--> statement-breakpoint
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_run_id_payroll_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_finalized_by_users_id_fk" FOREIGN KEY ("finalized_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_sets" ADD CONSTRAINT "rule_sets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payroll_adjustments_month_idx" ON "payroll_adjustments" USING btree ("month","employee_id");--> statement-breakpoint
CREATE INDEX "payroll_items_employee_idx" ON "payroll_items" USING btree ("employee_id");