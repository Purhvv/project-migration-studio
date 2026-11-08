-- Restores the single combined guard_timezone from 20261108141000.
-- Only for an empty isolated test schema.
BEGIN;
DROP TRIGGER shifts_timezone ON public.shifts;
DROP FUNCTION shiftly_private.guard_shift_timezone();
CREATE OR REPLACE FUNCTION shiftly_private.guard_timezone() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE z text;
BEGIN
 z := CASE WHEN TG_TABLE_NAME='shifts' THEN NEW.workplace_timezone ELSE NEW.timezone END;
 IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=z AND name !~ '^(posix|right)/') THEN
  RAISE EXCEPTION 'Unknown IANA timezone: %',z USING ERRCODE='22023';
 END IF;
 IF TG_TABLE_NAME='shifts' THEN
  IF (NEW.starts_at AT TIME ZONE z)::date <> NEW.local_start_date
    OR (NEW.ends_at AT TIME ZONE z)::date <> NEW.local_end_date
    OR (NEW.starts_at AT TIME ZONE z)::time <> NEW.start_time
    OR (NEW.ends_at AT TIME ZONE z)::time <> NEW.end_time THEN
   RAISE EXCEPTION 'UTC instants do not match explicitly resolved local times' USING ERRCODE='22023';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER shifts_timezone BEFORE INSERT OR UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION shiftly_private.guard_timezone();
COMMIT;
