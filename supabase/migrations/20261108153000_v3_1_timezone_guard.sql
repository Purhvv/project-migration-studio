-- Stage 2.1 bugfix found by isolated testing: guard_timezone referenced
-- NEW.workplace_timezone, a field only shifts has. PL/pgSQL resolves record field
-- references when the statement first executes, so EVERY insert/update on
-- profiles and workplaces failed. Empty-schema validation could not catch this;
-- real fixture inserts did. Split into two single-purpose trigger functions.
BEGIN;

-- profiles/workplaces: validate the IANA timezone only.
CREATE OR REPLACE FUNCTION shiftly_private.guard_timezone() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=NEW.timezone AND name !~ '^(posix|right)/') THEN
  RAISE EXCEPTION 'Unknown IANA timezone: %',NEW.timezone USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END $$;

-- shifts: validate the IANA snapshot and the local/UTC consistency contract.
CREATE FUNCTION shiftly_private.guard_shift_timezone() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE z text;
BEGIN
 z := NEW.workplace_timezone;
 IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=z AND name !~ '^(posix|right)/') THEN
  RAISE EXCEPTION 'Unknown IANA timezone: %',z USING ERRCODE='22023';
 END IF;
 IF (NEW.starts_at AT TIME ZONE z)::date <> NEW.local_start_date
   OR (NEW.ends_at AT TIME ZONE z)::date <> NEW.local_end_date
   OR (NEW.starts_at AT TIME ZONE z)::time <> NEW.start_time
   OR (NEW.ends_at AT TIME ZONE z)::time <> NEW.end_time THEN
  RAISE EXCEPTION 'UTC instants do not match explicitly resolved local times' USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END $$;

DROP TRIGGER shifts_timezone ON public.shifts;
CREATE TRIGGER shifts_timezone BEFORE INSERT OR UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION shiftly_private.guard_shift_timezone();

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA shiftly_private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA shiftly_private TO service_role;
COMMIT;
