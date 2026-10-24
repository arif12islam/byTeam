CREATE TABLE "office_outages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "office_outages_window_in_order" CHECK ("office_outages"."end_time" > "office_outages"."start_time"),
	CONSTRAINT "office_outages_reason_not_blank" CHECK ("office_outages"."reason" ~ '\S')
);
--> statement-breakpoint
ALTER TABLE "office_outages" ADD CONSTRAINT "office_outages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "office_outages_date_idx" ON "office_outages" USING btree ("date");