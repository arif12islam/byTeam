CREATE TYPE "public"."leave_year_basis" AS ENUM('calendar', 'anniversary');--> statement-breakpoint
CREATE TYPE "public"."leave_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"leave_type_id" uuid NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"days" integer NOT NULL,
	"unpaid_days" integer DEFAULT 0 NOT NULL,
	"status" "leave_status" DEFAULT 'pending' NOT NULL,
	"note" text,
	"created_by" text NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_requests_dates_in_order" CHECK ("leave_requests"."to_date" >= "leave_requests"."from_date"),
	CONSTRAINT "leave_requests_days_positive" CHECK ("leave_requests"."days" >= 1),
	CONSTRAINT "leave_requests_unpaid_within_days" CHECK ("leave_requests"."unpaid_days" >= 0 and "leave_requests"."unpaid_days" <= "leave_requests"."days"),
	CONSTRAINT "leave_requests_decision_recorded" CHECK (("leave_requests"."status" = 'pending' and "leave_requests"."decided_by" is null and "leave_requests"."decided_at" is null) or ("leave_requests"."status" <> 'pending' and "leave_requests"."decided_by" is not null and "leave_requests"."decided_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "leave_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"yearly_quota" integer,
	"is_paid" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_types_name_not_blank" CHECK ("leave_types"."name" ~ '\S'),
	CONSTRAINT "leave_types_quota_not_negative" CHECK ("leave_types"."yearly_quota" is null or "leave_types"."yearly_quota" >= 0)
);
--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "leave_year_basis" "leave_year_basis" DEFAULT 'calendar' NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leave_requests_employee_dates_idx" ON "leave_requests" USING btree ("employee_id","from_date","to_date");--> statement-breakpoint
CREATE INDEX "leave_requests_status_idx" ON "leave_requests" USING btree ("status","from_date");--> statement-breakpoint
CREATE UNIQUE INDEX "leave_types_name_key" ON "leave_types" USING btree (lower("name"));