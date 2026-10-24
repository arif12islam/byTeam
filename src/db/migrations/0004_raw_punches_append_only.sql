-- raw_punches is append-only. Punches are the one thing that can never be
-- rebuilt, so the database refuses to change, remove or empty it, whoever asks.
CREATE FUNCTION "raw_punches_refuse_change"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'raw_punches is append-only: % is not allowed', TG_OP
		USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "raw_punches_no_update_or_delete"
	BEFORE UPDATE OR DELETE ON "raw_punches"
	FOR EACH ROW EXECUTE FUNCTION "raw_punches_refuse_change"();
--> statement-breakpoint
CREATE TRIGGER "raw_punches_no_truncate"
	BEFORE TRUNCATE ON "raw_punches"
	FOR EACH STATEMENT EXECUTE FUNCTION "raw_punches_refuse_change"();
