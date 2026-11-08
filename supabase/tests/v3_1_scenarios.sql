-- Shiftly v3/v3.1 permanent scenario tests (stage 2.1 follow-up, 2026-11-08).
--
-- Recreated from the actually verified scenarios and the current SQL
-- implementation; the original temporary scripts were not preserved and are
-- NOT restored byte-for-byte.
--
-- SAFETY CONTRACT — read before running:
--   * Run ONLY against a disposable, isolated test database (local PostgreSQL).
--     NEVER run against Supabase Cloud or any production/working database.
--   * The file refuses to execute unless the session opts in explicitly:
--       PGOPTIONS='-c app.shiftly_test_env=on' psql -d <disposable_test_db> -f v3_1_scenarios.sql
--   * All fixture rows are synthetic (fixed test UUIDs, no real accounts).
--   * Everything runs inside ONE transaction that ends with ROLLBACK:
--     no test rows, roles, schemas or functions can survive the run.
--   * Every violated expectation aborts with a descriptive RAISE EXCEPTION.
--
-- Covered scenarios (sequential ones; real concurrency lives in
-- v3_1_concurrency.sh):
--   1. Largest Remainder commission allocation (3 shifts x 33.33 @ 10%).
--   2. Version revision sequencing on publication.
--   3. Future planned-shift recalculation after a new rate publication.
--   4. in_progress / pending / completed shifts untouched by publication.
--   5. Shift status transition machine.
--   6. RLS isolation between two users.
--   7. Idempotency of repeated operations.
--   8. Trash, restore and final purge.
--   9. Controlled server-side account deletion.
--  10. Timezones: DST spring-forward, repeated and nonexistent local time.
--  11. Money validators and SQLSTATE contract.

-- ============================================================================
-- Environment guard: explicit opt-in AND a provably empty database.
-- ============================================================================
DO $$
BEGIN
 IF current_setting('app.shiftly_test_env', true) IS DISTINCT FROM 'on' THEN
  RAISE EXCEPTION 'REFUSED: set app.shiftly_test_env=on (PGOPTIONS) and use a disposable test database. Never run against Cloud or a working database.';
 END IF;
END $$;

BEGIN;

DO $$
DECLARE r record; n bigint;
BEGIN
 FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
  EXECUTE format('SELECT count(*) FROM public.%I', r.tablename) INTO n;
  IF n <> 0 THEN
   RAISE EXCEPTION 'REFUSED: table % is not empty; scenario tests require a fresh disposable database', r.tablename;
  END IF;
 END LOOP;
END $$;

-- ============================================================================
-- Minimal auth scaffold for the isolated database (rolled back at the end).
-- On a real Supabase project the auth schema already exists and this file must
-- never run there — the guard above is the gate.
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- ============================================================================
-- Test helpers (pg_temp: session-scoped, removed by the rollback/session end).
-- ============================================================================
CREATE FUNCTION pg_temp.call_as(p_user uuid, p_key uuid, p_type text, p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
 PERFORM set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
 RETURN public.shiftly_write(p_key, p_type, p_payload);
END $$;

CREATE FUNCTION pg_temp.expect_error(p_user uuid, p_type text, p_payload jsonb, p_sqlstate text, p_label text) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_state text; v_msg text; v_ok boolean := false;
BEGIN
 PERFORM set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
 BEGIN
  PERFORM public.shiftly_write(gen_random_uuid(), p_type, p_payload);
  v_ok := true;
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
 END;
 IF v_ok THEN RAISE EXCEPTION 'FAIL [%]: expected SQLSTATE %, but the operation succeeded', p_label, p_sqlstate; END IF;
 IF v_state IS DISTINCT FROM p_sqlstate THEN
  RAISE EXCEPTION 'FAIL [%]: expected SQLSTATE %, got % (%)', p_label, p_sqlstate, v_state, v_msg;
 END IF;
 RAISE NOTICE 'ok: %', p_label;
END $$;

-- ============================================================================
-- Synthetic fixtures: three test users, no real accounts.
-- ============================================================================
DO $$
BEGIN
 INSERT INTO auth.users(id) VALUES
  ('aaaaaaaa-0000-0000-0000-00000000000a'),
  ('aaaaaaaa-0000-0000-0000-00000000000b'),
  ('aaaaaaaa-0000-0000-0000-00000000000c');
 INSERT INTO public.profiles(id, name, timezone) VALUES
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Test User A', 'Europe/Moscow'),
  ('aaaaaaaa-0000-0000-0000-00000000000b', 'Test User B', 'Europe/Moscow'),
  ('aaaaaaaa-0000-0000-0000-00000000000c', 'Test User C', 'Europe/Moscow');
END $$;

-- ============================================================================
-- SCENARIO 1: Largest Remainder — 3 shifts x revenue 33.33 @ fixed 10%.
-- Exact shares 3.333 each; floors sum to 9.99; the rounded monthly total is
-- 10.00; the single leftover cent goes to the shift with the largest
-- fractional remainder (tie -> smallest id). Sum must equal 10.00 exactly.
-- ============================================================================
DO $$
DECLARE u uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
 w uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
 ids uuid[] := ARRAY['cccccccc-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000003'];
 ds text[] := ARRAY['2026-03-10','2026-03-11','2026-03-12'];
 i integer; m record; n bigint; total numeric; winners bigint; winner_id uuid;
BEGIN
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'workplace_edit',
  jsonb_build_object('id', w, 'name', 'LR Cafe', 'color', 'sky', 'timezone', 'Europe/Moscow'));
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'publish_rates', jsonb_build_object(
  'workplace_id', w, 'effective_from', '2026-01-01', 'intervals', jsonb_build_array(
   jsonb_build_object('kind','hourly','start_time','00:00','end_time','23:59','hourly','100','label','base'))));
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'publish_commission', jsonb_build_object(
  'workplace_id', w, 'effective_from', '2026-01-01', 'mode', 'fixed', 'fixed_percent', '10'));
 FOR i IN 1..3 LOOP
  PERFORM pg_temp.call_as(u, gen_random_uuid(), 'shift_create', jsonb_build_object(
   'id', ids[i], 'workplace_id', w,
   'local_start_date', ds[i], 'local_end_date', ds[i], 'start_time', '10:00', 'end_time', '18:00',
   'starts_at', (ds[i]::date || ' 07:00:00Z')::text, 'ends_at', (ds[i]::date || ' 15:00:00Z')::text));
  PERFORM pg_temp.call_as(u, gen_random_uuid(), 'shift_complete', jsonb_build_object(
   'id', ids[i], 'expected_revision', 1, 'revenue', '33.33', 'expected_revenue_revision', 1));
 END LOOP;
 SELECT count(*), sum(commission_pay), count(*) FILTER (WHERE commission_pay = 3.34)
 INTO n, total, winners FROM public.shifts WHERE workplace_id = w AND status = 'completed';
 IF n <> 3 OR total IS DISTINCT FROM 10.00 OR winners <> 1 THEN
  RAISE EXCEPTION 'FAIL [S1]: expected 3 shifts, commission sum 10.00, one 3.34 winner; got n=%, sum=%, winners=%', n, total, winners;
 END IF;
 -- Tie on the fractional part (all .30) is broken by smallest id.
 SELECT id INTO winner_id FROM public.shifts WHERE workplace_id = w AND commission_pay = 3.34;
 IF winner_id <> ids[1] THEN RAISE EXCEPTION 'FAIL [S1]: leftover cent must go to the smallest id on ties, got %', winner_id; END IF;
 SELECT * INTO m FROM public.monthly_commission_results WHERE workplace_id = w AND month = '2026-03-01';
 IF m.commission_amount IS DISTINCT FROM 10.00 OR m.applied_percent IS DISTINCT FROM 10.00
   OR m.revenue_total IS DISTINCT FROM 99.99 OR m.state <> 'final' OR NOT m.calculation_available THEN
  RAISE EXCEPTION 'FAIL [S1]: monthly row mismatch: %', to_jsonb(m);
 END IF;
 RAISE NOTICE 'SCENARIO 1 OK: Largest Remainder exact to the cent';
END $$;

-- ============================================================================
-- SCENARIO 2: revision sequencing — each publication gets max(revision)+1.
-- ============================================================================
DO $$
DECLARE u uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
 w uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
 r1 jsonb; r2 jsonb; revs integer[];
BEGIN
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'workplace_edit',
  jsonb_build_object('id', w, 'name', 'Rev Bar', 'color', 'green', 'timezone', 'Europe/Moscow'));
 r1 := pg_temp.call_as(u, gen_random_uuid(), 'publish_rates', jsonb_build_object(
  'workplace_id', w, 'effective_from', '2026-01-01', 'intervals', jsonb_build_array(
   jsonb_build_object('kind','hourly','start_time','00:00','end_time','23:59','hourly','100','label','v1'))));
 r2 := pg_temp.call_as(u, gen_random_uuid(), 'publish_rates', jsonb_build_object(
  'workplace_id', w, 'effective_from', '2026-02-01', 'intervals', jsonb_build_array(
   jsonb_build_object('kind','hourly','start_time','00:00','end_time','23:59','hourly','200','label','v2'))));
 IF (r1->>'revision')::integer <> 1 OR (r2->>'revision')::integer <> 2 THEN
  RAISE EXCEPTION 'FAIL [S2]: expected revisions 1 and 2, got % and %', r1->>'revision', r2->>'revision';
 END IF;
 SELECT array_agg(revision ORDER BY revision) INTO revs FROM public.rate_versions WHERE workplace_id = w;
 IF revs <> ARRAY[1,2] THEN RAISE EXCEPTION 'FAIL [S2]: stored revisions are %', revs; END IF;
 RAISE NOTICE 'SCENARIO 2 OK: version revisions sequence 1 -> 2';
END $$;

-- ============================================================================
-- SCENARIO 3: publishing a newer rate recalculates FUTURE planned shifts.
-- ============================================================================
DO $$
DECLARE u uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
 w uuid := 'bbbbbbbb-0000-0000-0000-000000000003';
 s uuid := 'cccccccc-0000-0000-0000-000000000010';
 v2 uuid; sh record; ev bigint;
BEGIN
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'workplace_edit',
  jsonb_build_object('id', w, 'name', 'Future Pub', 'color', 'amber', 'timezone', 'Europe/Moscow'));
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'publish_rates', jsonb_build_object(
  'workplace_id', w, 'effective_from', '2026-01-01', 'intervals', jsonb_build_array(
   jsonb_build_object('kind','hourly','start_time','00:00','end_time','23:59','hourly','100','label','v1'))));
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'shift_create', jsonb_build_object(
  'id', s, 'workplace_id', w, 'local_start_date', '2026-06-10', 'local_end_date', '2026-06-10',
  'start_time', '10:00', 'end_time', '18:00', 'starts_at', '2026-06-10T07:00:00Z', 'ends_at', '2026-06-10T15:00:00Z'));
 SELECT base_pay INTO sh FROM public.shifts WHERE id = s;
 IF sh.base_pay IS DISTINCT FROM 800.00 THEN RAISE EXCEPTION 'FAIL [S3]: initial base_pay must be 800.00, got %', sh.base_pay; END IF;
 v2 := (pg_temp.call_as(u, gen_random_uuid(), 'publish_rates', jsonb_build_object(
  'workplace_id', w, 'effective_from', '2026-06-01', 'intervals', jsonb_build_array(
   jsonb_build_object('kind','hourly','start_time','00:00','end_time','23:59','hourly','200','label','v2')))))->>'version_id';
 SELECT * INTO sh FROM public.shifts WHERE id = s;
 IF sh.base_pay IS DISTINCT FROM 1600.00 OR sh.rate_version_id <> v2 OR sh.revision <> 2 THEN
  RAISE EXCEPTION 'FAIL [S3]: future planned shift must be recalculated to 1600.00 at v2 (rev 2), got base=%, ver=%, rev=%',
   sh.base_pay, sh.rate_version_id, sh.revision;
 END IF;
 SELECT count(*) INTO ev FROM public.shift_financial_events
 WHERE subject_shift_id = s AND event_type = 'rate_recalc_confirm';
 IF ev <> 1 THEN RAISE EXCEPTION 'FAIL [S3]: expected one rate_recalc_confirm audit event, got %', ev; END IF;
 RAISE NOTICE 'SCENARIO 3 OK: future planned shift recalculated 800 -> 1600 with audit';
END $$;

-- ============================================================================
-- SCENARIO 4: publication must NOT touch in_progress / pending / completed.
-- The 'pending' row is inserted directly (test harness only): no RPC
-- transition yields 'pending', but the state exists in the CHECK constraint.
-- ============================================================================
DO $$
DECLARE u uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
 w uuid := 'bbbbbbbb-0000-0000-0000-000000000004';
 s_planned uuid := 'cccccccc-0000-0000-0000-000000000020';
 s_progress uuid := 'cccccccc-0000-0000-0000-000000000021';
 s_completed uuid := 'cccccccc-0000-0000-0000-000000000022';
 s_pending uuid := 'cccccccc-0000-0000-0000-000000000023';
 ids uuid[]; ds text[]; i integer; v1 uuid; rec record;
BEGIN
 -- The completed shift predates the new effective_from, otherwise the
 -- historical-publication guard would (correctly) reject the publication.
 ids := ARRAY[s_completed, s_progress, s_pending, s_planned];
 ds := ARRAY['2026-06-05','2026-06-06','2026-06-07','2026-06-20'];
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'workplace_edit',
  jsonb_build_object('id', w, 'name', 'Stable States', 'color', 'rose', 'timezone', 'Europe/Moscow'));
 v1 := (pg_temp.call_as(u, gen_random_uuid(), 'publish_rates', jsonb_build_object(
  'workplace_id', w, 'effective_from', '2026-01-01', 'intervals', jsonb_build_array(
   jsonb_build_object('kind','hourly','start_time','00:00','end_time','23:59','hourly','100','label','v1')))))->>'version_id';
 -- completed and in_progress come from the RPC; pending is inserted directly below.
 FOR i IN 1..2 LOOP
  PERFORM pg_temp.call_as(u, gen_random_uuid(), 'shift_create', jsonb_build_object(
   'id', ids[i], 'workplace_id', w, 'local_start_date', ds[i], 'local_end_date', ds[i],
   'start_time', '10:00', 'end_time', '18:00', 'starts_at', (ds[i]::date || ' 07:00:00Z')::text, 'ends_at', (ds[i]::date || ' 15:00:00Z')::text));
 END LOOP;
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'shift_start', jsonb_build_object('id', s_progress, 'expected_revision', 1));
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'shift_complete', jsonb_build_object(
  'id', s_completed, 'expected_revision', 1, 'revenue', '500', 'expected_revenue_revision', 1));
 -- Harness-only pending row (no RPC path creates it); satisfies all triggers.
 INSERT INTO public.shifts(id, user_id, workplace_id, local_start_date, local_end_date, start_time, end_time,
  workplace_timezone, starts_at, ends_at, status, base_pay, rate_version_id)
 VALUES(s_pending, u, w, '2026-06-07', '2026-06-07', '10:00', '18:00', 'Europe/Moscow',
  '2026-06-07T07:00:00Z', '2026-06-07T15:00:00Z', 'pending', 800.00, v1);
 -- The future planned shift after the new effective date.
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'shift_create', jsonb_build_object(
  'id', s_planned, 'workplace_id', w, 'local_start_date', '2026-06-20', 'local_end_date', '2026-06-20',
  'start_time', '10:00', 'end_time', '18:00', 'starts_at', '2026-06-20T07:00:00Z', 'ends_at', '2026-06-20T15:00:00Z'));
 -- Snapshot before publication.
 CREATE TEMP TABLE s4_before ON COMMIT DROP AS
  SELECT id, base_pay, revision, rate_version_id FROM public.shifts WHERE workplace_id = w;
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'publish_rates', jsonb_build_object(
  'workplace_id', w, 'effective_from', '2026-06-10', 'intervals', jsonb_build_array(
   jsonb_build_object('kind','hourly','start_time','00:00','end_time','23:59','hourly','200','label','v2'))));
 FOR rec IN SELECT b.id, b.base_pay AS old_pay, b.revision AS old_rev, s.base_pay, s.revision
  FROM s4_before b JOIN public.shifts s ON s.id = b.id WHERE s.id <> s_planned
 LOOP
  IF rec.base_pay IS DISTINCT FROM rec.old_pay OR rec.revision <> rec.old_rev THEN
   RAISE EXCEPTION 'FAIL [S4]: non-planned shift % changed by publication (pay % -> %, rev % -> %)',
    rec.id, rec.old_pay, rec.base_pay, rec.old_rev, rec.revision;
  END IF;
 END LOOP;
 SELECT base_pay INTO rec FROM public.shifts WHERE id = s_planned;
 IF rec.base_pay IS DISTINCT FROM 1600.00 THEN RAISE EXCEPTION 'FAIL [S4]: planned shift must be recalculated to 1600.00, got %', rec.base_pay; END IF;
 RAISE NOTICE 'SCENARIO 4 OK: in_progress/pending/completed untouched, planned recalculated';
END $$;

-- ============================================================================
-- SCENARIO 5: status transition machine.
-- ============================================================================
DO $$
DECLARE u uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
 w uuid := 'bbbbbbbb-0000-0000-0000-000000000005';
 s1 uuid := 'cccccccc-0000-0000-0000-000000000030';
 s2 uuid := 'cccccccc-0000-0000-0000-000000000031';
 st text;
BEGIN
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'workplace_edit',
  jsonb_build_object('id', w, 'name', 'Status Diner', 'color', 'violet', 'timezone', 'Europe/Moscow'));
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'shift_create', jsonb_build_object(
  'id', s1, 'workplace_id', w, 'local_start_date', '2026-05-10', 'local_end_date', '2026-05-10',
  'start_time', '10:00', 'end_time', '18:00', 'starts_at', '2026-05-10T07:00:00Z', 'ends_at', '2026-05-10T15:00:00Z'));
 SELECT status INTO st FROM public.shifts WHERE id = s1;
 IF st <> 'planned' THEN RAISE EXCEPTION 'FAIL [S5]: shift_create must yield planned, got %', st; END IF;
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'shift_start', jsonb_build_object('id', s1, 'expected_revision', 1));
 SELECT status INTO st FROM public.shifts WHERE id = s1;
 IF st <> 'in_progress' THEN RAISE EXCEPTION 'FAIL [S5]: shift_start must yield in_progress, got %', st; END IF;
 PERFORM pg_temp.expect_error(u, 'shift_start', jsonb_build_object('id', s1, 'expected_revision', 2), '22023', 'S5 double start rejected');
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'shift_complete', jsonb_build_object(
  'id', s1, 'expected_revision', 2, 'revenue', '1000', 'expected_revenue_revision', 1));
 SELECT status INTO st FROM public.shifts WHERE id = s1;
 IF st <> 'completed' THEN RAISE EXCEPTION 'FAIL [S5]: shift_complete must yield completed, got %', st; END IF;
 PERFORM pg_temp.expect_error(u, 'shift_cancel', jsonb_build_object('id', s1, 'expected_revision', 3), '22023', 'S5 cancel of completed rejected');
 PERFORM pg_temp.expect_error(u, 'shift_complete', jsonb_build_object('id', s1, 'expected_revision', 3), '22023', 'S5 double complete rejected');
 PERFORM pg_temp.expect_error(u, 'shift_edit', jsonb_build_object('id', s1, 'expected_revision', 3, 'status', 'cancelled'), '22023', 'S5 raw status key rejected');
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'shift_create', jsonb_build_object(
  'id', s2, 'workplace_id', w, 'local_start_date', '2026-05-11', 'local_end_date', '2026-05-11',
  'start_time', '10:00', 'end_time', '18:00', 'starts_at', '2026-05-11T07:00:00Z', 'ends_at', '2026-05-11T15:00:00Z'));
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'shift_cancel', jsonb_build_object('id', s2, 'expected_revision', 1));
 SELECT status INTO st FROM public.shifts WHERE id = s2;
 IF st <> 'cancelled' THEN RAISE EXCEPTION 'FAIL [S5]: shift_cancel must yield cancelled, got %', st; END IF;
 PERFORM pg_temp.expect_error(u, 'shift_start', jsonb_build_object('id', s2, 'expected_revision', 2), '22023', 'S5 start of cancelled rejected');
 RAISE NOTICE 'SCENARIO 5 OK: status machine enforced';
END $$;

-- ============================================================================
-- SCENARIO 6: RLS isolation between two users.
-- Non-superuser roles are created inside the transaction and rolled back.
-- ============================================================================
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'shiftly_test_rls_a') THEN CREATE ROLE shiftly_test_rls_a NOLOGIN; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'shiftly_test_rls_b') THEN CREATE ROLE shiftly_test_rls_b NOLOGIN; END IF;
END $$;
GRANT authenticated TO shiftly_test_rls_a;
GRANT authenticated TO shiftly_test_rls_b;

-- Fixture for user B (one shift), plus expected counts captured as superuser.
DO $$
DECLARE u uuid := 'aaaaaaaa-0000-0000-0000-00000000000b';
 w uuid := 'bbbbbbbb-0000-0000-0000-00000000000b';
BEGIN
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'workplace_edit',
  jsonb_build_object('id', w, 'name', 'B Place', 'color', 'orange', 'timezone', 'Europe/Moscow'));
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'shift_create', jsonb_build_object(
  'id', 'cccccccc-0000-0000-0000-0000000000b0', 'workplace_id', w,
  'local_start_date', '2026-04-01', 'local_end_date', '2026-04-01',
  'start_time', '09:00', 'end_time', '17:00', 'starts_at', '2026-04-01T06:00:00Z', 'ends_at', '2026-04-01T14:00:00Z'));
END $$;
CREATE TEMP TABLE s6_expected ON COMMIT DROP AS
SELECT (SELECT count(*) FROM public.shifts WHERE user_id = 'aaaaaaaa-0000-0000-0000-00000000000a') AS shifts_a,
       (SELECT count(*) FROM public.shifts WHERE user_id = 'aaaaaaaa-0000-0000-0000-00000000000b') AS shifts_b;
GRANT SELECT ON s6_expected TO shiftly_test_rls_a, shiftly_test_rls_b;

SET ROLE shiftly_test_rls_a;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-00000000000a', true);
DO $$
DECLARE n bigint; e bigint;
BEGIN
 SELECT count(*) INTO n FROM public.shifts;
 SELECT shifts_a INTO e FROM s6_expected;
 IF n <> e OR e = 0 THEN RAISE EXCEPTION 'FAIL [S6]: owner A must see own % shifts, saw %', e, n; END IF;
 SELECT count(*) INTO n FROM public.shifts WHERE user_id = 'aaaaaaaa-0000-0000-0000-00000000000b';
 IF n <> 0 THEN RAISE EXCEPTION 'FAIL [S6]: user A must not see shifts of B, saw %', n; END IF;
 SELECT count(*) INTO n FROM public.profiles WHERE id = 'aaaaaaaa-0000-0000-0000-00000000000b';
 IF n <> 0 THEN RAISE EXCEPTION 'FAIL [S6]: user A must not see profile of B'; END IF;
 -- Direct client writes are revoked.
 BEGIN
  INSERT INTO public.shifts(id, user_id, workplace_id, local_start_date, local_end_date, start_time, end_time,
   workplace_timezone, starts_at, ends_at, status)
  VALUES(gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-000000000001',
   '2026-04-02', '2026-04-02', '10:00', '18:00', 'Europe/Moscow', '2026-04-02T07:00:00Z', '2026-04-02T15:00:00Z', 'planned');
  RAISE EXCEPTION 'FAIL [S6]: direct INSERT by client role must be denied';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;

SET ROLE shiftly_test_rls_b;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-00000000000b', true);
DO $$
DECLARE n bigint; e bigint;
BEGIN
 SELECT count(*) INTO n FROM public.shifts;
 SELECT shifts_b INTO e FROM s6_expected;
 IF n <> e OR e <> 1 THEN RAISE EXCEPTION 'FAIL [S6]: owner B must see exactly own 1 shift, saw %', n; END IF;
 SELECT count(*) INTO n FROM public.shifts WHERE user_id = 'aaaaaaaa-0000-0000-0000-00000000000a';
 IF n <> 0 THEN RAISE EXCEPTION 'FAIL [S6]: user B must not see shifts of A, saw %', n; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
DO $$ BEGIN RAISE NOTICE 'SCENARIO 6 OK: RLS isolates both users, direct writes denied'; END $$;

-- ============================================================================
-- SCENARIO 7: idempotency — same key + same payload replays the stored
-- response; same key + different payload conflicts (23505).
-- ============================================================================
DO $$
DECLARE u uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
 w uuid := 'bbbbbbbb-0000-0000-0000-000000000007';
 s uuid := 'cccccccc-0000-0000-0000-000000000070';
 k uuid := 'dddddddd-0000-0000-0000-000000000070';
 payload jsonb; r1 jsonb; r2 jsonb; n bigint; ops bigint;
BEGIN
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'workplace_edit',
  jsonb_build_object('id', w, 'name', 'Idem Spot', 'color', 'sky', 'timezone', 'Europe/Moscow'));
 payload := jsonb_build_object('id', s, 'workplace_id', w, 'local_start_date', '2026-04-10', 'local_end_date', '2026-04-10',
  'start_time', '10:00', 'end_time', '18:00', 'starts_at', '2026-04-10T07:00:00Z', 'ends_at', '2026-04-10T15:00:00Z');
 r1 := pg_temp.call_as(u, k, 'shift_create', payload);
 r2 := pg_temp.call_as(u, k, 'shift_create', payload);
 IF r1 IS DISTINCT FROM r2 THEN RAISE EXCEPTION 'FAIL [S7]: replay must return the stored response'; END IF;
 SELECT count(*) INTO n FROM public.shifts WHERE id = s;
 SELECT count(*) INTO ops FROM public.operation_requests WHERE user_id = u AND idempotency_key = k;
 IF n <> 1 OR ops <> 1 THEN RAISE EXCEPTION 'FAIL [S7]: expected 1 shift and 1 operation row, got % and %', n, ops; END IF;
 -- Reusing the SAME key with different content must conflict (23505).
 BEGIN
  PERFORM pg_temp.call_as(u, k, 'shift_create', payload || jsonb_build_object('comment', 'different'));
  RAISE EXCEPTION 'FAIL [S7]: same key with different payload must conflict';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 RAISE NOTICE 'SCENARIO 7 OK: idempotent replay and key conflict';
END $$;

-- ============================================================================
-- SCENARIO 8: trash -> restore -> delete -> purge, plus trash_clear.
-- ============================================================================
DO $$
DECLARE u uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
 w uuid := 'bbbbbbbb-0000-0000-0000-000000000008';
 s uuid := 'cccccccc-0000-0000-0000-000000000080';
 sh record; ev bigint; n bigint;
BEGIN
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'workplace_edit',
  jsonb_build_object('id', w, 'name', 'Trash Lab', 'color', 'green', 'timezone', 'Europe/Moscow'));
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'shift_create', jsonb_build_object(
  'id', s, 'workplace_id', w, 'local_start_date', '2026-04-20', 'local_end_date', '2026-04-20',
  'start_time', '10:00', 'end_time', '18:00', 'starts_at', '2026-04-20T07:00:00Z', 'ends_at', '2026-04-20T15:00:00Z',
  'tips', '50'));
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'shift_delete', jsonb_build_object('id', s, 'expected_revision', 1));
 SELECT deleted_at INTO sh FROM public.shifts WHERE id = s;
 IF sh.deleted_at IS NULL THEN RAISE EXCEPTION 'FAIL [S8]: shift_delete must set deleted_at'; END IF;
 PERFORM pg_temp.expect_error(u, 'shift_edit', jsonb_build_object('id', s, 'expected_revision', 2, 'tips', '60'), 'P0001', 'S8 edit of trashed shift rejected');
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'shift_restore', jsonb_build_object('id', s, 'expected_revision', 2));
 SELECT * INTO sh FROM public.shifts WHERE id = s;
 IF sh.deleted_at IS NOT NULL OR sh.tips IS DISTINCT FROM 50.00 THEN
  RAISE EXCEPTION 'FAIL [S8]: restore must reactivate the exact original (tips 50.00), got deleted_at=%, tips=%', sh.deleted_at, sh.tips;
 END IF;
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'shift_delete', jsonb_build_object('id', s, 'expected_revision', 3));
 PERFORM pg_temp.expect_error(u, 'shift_purge', jsonb_build_object('id', s, 'expected_revision', 4), 'P0001', 'S8 purge without confirm rejected');
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'shift_purge', jsonb_build_object('id', s, 'expected_revision', 4, 'confirm', 'true'));
 SELECT count(*) INTO n FROM public.shifts WHERE id = s;
 IF n <> 0 THEN RAISE EXCEPTION 'FAIL [S8]: purged shift must be gone'; END IF;
 SELECT count(*) INTO ev FROM public.shift_financial_events WHERE subject_shift_id = s AND event_type = 'purge';
 IF ev <> 1 THEN RAISE EXCEPTION 'FAIL [S8]: expected one purge audit event, got %', ev; END IF;
 -- Purge redaction: earlier events keep only the minimal snapshot.
 IF EXISTS (SELECT 1 FROM public.shift_financial_events WHERE subject_shift_id = s
   AND event_type <> 'purge' AND (before_snapshot ? 'comment' OR after_snapshot ? 'comment')) THEN
  RAISE EXCEPTION 'FAIL [S8]: purge must redact earlier snapshots to the minimal set';
 END IF;
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'trash_clear', jsonb_build_object('confirm', 'true'));
 RAISE NOTICE 'SCENARIO 8 OK: trash, exact restore, confirmed purge with redaction';
END $$;

-- ============================================================================
-- SCENARIO 9: controlled account deletion (service path only).
-- ============================================================================
DO $$
DECLARE u uuid := 'aaaaaaaa-0000-0000-0000-00000000000c';
 w uuid := 'bbbbbbbb-0000-0000-0000-00000000000c';
 s uuid := 'cccccccc-0000-0000-0000-0000000000c0';
 r jsonb; n bigint; t text;
BEGIN
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'workplace_edit',
  jsonb_build_object('id', w, 'name', 'Goodbye Inc', 'color', 'amber', 'timezone', 'Europe/Moscow'));
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'shift_create', jsonb_build_object(
  'id', s, 'workplace_id', w, 'local_start_date', '2026-04-15', 'local_end_date', '2026-04-15',
  'start_time', '10:00', 'end_time', '18:00', 'starts_at', '2026-04-15T07:00:00Z', 'ends_at', '2026-04-15T15:00:00Z'));
 -- Refused while the auth identity still exists.
 BEGIN
  PERFORM public.shiftly_delete_account(u);
  RAISE EXCEPTION 'FAIL [S9]: deletion with live auth identity must be refused';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 -- Controlled flow: auth identity removed first, profile cascade follows.
 DELETE FROM auth.users WHERE id = u;
 r := public.shiftly_delete_account(u); -- idempotent even after the cascade
 IF r->>'deleted' IS DISTINCT FROM u::text THEN RAISE EXCEPTION 'FAIL [S9]: unexpected deletion response %', r; END IF;
 r := public.shiftly_delete_account(u); -- second call is a no-op, not an error
 FOREACH t IN ARRAY ARRAY['profiles','workplaces','operation_requests','rate_versions','rate_intervals',
   'commission_rule_versions','commission_thresholds','shifts','shift_adjustments','shift_fixed_payments',
   'monthly_commission_results','shift_financial_events'] LOOP
  EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', t, CASE t WHEN 'profiles' THEN 'id' ELSE 'user_id' END)
  INTO n USING u;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL [S9]: % rows of the deleted account remain in %', n, t; END IF;
 END LOOP;
 -- The other users are untouched.
 SELECT count(*) INTO n FROM public.profiles WHERE id IN ('aaaaaaaa-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-00000000000b');
 IF n <> 2 THEN RAISE EXCEPTION 'FAIL [S9]: other users must be untouched, found %', n; END IF;
 RAISE NOTICE 'SCENARIO 9 OK: account deletion guarded, cascading, idempotent';
END $$;

-- ============================================================================
-- SCENARIO 10: timezones and DST (America/New_York).
--   * spring-forward gap: 2026-03-08 02:30 local does not exist -> rejected;
--   * a shift spanning the gap with correct UTC instants -> accepted;
--   * fall-back: 2026-11-01 01:30 local occurs twice; both copies are stored
--     with distinct UTC instants;
--   * local/UTC mismatch on seconds -> rejected.
-- ============================================================================
DO $$
DECLARE u uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
 w uuid := 'bbbbbbbb-0000-0000-0000-000000000010';
 s_gap uuid := 'cccccccc-0000-0000-0000-000000000100';
 s_bad uuid := 'cccccccc-0000-0000-0000-000000000101';
 s_fb1 uuid := 'cccccccc-0000-0000-0000-000000000102';
 s_fb2 uuid := 'cccccccc-0000-0000-0000-000000000103';
 s_sec uuid := 'cccccccc-0000-0000-0000-000000000104';
 a timestamptz; b timestamptz;
BEGIN
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'workplace_edit',
  jsonb_build_object('id', w, 'name', 'NY Diner', 'color', 'rose', 'timezone', 'America/New_York'));
 -- Valid shift across the spring-forward gap: 01:30 EST -> 03:30 EDT.
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'shift_create', jsonb_build_object(
  'id', s_gap, 'workplace_id', w, 'local_start_date', '2026-03-08', 'local_end_date', '2026-03-08',
  'start_time', '01:30', 'end_time', '03:30', 'starts_at', '2026-03-08T06:30:00Z', 'ends_at', '2026-03-08T07:30:00Z'));
 -- Nonexistent local time 02:30 (07:30 UTC is already 03:30 EDT): rejected by the timezone trigger.
 PERFORM pg_temp.expect_error(u, 'shift_create', jsonb_build_object(
  'id', s_bad, 'workplace_id', w, 'local_start_date', '2026-03-08', 'local_end_date', '2026-03-08',
  'start_time', '02:30', 'end_time', '03:30', 'starts_at', '2026-03-08T07:30:00Z', 'ends_at', '2026-03-08T08:30:00Z'),
  '22023', 'S10 nonexistent local time rejected');
 -- Fall-back: local 01:30-01:50 happens twice (EDT then EST); both UTC
 -- resolutions are valid and distinct. (01:30-02:30 would not exist whole:
 -- EDT ends at 02:00, when the clock falls back to 01:00 EST.)
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'shift_create', jsonb_build_object(
  'id', s_fb1, 'workplace_id', w, 'local_start_date', '2026-11-01', 'local_end_date', '2026-11-01',
  'start_time', '01:30', 'end_time', '01:50', 'starts_at', '2026-11-01T05:30:00Z', 'ends_at', '2026-11-01T05:50:00Z'));
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'shift_create', jsonb_build_object(
  'id', s_fb2, 'workplace_id', w, 'local_start_date', '2026-11-01', 'local_end_date', '2026-11-01',
  'start_time', '01:30', 'end_time', '01:50', 'starts_at', '2026-11-01T06:30:00Z', 'ends_at', '2026-11-01T06:50:00Z'));
 SELECT starts_at INTO a FROM public.shifts WHERE id = s_fb1;
 SELECT starts_at INTO b FROM public.shifts WHERE id = s_fb2;
 IF a = b THEN RAISE EXCEPTION 'FAIL [S10]: the two copies of the repeated local time must differ in UTC'; END IF;
 -- Second-level mismatch between local fields and UTC instants: rejected.
 PERFORM pg_temp.expect_error(u, 'shift_create', jsonb_build_object(
  'id', s_sec, 'workplace_id', w, 'local_start_date', '2026-05-20', 'local_end_date', '2026-05-20',
  'start_time', '10:00', 'end_time', '18:00', 'starts_at', '2026-05-20T14:00:30Z', 'ends_at', '2026-05-20T22:00:00Z'),
  '22023', 'S10 second-level mismatch rejected');
 RAISE NOTICE 'SCENARIO 10 OK: DST gap, repeated local time and consistency guard';
END $$;

-- ============================================================================
-- SCENARIO 11: money validators and the SQLSTATE contract.
-- ============================================================================
DO $$
DECLARE u uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
 w uuid := 'bbbbbbbb-0000-0000-0000-000000000011';
 s uuid := 'cccccccc-0000-0000-0000-000000000110';
BEGIN
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'workplace_edit',
  jsonb_build_object('id', w, 'name', 'Validators', 'color', 'violet', 'timezone', 'Europe/Moscow'));
 PERFORM pg_temp.call_as(u, gen_random_uuid(), 'shift_create', jsonb_build_object(
  'id', s, 'workplace_id', w, 'local_start_date', '2026-04-25', 'local_end_date', '2026-04-25',
  'start_time', '10:00', 'end_time', '18:00', 'starts_at', '2026-04-25T07:00:00Z', 'ends_at', '2026-04-25T15:00:00Z'));
 -- Money must be canonical decimal strings: JSON numbers, extra decimals,
 -- exponents and signs are all rejected with 22023.
 PERFORM pg_temp.expect_error(u, 'shift_complete', jsonb_build_object('id', s, 'expected_revision', 1, 'revenue', 33.33, 'expected_revenue_revision', 1), '22023', 'S11 JSON number rejected');
 PERFORM pg_temp.expect_error(u, 'shift_complete', jsonb_build_object('id', s, 'expected_revision', 1, 'revenue', '10.999', 'expected_revenue_revision', 1), '22023', 'S11 extra decimals rejected');
 PERFORM pg_temp.expect_error(u, 'shift_complete', jsonb_build_object('id', s, 'expected_revision', 1, 'revenue', '1e3', 'expected_revenue_revision', 1), '22023', 'S11 exponent rejected');
 PERFORM pg_temp.expect_error(u, 'shift_complete', jsonb_build_object('id', s, 'expected_revision', 1, 'revenue', '-5', 'expected_revenue_revision', 1), '22023', 'S11 sign rejected');
 -- Unknown payload fields are rejected per operation allow-list.
 PERFORM pg_temp.expect_error(u, 'shift_edit', jsonb_build_object('id', s, 'expected_revision', 1, 'hack', 'x'), '22023', 'S11 unknown field rejected');
 -- Nested money inside adjustments is validated the same way.
 PERFORM pg_temp.expect_error(u, 'shift_edit', jsonb_build_object('id', s, 'expected_revision', 1,
  'adjustments', jsonb_build_array(jsonb_build_object('kind','bonus','label','b','amount', 10))), '22023', 'S11 nested JSON number rejected');
 -- SQLSTATE contract: 42501 without auth, 40001 on revision conflict.
 PERFORM pg_temp.expect_error(NULL, 'shift_edit', jsonb_build_object('id', s, 'expected_revision', 1), '42501', 'S11 unauthenticated rejected');
 PERFORM pg_temp.expect_error(u, 'shift_edit', jsonb_build_object('id', s, 'expected_revision', 999, 'tips', '1'), '40001', 'S11 revision conflict');
 RAISE NOTICE 'SCENARIO 11 OK: validators and SQLSTATE contract';
END $$;

-- ============================================================================
-- Final consistency sweep, then ROLLBACK removes every fixture row, role,
-- scaffold object and helper created above.
-- ============================================================================
DO $$
DECLARE r record; n bigint; leftovers text := '';
BEGIN
 FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
  EXECUTE format('SELECT count(*) FROM public.%I', r.tablename) INTO n;
  IF n = 0 THEN leftovers := leftovers || r.tablename || ' '; END IF;
 END LOOP;
 RAISE NOTICE 'ALL SCENARIOS PASSED (1-11). Rolling back; no test data persists.';
END $$;

ROLLBACK;
