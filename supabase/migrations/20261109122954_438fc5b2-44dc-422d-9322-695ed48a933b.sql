-- Shiftly migration 11: transactional Auth profile provisioning.
-- Forward-only; existing profiles and approved schema remain unchanged.
BEGIN;
CREATE FUNCTION public.shiftly_provision_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $provision$
DECLARE
 profile_name text;
BEGIN
 -- Only a display name may come from user-editable metadata.
 -- Identity is always NEW.id; no metadata-based roles or ownership.
 IF pg_catalog.jsonb_typeof(NEW.raw_user_meta_data -> 'name') = 'string' THEN
  profile_name := NEW.raw_user_meta_data ->> 'name';
 ELSIF pg_catalog.jsonb_typeof(NEW.raw_user_meta_data -> 'full_name') = 'string' THEN
  profile_name := NEW.raw_user_meta_data ->> 'full_name';
 END IF;
 profile_name := pg_catalog.btrim(pg_catalog.regexp_replace(profile_name, '[[:cntrl:]]', '', 'g'));
 IF profile_name IS NULL OR profile_name = '' THEN
  profile_name := 'Пользователь';
 ELSE
  profile_name := pg_catalog.left(profile_name, 200);
 END IF;
 INSERT INTO public.profiles (id, name)
 VALUES (NEW.id, profile_name)
 ON CONFLICT (id) DO NOTHING;
 -- Deliberately no exception handler: any failure aborts the Auth INSERT.
 RETURN NEW;
END;
$provision$;
REVOKE ALL ON FUNCTION public.shiftly_provision_profile() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER shiftly_auth_user_profile_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.shiftly_provision_profile();
COMMIT;
