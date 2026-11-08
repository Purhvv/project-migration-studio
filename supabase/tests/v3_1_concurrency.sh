#!/usr/bin/env bash
# Shiftly v3.1 concurrency tests (scenario 12) — real parallel sessions.
#
# SAFETY CONTRACT:
#   * Run ONLY against a disposable, isolated test database with the 9 v3/v3.1
#     migrations applied. NEVER against Supabase Cloud or a working database.
#   * Requires TEST_DB_DSN (libpq connection string) pointing at that database.
#   * The script opts in via app.shiftly_test_env=on and refuses to run if the
#     target database is not empty of business rows before its own fixture.
#   * The fixture user is deleted at the end (auth.users cascade); a trap
#     guarantees cleanup even on failure.
#
# Covered concurrency scenarios (real parallelism via background psql):
#   C1. Two parallel rate publications -> distinct sequential revisions.
#   C2. Two parallel edits of one shift -> exactly one winner, one 40001.
#   C3. Parallel month_recalc + shift_complete -> no deadlock, consistent
#       monthly row (commission_amount equals the sum of per-shift shares).
set -euo pipefail

DSN="${TEST_DB_DSN:?Set TEST_DB_DSN to a disposable test database with the v3/v3.1 migrations applied}"
export PGOPTIONS="-c app.shiftly_test_env=on ${PGOPTIONS:-}"
TMP="$(mktemp -d)"
U="eeeeeeee-0000-0000-0000-$(printf '%012d' $RANDOM)"
W="ffffffff-0000-0000-0000-$(printf '%012d' $RANDOM)"

cleanup() {
  psql "$DSN" -q -v ON_ERROR_STOP=0 \
    -c "DELETE FROM auth.users WHERE id = '$U';" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

psql_run() { psql "$DSN" -q -v ON_ERROR_STOP=1 -t -A "$@"; }

echo "== fixture =="
psql_run <<SQL
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE SET search_path = pg_catalog AS \$\$
 SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
\$\$;
DO \$\$
DECLARE r record; n bigint;
BEGIN
 IF current_setting('app.shiftly_test_env', true) IS DISTINCT FROM 'on' THEN
  RAISE EXCEPTION 'REFUSED: app.shiftly_test_env=on required';
 END IF;
 FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
  EXECUTE format('SELECT count(*) FROM public.%I', r.tablename) INTO n;
  IF n <> 0 THEN RAISE EXCEPTION 'REFUSED: table % is not empty; use a fresh disposable database', r.tablename; END IF;
 END LOOP;
END \$\$;
INSERT INTO auth.users(id) VALUES ('$U');
INSERT INTO public.profiles(id, name, timezone) VALUES ('$U', 'Concurrency Test', 'Europe/Moscow');
SELECT set_config('request.jwt.claim.sub', '$U', false);
SELECT public.shiftly_write(gen_random_uuid(), 'workplace_edit',
 jsonb_build_object('id', '$W', 'name', 'Conc Cafe', 'color', 'sky', 'timezone', 'Europe/Moscow'));
SELECT public.shiftly_write(gen_random_uuid(), 'publish_rates', jsonb_build_object(
 'workplace_id', '$W', 'effective_from', '2026-01-01', 'intervals', jsonb_build_array(
  jsonb_build_object('kind','hourly','start_time','00:00','end_time','23:59','hourly','100','label','base'))));
SELECT public.shiftly_write(gen_random_uuid(), 'publish_commission', jsonb_build_object(
 'workplace_id', '$W', 'effective_from', '2026-01-01', 'mode', 'fixed', 'fixed_percent', '10'));
SQL

echo "== C1: parallel publications get distinct sequential revisions =="
psql "$DSN" -q -v ON_ERROR_STOP=1 >"$TMP/c1a.out" 2>&1 <<SQL &
SELECT set_config('request.jwt.claim.sub', '$U', false);
SELECT public.shiftly_write(gen_random_uuid(), 'publish_rates', jsonb_build_object(
 'workplace_id', '$W', 'effective_from', '2026-07-01', 'intervals', jsonb_build_array(
  jsonb_build_object('kind','hourly','start_time','00:00','end_time','23:59','hourly','150','label','july'))));
SQL
psql "$DSN" -q -v ON_ERROR_STOP=1 >"$TMP/c1b.out" 2>&1 <<SQL &
SELECT set_config('request.jwt.claim.sub', '$U', false);
SELECT public.shiftly_write(gen_random_uuid(), 'publish_rates', jsonb_build_object(
 'workplace_id', '$W', 'effective_from', '2026-08-01', 'intervals', jsonb_build_array(
  jsonb_build_object('kind','hourly','start_time','00:00','end_time','23:59','hourly','175','label','august'))));
SQL
wait
REVS="$(psql_run -c "SELECT string_agg(revision::text, ',' ORDER BY revision) FROM public.rate_versions WHERE workplace_id = '$W';")"
[ "$REVS" = "1,2,3" ] || { echo "FAIL C1: expected revisions 1,2,3; got $REVS"; cat "$TMP"/c1*.out; exit 1; }
echo "C1 OK: revisions $REVS, no duplicates"

echo "== C2: parallel edits of one shift — one winner, one revision conflict =="
SID="cccccccc-1111-1111-1111-$(printf '%012d' $RANDOM)"
psql_run <<SQL
SELECT set_config('request.jwt.claim.sub', '$U', false);
SELECT public.shiftly_write(gen_random_uuid(), 'shift_create', jsonb_build_object(
 'id', '$SID', 'workplace_id', '$W', 'local_start_date', '2026-05-10', 'local_end_date', '2026-05-10',
 'start_time', '10:00', 'end_time', '18:00', 'starts_at', '2026-05-10T07:00:00Z', 'ends_at', '2026-05-10T15:00:00Z'));
SQL
psql "$DSN" -q -v ON_ERROR_STOP=1 >"$TMP/c2a.out" 2>&1 <<SQL &
SELECT set_config('request.jwt.claim.sub', '$U', false);
SELECT public.shiftly_write(gen_random_uuid(), 'shift_edit',
 jsonb_build_object('id', '$SID', 'expected_revision', 1, 'tips', '10'));
SQL
psql "$DSN" -q -v ON_ERROR_STOP=1 >"$TMP/c2b.out" 2>&1 <<SQL &
SELECT set_config('request.jwt.claim.sub', '$U', false);
SELECT public.shiftly_write(gen_random_uuid(), 'shift_edit',
 jsonb_build_object('id', '$SID', 'expected_revision', 1, 'tips', '20'));
SQL
set +e
wait
set -e
C2_OK=0; C2_CONFLICT=0
grep -q "shiftly_write" "$TMP/c2a.out" && ! grep -qi "ERROR" "$TMP/c2a.out" && C2_OK=$((C2_OK+1))
grep -q "shiftly_write" "$TMP/c2b.out" && ! grep -qi "ERROR" "$TMP/c2b.out" && C2_OK=$((C2_OK+1))
grep -qi "40001\|revision conflict" "$TMP/c2a.out" && C2_CONFLICT=$((C2_CONFLICT+1))
grep -qi "40001\|revision conflict" "$TMP/c2b.out" && C2_CONFLICT=$((C2_CONFLICT+1))
FINAL_REV="$(psql_run -c "SELECT revision FROM public.shifts WHERE id = '$SID';")"
if [ "$C2_OK" -ne 1 ] || [ "$C2_CONFLICT" -ne 1 ] || [ "$FINAL_REV" != "2" ]; then
  echo "FAIL C2: winners=$C2_OK conflicts=$C2_CONFLICT final_revision=$FINAL_REV"; cat "$TMP"/c2*.out; exit 1
fi
echo "C2 OK: exactly one winner, one 40001 conflict, final revision 2"

echo "== C3: parallel month_recalc + shift_complete — no deadlock, consistent result =="
SID2="cccccccc-2222-2222-2222-$(printf '%012d' $RANDOM)"
psql_run <<SQL
SELECT set_config('request.jwt.claim.sub', '$U', false);
SELECT public.shiftly_write(gen_random_uuid(), 'shift_create', jsonb_build_object(
 'id', '$SID2', 'workplace_id', '$W', 'local_start_date', '2026-05-11', 'local_end_date', '2026-05-11',
 'start_time', '10:00', 'end_time', '18:00', 'starts_at', '2026-05-11T07:00:00Z', 'ends_at', '2026-05-11T15:00:00Z'));
SQL
psql "$DSN" -q -v ON_ERROR_STOP=1 >"$TMP/c3a.out" 2>&1 <<SQL &
SELECT set_config('request.jwt.claim.sub', '$U', false);
SELECT public.shiftly_write(gen_random_uuid(), 'month_recalc',
 jsonb_build_object('workplace_id', '$W', 'month', '2026-05-01'));
SQL
psql "$DSN" -q -v ON_ERROR_STOP=1 >"$TMP/c3b.out" 2>&1 <<SQL &
SELECT set_config('request.jwt.claim.sub', '$U', false);
SELECT public.shiftly_write(gen_random_uuid(), 'shift_complete', jsonb_build_object(
 'id', '$SID2', 'expected_revision', 1, 'revenue', '1000', 'expected_revenue_revision', 1));
SQL
set +e
wait
set -e
if grep -qi "deadlock" "$TMP/c3a.out" "$TMP/c3b.out"; then
  echo "FAIL C3: deadlock detected"; cat "$TMP"/c3*.out; exit 1
fi
# Both operations must have succeeded.
grep -qi "ERROR" "$TMP/c3a.out" && { echo "FAIL C3: month_recalc failed"; cat "$TMP/c3a.out"; exit 1; }
grep -qi "ERROR" "$TMP/c3b.out" && { echo "FAIL C3: shift_complete failed"; cat "$TMP/c3b.out"; exit 1; }
# Consistency: a final recalculation converges; monthly amount equals the sum of shares.
psql_run <<SQL >/dev/null
SELECT set_config('request.jwt.claim.sub', '$U', false);
SELECT public.shiftly_write(gen_random_uuid(), 'month_recalc',
 jsonb_build_object('workplace_id', '$W', 'month', '2026-05-01'));
SQL
CONSISTENT="$(psql_run -c "
SELECT CASE WHEN m.commission_amount IS NOT DISTINCT FROM s.total THEN 'yes' ELSE 'no' END
FROM public.monthly_commission_results m
JOIN (SELECT workplace_id, sum(commission_pay) total FROM public.shifts
      WHERE workplace_id = '$W' AND status = 'completed' AND deleted_at IS NULL
        AND local_start_date >= '2026-05-01' AND local_start_date < '2026-06-01'
      GROUP BY workplace_id) s ON s.workplace_id = m.workplace_id
WHERE m.workplace_id = '$W' AND m.month = '2026-05-01';")"
[ "$CONSISTENT" = "yes" ] || { echo "FAIL C3: monthly commission inconsistent after concurrency"; exit 1; }
echo "C3 OK: no deadlock, monthly row consistent with per-shift shares"

echo "ALL CONCURRENCY TESTS PASSED (C1-C3)"
