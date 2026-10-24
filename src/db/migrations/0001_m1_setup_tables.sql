CREATE TYPE "public"."user_role" AS ENUM('owner', 'hr');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"weekly_off_days" smallint[] DEFAULT '{}'::smallint[] NOT NULL,
	"timezone" text DEFAULT 'Asia/Dhaka' NOT NULL,
	"currency" text DEFAULT 'BDT' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_settings_single_row" CHECK ("company_settings"."id" = 1),
	CONSTRAINT "company_settings_off_days_range" CHECK ("company_settings"."weekly_off_days" <@ ARRAY[0,1,2,3,4,5,6]::smallint[])
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"emp_code" text NOT NULL,
	"name" text NOT NULL,
	"department" text,
	"designation" text,
	"join_date" date NOT NULL,
	"exit_date" date,
	"shift_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_emp_code_unique" UNIQUE("emp_code"),
	CONSTRAINT "employees_exit_not_before_join" CHECK ("employees"."exit_date" is null or "employees"."exit_date" >= "employees"."join_date")
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holidays_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "salary_structures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"gross" numeric(12, 2) NOT NULL,
	"basic_pct" numeric(5, 2) NOT NULL,
	"house_pct" numeric(5, 2) NOT NULL,
	"medical_pct" numeric(5, 2) NOT NULL,
	"conveyance_pct" numeric(5, 2) NOT NULL,
	"effective_from" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "salary_structures_employee_effective_from_key" UNIQUE("employee_id","effective_from"),
	CONSTRAINT "salary_structures_effective_from_month_start" CHECK (extract(day from "salary_structures"."effective_from") = 1),
	CONSTRAINT "salary_structures_gross_not_negative" CHECK ("salary_structures"."gross" >= 0),
	CONSTRAINT "salary_structures_pct_range" CHECK ("salary_structures"."basic_pct" between 0 and 100
        and "salary_structures"."house_pct" between 0 and 100
        and "salary_structures"."medical_pct" between 0 and 100
        and "salary_structures"."conveyance_pct" between 0 and 100
        and "salary_structures"."basic_pct" + "salary_structures"."house_pct" + "salary_structures"."medical_pct" + "salary_structures"."conveyance_pct" <= 100)
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"grace_minutes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shifts_name_unique" UNIQUE("name"),
	CONSTRAINT "shifts_end_after_start" CHECK ("shifts"."end_time" > "shifts"."start_time"),
	CONSTRAINT "shifts_grace_not_negative" CHECK ("shifts"."grace_minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'hr' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "employees_shift_id_idx" ON "employees" USING btree ("shift_id");