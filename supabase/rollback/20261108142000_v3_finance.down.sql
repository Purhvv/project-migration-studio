BEGIN;
DROP FUNCTION public.shiftly_close_month(uuid,uuid,date,uuid);
DROP FUNCTION shiftly_private.recalculate_month(uuid,uuid,date,uuid,timestamptz);
DROP FUNCTION shiftly_private.hourly_pay(public.shifts,uuid);
COMMIT;
