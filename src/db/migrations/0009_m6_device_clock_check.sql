ALTER TABLE "devices" ADD COLUMN "clock_offset_seconds" integer;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "clock_checked_at" timestamp with time zone;