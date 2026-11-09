-- Shiftly migration 10: owner-derived table privilege hardening, forward-only.
-- No role assumptions, ownership changes, SET ROLE or privilege escalation.
BEGIN;
DO $hardening$
DECLARE
 names text[] := ARRAY['profiles','workplaces','operation_requests','rate_versions','rate_intervals','commission_rule_versions','commission_thresholds','shifts','shift_adjustments','shift_fixed_payments','monthly_commission_results','shift_financial_events'];
 t record; o record; r text; p text; n integer;
BEGIN
 SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
 WHERE ns.nspname='public' AND c.relkind IN ('r','p') AND c.relname=ANY(names);
 IF n<>12 THEN RAISE EXCEPTION 'Expected all 12 Shiftly tables; found %',n; END IF;
 FOR t IN SELECT c.oid,c.relname,c.relowner,pg_get_userbyid(c.relowner) AS owner_name
  FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
  WHERE ns.nspname='public' AND c.relkind IN ('r','p') AND c.relname=ANY(names) ORDER BY c.relname
 LOOP
  RAISE NOTICE 'Hardening public.% owned by %',t.relname,t.owner_name;
  EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM anon, authenticated',t.relname);
 END LOOP;
 FOR o IN SELECT DISTINCT c.relowner,pg_get_userbyid(c.relowner) AS owner_name
  FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
  WHERE ns.nspname='public' AND c.relkind IN ('r','p') AND c.relname=ANY(names)
 LOOP
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated',o.owner_name);
  -- A schema-specific REVOKE cannot neutralize global/inherited defaults.
  -- Fail rather than silently granting insufficient protection.
  IF EXISTS (
   SELECT 1 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
   WHERE d.defaclrole=o.relowner AND d.defaclobjtype='r'
    AND (d.defaclnamespace=0 OR d.defaclnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public'))
    AND a.privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER')
    AND (a.grantee=0 OR EXISTS (
      SELECT 1 FROM pg_roles rr WHERE rr.rolname IN ('anon','authenticated')
      AND (a.grantee=rr.oid OR pg_has_role(rr.oid,a.grantee,'USAGE'))
    ))
  ) THEN RAISE EXCEPTION 'Unsafe global/schema/inherited table defaults remain for owner %',o.owner_name; END IF;
 END LOOP;
 FOR t IN SELECT c.oid,c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
  WHERE ns.nspname='public' AND c.relkind IN ('r','p') AND c.relname=ANY(names)
 LOOP
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   FOREACH p IN ARRAY ARRAY['TRUNCATE','REFERENCES','TRIGGER'] LOOP
    IF has_table_privilege(r,t.oid,p) THEN
     RAISE EXCEPTION 'Effective privilege % remains for % on public.%',p,r,t.relname;
    END IF;
   END LOOP;
  END LOOP;
  IF NOT has_table_privilege('authenticated',t.oid,'SELECT') THEN
   RAISE EXCEPTION 'Required authenticated read missing on public.%',t.relname;
  END IF;
  FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
   IF NOT has_table_privilege('service_role',t.oid,p) THEN
    RAISE EXCEPTION 'Required service_role privilege % missing on public.%',p,t.relname;
   END IF;
  END LOOP;
 END LOOP;
 IF NOT has_function_privilege('authenticated','public.shiftly_write(uuid,text,jsonb)','EXECUTE')
  OR NOT has_function_privilege('service_role','public.shiftly_close_month(uuid,uuid,date,uuid)','EXECUTE')
  OR NOT has_function_privilege('service_role','public.shiftly_delete_account(uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'Required RPC execution privileges missing';
 END IF;
END;
$hardening$;
COMMIT;
