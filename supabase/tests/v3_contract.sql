-- Read-only catalog assertions and pure expressions. NO INSERT/seed/fixture rows.
BEGIN;
DO $$
DECLARE n integer; r record;
BEGIN
 SELECT count(*) INTO n FROM pg_tables WHERE schemaname='public';
 IF n<>12 THEN RAISE EXCEPTION 'Expected exactly 12 public tables, got %',n; END IF;
 FOR r IN SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='public' AND c.relkind='r' LOOP
  IF NOT r.relrowsecurity THEN RAISE EXCEPTION 'RLS missing: %',r.relname; END IF;
  IF NOT has_table_privilege('authenticated','public.'||r.relname,'SELECT') THEN RAISE EXCEPTION 'Owner SELECT missing'; END IF;
  IF has_table_privilege('authenticated','public.'||r.relname,'INSERT') OR has_table_privilege('authenticated','public.'||r.relname,'UPDATE') OR has_table_privilege('authenticated','public.'||r.relname,'DELETE') THEN RAISE EXCEPTION 'Client DML granted: %',r.relname; END IF;
  IF has_table_privilege('anon','public.'||r.relname,'SELECT') THEN RAISE EXCEPTION 'Anonymous financial access'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND cmd='SELECT' AND roles=ARRAY['authenticated']::name[])<>12 THEN RAISE EXCEPTION 'Expected 12 owner policies'; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND data_type IN ('real','double precision','money')) THEN RAISE EXCEPTION 'Inexact monetary type'; END IF;
 IF has_function_privilege('authenticated','public.shiftly_close_month(uuid,uuid,date,uuid)','EXECUTE') OR has_function_privilege('anon','public.shiftly_write(uuid,text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Unsafe RPC grant'; END IF;
 IF NOT has_function_privilege('authenticated','public.shiftly_write(uuid,text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Authenticated RPC unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='shiftly_private' AND has_function_privilege('authenticated',p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Private helper exposed'; END IF;
END $$;
DO $$ BEGIN
 IF shiftly_private.earnings(2000,0,0,1000,0,0) IS DISTINCT FROM 3000::numeric THEN RAISE EXCEPTION 'Double counting base/fixed'; END IF;
END $$;
DO $$ BEGIN
 IF shiftly_private.earnings(100,0,0,0,0,500) IS DISTINCT FROM (-400)::numeric THEN RAISE EXCEPTION 'Negative earnings clamped'; END IF;
END $$;
DO $$ BEGIN
 IF shiftly_private.earnings(2000,0,NULL,1000,0,0) IS NOT NULL THEN RAISE EXCEPTION 'Unknown commission treated as zero'; END IF;
END $$;
DO $$ BEGIN
 IF shiftly_private.earnings(NULL,0,0,1000,0,0) IS NOT NULL THEN RAISE EXCEPTION 'Unknown base treated as zero'; END IF;
END $$;
DO $$ BEGIN
 IF round(0.005::numeric,2)<>0.01 THEN RAISE EXCEPTION 'Half-up rounding'; END IF;
END $$;
DO $$ BEGIN
 IF extract(epoch FROM ('2026-10-25 03:30:00+01'::timestamptz-'2026-10-25 01:30:00+02'::timestamptz))<>10800 THEN RAISE EXCEPTION 'DST elapsed time'; END IF;
END $$;
DO $$ BEGIN
 IF ('2026-11-01'::timestamp AT TIME ZONE 'Europe/Moscow') <> '2026-10-31 21:00:00+00'::timestamptz THEN RAISE EXCEPTION 'Workplace month boundary'; END IF;
END $$;
DO $$ BEGIN
 BEGIN
  PERFORM public.shiftly_write('00000000-0000-0000-0000-000000000001','shift_create','{}');
  RAISE EXCEPTION 'Unauthenticated write accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
-- Empty table count, proving validation did not create test rows.
DO $$ DECLARE r record; n bigint; BEGIN
 FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
  EXECUTE format('SELECT count(*) FROM public.%I',r.tablename) INTO n;
  IF n<>0 THEN RAISE EXCEPTION 'Unexpected validation data in %',r.tablename; END IF;
 END LOOP;
END $$;
ROLLBACK;
