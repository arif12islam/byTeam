CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "departments_name_lower_idx" ON "departments" USING btree (lower("name"));--> statement-breakpoint
-- Departments people already have, typed by hand until now, become entries in the list: one per spelling, ignoring case.
INSERT INTO "departments" ("name")
SELECT DISTINCT ON (lower(btrim("department"))) btrim("department")
FROM "employees"
WHERE "department" IS NOT NULL AND btrim("department") <> ''
ORDER BY lower(btrim("department")), btrim("department");
--> statement-breakpoint
-- Make every employee use the spelling the list kept.
UPDATE "employees" e SET "department" = d."name"
FROM "departments" d
WHERE lower(btrim(e."department")) = lower(d."name") AND e."department" <> d."name";
