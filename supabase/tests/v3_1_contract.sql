-- Stage 2.1 fixture-free catalog assertions. NO INSERT/seed/fixture rows.
BEGIN;
DO $$
BEGIN
 -- Account deletion RPC exists, service_role only.
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname='shiftly_delete_account') THEN
  RAISE EXCEPTION 'shiftly_delete_account missing'; END IF;
 IF has_function_privilege('authenticated','public.shiftly_delete_account(uuid)','EXECUTE')
    OR has_function_privilege('anon','public.shiftly_delete_account(uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'Account deletion exposed to clients'; END IF;
 IF NOT has_function_privilege('service_role','public.shiftly_delete_account(uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'service_role cannot run account deletion'; END IF;
 -- Operation and event type CHECKs include the explicit status transitions.
 IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='operation_requests_operation_type_check') NOT LIKE '%shift_start%' THEN
  RAISE EXCEPTION 'shift_start operation missing'; END IF;
 IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='operation_requests_operation_type_check') NOT LIKE '%shift_cancel%' THEN
  RAISE EXCEPTION 'shift_cancel operation missing'; END IF;
 IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='shift_financial_events_event_type_check') NOT LIKE '%cancel%' THEN
  RAISE EXCEPTION 'cancel event missing'; END IF;
 -- Strict validators exist and stay private.
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='shiftly_private' AND p.proname='money_value') THEN
  RAISE EXCEPTION 'money_value validator missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='shiftly_private' AND p.proname='require_keys') THEN
  RAISE EXCEPTION 'require_keys validator missing'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='shiftly_private' AND has_function_privilege('authenticated',p.oid,'EXECUTE')) THEN
  RAISE EXCEPTION 'Private helper exposed'; END IF;
 -- Largest Remainder ordering is part of the recalculation function.
 IF pg_get_functiondef('shiftly_private.recalculate_month(uuid,uuid,date,uuid,timestamptz)'::regprocedure) NOT LIKE '%DESC, id%' THEN
  RAISE EXCEPTION 'Largest Remainder ordering missing'; END IF;
 -- Publication helper recomputes future planned shifts.
 IF pg_get_functiondef('shiftly_private.publish_version(uuid,uuid,text,jsonb)'::regprocedure) NOT LIKE '%rate_recalc_confirm%' THEN
  RAISE EXCEPTION 'Future shift recalculation missing'; END IF;
END $$;
-- Pure validator behaviour, no rows created.
DO $$ BEGIN
 IF shiftly_private.money_value('{"a":"10.25"}','a',0,100) IS DISTINCT FROM 10.25::numeric THEN RAISE EXCEPTION 'money parse'; END IF;
 IF shiftly_private.money_value('{"a":null}','a',0,100) IS NOT NULL THEN RAISE EXCEPTION 'money null'; END IF;
 IF shiftly_private.money_value('{}','a',0,100) IS NOT NULL THEN RAISE EXCEPTION 'money absent'; END IF;
END $$;
DO $$ BEGIN
 BEGIN PERFORM shiftly_private.money_value('{"a":10.25}','a',0,100); RAISE EXCEPTION 'JSON number accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
DO $$ BEGIN
 BEGIN PERFORM shiftly_private.money_value('{"a":"10.999"}','a',0,100); RAISE EXCEPTION 'extra decimals accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
DO $$ BEGIN
 BEGIN PERFORM shiftly_private.money_value('{"a":"1e3"}','a',0,100); RAISE EXCEPTION 'exponent accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
DO $$ BEGIN
 BEGIN PERFORM shiftly_private.money_value('{"a":"-5"}','a',0,100); RAISE EXCEPTION 'sign accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
DO $$ BEGIN
 BEGIN PERFORM shiftly_private.money_value('{"a":"200"}','a',0,100); RAISE EXCEPTION 'range accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
DO $$ BEGIN
 BEGIN PERFORM shiftly_private.require_keys('{"a":1,"b":2}',ARRAY['a']); RAISE EXCEPTION 'unknown key accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
DO $$ BEGIN
 BEGIN PERFORM shiftly_private.uuid_value('{"a":"not-a-uuid"}','a'); RAISE EXCEPTION 'bad uuid accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
DO $$ BEGIN
 BEGIN PERFORM shiftly_private.ts_value('{"a":"2026-01-01 10:00:00"}','a'); RAISE EXCEPTION 'offset-less ts accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
-- Empty table count, proving validation did not create test rows.
DO $$ DECLARE r record; n bigint; BEGIN
 FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
  EXECUTE format('SELECT count(*) FROM public.%I',r.tablename) INTO n;
  IF n<>0 THEN RAISE EXCEPTION 'Unexpected validation data in %',r.tablename; END IF;
 END LOOP;
END $$;
ROLLBACK;
