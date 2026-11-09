-- Rollback migration 11 only; existing users/profiles remain untouched.
-- Execute only with separate authorization; never run automatically.
BEGIN;
DROP TRIGGER IF EXISTS shiftly_auth_user_profile_created ON auth.users;
DROP FUNCTION IF EXISTS public.shiftly_provision_profile();
COMMIT;