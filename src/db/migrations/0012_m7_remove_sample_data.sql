-- Takes the sample data out of a real database. It was added from Settings for a look around before the device was
-- connected: eight people named "Sample ...", codes 9001 to 9908, in a department ending "(sample)".
-- A person must match all three, and must not be in a finalized payroll month, so no real record can be caught.
-- Their punches stay in raw_punches, which the database never lets anyone delete; the app hides that device's punches.
-- On a database without sample data every statement below matches nothing. The people are looked up again in each
-- statement, so it does not depend on one connection staying open.
INSERT INTO "audit_log" ("actor_id", "action", "entity", "entity_id", "after")
SELECT NULL, 'sample_data.remove', 'company_settings', '1', jsonb_build_object('employees', count(*))
FROM "employees" e
WHERE e."name" LIKE 'Sample %' AND e."department" LIKE '% (sample)' AND e."emp_code" ~ '^9[0-9]{3}$'
  AND NOT EXISTS (SELECT 1 FROM "payroll_items" pi JOIN "payroll_runs" pr ON pr."id" = pi."run_id" WHERE pi."employee_id" = e."id" AND pr."status" = 'finalized')
HAVING count(*) > 0;
--> statement-breakpoint
DELETE FROM "payroll_items" WHERE "employee_id" IN (SELECT e."id" FROM "employees" e
  WHERE e."name" LIKE 'Sample %' AND e."department" LIKE '% (sample)' AND e."emp_code" ~ '^9[0-9]{3}$'
    AND NOT EXISTS (SELECT 1 FROM "payroll_items" pi JOIN "payroll_runs" pr ON pr."id" = pi."run_id" WHERE pi."employee_id" = e."id" AND pr."status" = 'finalized'));
--> statement-breakpoint
DELETE FROM "payroll_adjustments" WHERE "employee_id" IN (SELECT e."id" FROM "employees" e
  WHERE e."name" LIKE 'Sample %' AND e."department" LIKE '% (sample)' AND e."emp_code" ~ '^9[0-9]{3}$'
    AND NOT EXISTS (SELECT 1 FROM "payroll_items" pi JOIN "payroll_runs" pr ON pr."id" = pi."run_id" WHERE pi."employee_id" = e."id" AND pr."status" = 'finalized'));
--> statement-breakpoint
DELETE FROM "leave_requests" WHERE "employee_id" IN (SELECT e."id" FROM "employees" e
  WHERE e."name" LIKE 'Sample %' AND e."department" LIKE '% (sample)' AND e."emp_code" ~ '^9[0-9]{3}$'
    AND NOT EXISTS (SELECT 1 FROM "payroll_items" pi JOIN "payroll_runs" pr ON pr."id" = pi."run_id" WHERE pi."employee_id" = e."id" AND pr."status" = 'finalized'));
--> statement-breakpoint
DELETE FROM "attendance_adjustments" WHERE "employee_id" IN (SELECT e."id" FROM "employees" e
  WHERE e."name" LIKE 'Sample %' AND e."department" LIKE '% (sample)' AND e."emp_code" ~ '^9[0-9]{3}$'
    AND NOT EXISTS (SELECT 1 FROM "payroll_items" pi JOIN "payroll_runs" pr ON pr."id" = pi."run_id" WHERE pi."employee_id" = e."id" AND pr."status" = 'finalized'));
--> statement-breakpoint
DELETE FROM "attendance_days" WHERE "employee_id" IN (SELECT e."id" FROM "employees" e
  WHERE e."name" LIKE 'Sample %' AND e."department" LIKE '% (sample)' AND e."emp_code" ~ '^9[0-9]{3}$'
    AND NOT EXISTS (SELECT 1 FROM "payroll_items" pi JOIN "payroll_runs" pr ON pr."id" = pi."run_id" WHERE pi."employee_id" = e."id" AND pr."status" = 'finalized'));
--> statement-breakpoint
DELETE FROM "salary_structures" WHERE "employee_id" IN (SELECT e."id" FROM "employees" e
  WHERE e."name" LIKE 'Sample %' AND e."department" LIKE '% (sample)' AND e."emp_code" ~ '^9[0-9]{3}$'
    AND NOT EXISTS (SELECT 1 FROM "payroll_items" pi JOIN "payroll_runs" pr ON pr."id" = pi."run_id" WHERE pi."employee_id" = e."id" AND pr."status" = 'finalized'));
--> statement-breakpoint
DELETE FROM "employees" WHERE "id" IN (SELECT e."id" FROM "employees" e
  WHERE e."name" LIKE 'Sample %' AND e."department" LIKE '% (sample)' AND e."emp_code" ~ '^9[0-9]{3}$'
    AND NOT EXISTS (SELECT 1 FROM "payroll_items" pi JOIN "payroll_runs" pr ON pr."id" = pi."run_id" WHERE pi."employee_id" = e."id" AND pr."status" = 'finalized'));
--> statement-breakpoint
-- The shift made for them, once nobody is on it, and the departments with the "(sample)" label that nobody is in.
DELETE FROM "shifts" s WHERE s."name" = 'Sample day shift' AND NOT EXISTS (SELECT 1 FROM "employees" e WHERE e."shift_id" = s."id");
--> statement-breakpoint
DELETE FROM "departments" d WHERE d."name" LIKE '% (sample)' AND NOT EXISTS (SELECT 1 FROM "employees" e WHERE e."department" = d."name");
