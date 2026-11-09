#!/usr/bin/env bash
# Shiftly v3.1 concurrency tests (scenario 12) — real parallel sessions.
#
# SAFETY CONTRACT:
#   * Run ONLY against a disposable, isolated test database with the 9 v3/v3.1
#     migrations applied. NEVER against Supabase Cloud or a working database.
#   * Requires independent external confirmation and a pinned /tmp Unix socket.
#   * Never accepts a DSN, TCP endpoint, or inherited libpq configuration.
#   * Read-only preflight precedes ALL changes. Auth scaffold is never modified.
#   * After successful preflight, the ENTIRE disposable database is dropped on
#     success, failure, INT or TERM; cleanup failure is a nonzero exit.
#   * SIGKILL/power loss cannot run traps: the external owner must also destroy
#     the whole disposable cluster. GUC alone is never proof of safety.
#
# Covered concurrency scenarios (real parallelism via background psql):
#   C1. Two parallel rate publications -> distinct sequential revisions.
#   C2. Two parallel edits of one shift -> exactly one winner, one 40001.
#   C3. Parallel month_recalc + shift_complete -> no deadlock, consistent
#       monthly row (commission_amount equals the sum of per-shift shares).
set -euo pipefail

refuse() { echo "REFUSED: $*" >&2; exit 2; }
[ "${SHIFTLY_LOCAL_TEST_CONFIRM:-}" = 'DESTROY_DISPOSABLE_LOCAL_DATABASE' ] || refuse 'external destructive-test confirmation required'
[ -z "${TEST_DB_DSN:-}" ] || refuse 'DSN is forbidden; use pinned local parameters'
ROOT="${TEST_CLUSTER_DIR:-}"
DB="${TEST_DB_NAME:-}"
PORT="${TEST_DB_PORT:-}"
[[ "$ROOT" =~ ^/tmp/shiftly-disposable-[A-Za-z0-9]+$ ]] || refuse 'invalid disposable cluster path'
[ -d "$ROOT" ] && [ ! -L "$ROOT" ] && [ "$(realpath "$ROOT")" = "$ROOT" ] || refuse 'cluster directory must be real and local'
[[ "$DB" =~ ^shiftly_disposable_[a-z0-9_]+$ ]] || refuse 'database name must be explicitly disposable'
[[ "$PORT" =~ ^[0-9]{4,5}$ ]] && [ "$PORT" -ge 1024 ] && [ "$PORT" -le 65535 ] || refuse 'invalid port'
[ "${PGOPTIONS:-}" = '-c app.shiftly_test_env=on' ] || refuse 'external PGOPTIONS opt-in required'
[ -S "$ROOT/.s.PGSQL.$PORT" ] || refuse 'local Unix socket missing'
# Strip all inherited PG* settings, service files and startup files. Only the
# single caller-supplied opt-in survives as an explicit psql option.
for name in $(compgen -e); do [[ "$name" == PG* ]] && unset "$name"; done
export PGOPTIONS='-c app.shiftly_test_env=on -c statement_timeout=30000 -c lock_timeout=15000'
export PGSERVICEFILE=/dev/null PGPASSFILE=/dev/null PGCONNECT_TIMEOUT=5
BASE=(-X -w -h "$ROOT" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -v VERBOSITY=verbose)
psql_run() { psql "${BASE[@]}" -d "$DB" -q -t -A "$@"; }
DSN="host=$ROOT port=$PORT user=postgres dbname=$DB"
# Metadata is installed only by the independent owner of a fresh test cluster.
# Read-only checks verify actual server address, database, physical directory,
# version, roles, minimal Auth shape, hosted markers and all row counts.
psql_run -v root="$ROOT" -v db="$DB" <<'SQL'
BEGIN READ ONLY;
SELECT set_config('shiftly.expected_root', :'root', true), set_config('shiftly.expected_db', :'db', true);
DO $$
DECLARE r record; n bigint;
BEGIN
 IF inet_server_addr() IS NOT NULL OR current_database() <> current_setting('shiftly.expected_db')
    OR current_setting('data_directory') <> current_setting('shiftly.expected_root') || '/data'
    OR current_setting('listen_addresses') <> '' OR current_setting('server_version') <> '17.11'
    OR obj_description((SELECT oid FROM pg_database WHERE datname=current_database()), 'pg_database')
       IS DISTINCT FROM 'shiftly-disposable-local-v1'
    OR current_setting('app.shiftly_test_env', true) IS DISTINCT FROM 'on' THEN
  RAISE EXCEPTION 'REFUSED: actual endpoint/version/disposable metadata mismatch';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper AND rolcreatedb)
    OR (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')) <> 3
    OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname ~* 'supabase|production|^prod[_-]')
    OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspname ~* 'supabase|^storage$|^realtime$|^auth_admin$')
    OR EXISTS (SELECT 1 FROM pg_database WHERE datname ~* 'supabase|production|^prod[_-]') THEN
  RAISE EXCEPTION 'REFUSED: required test roles missing or hosted/production marker present';
 END IF;
 IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='auth' AND table_name='users') <> 1
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='auth' AND table_name='users' AND column_name='id' AND data_type='uuid')
    OR (SELECT count(*) FROM pg_tables WHERE schemaname='auth') <> 1
    OR to_regprocedure('auth.uid()') IS NULL
    OR (SELECT count(*) FROM pg_tables WHERE schemaname='public') <> 12
    OR to_regprocedure('public.shiftly_write(uuid,text,jsonb)') IS NULL THEN
  RAISE EXCEPTION 'REFUSED: expected minimal local Auth and v3 schema missing';
 END IF;
 FOR r IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') AND schemaname NOT LIKE 'pg_toast%' LOOP
  EXECUTE format('SELECT count(*) FROM %I.%I', r.schemaname, r.tablename) INTO n;
  IF n <> 0 THEN RAISE EXCEPTION 'REFUSED: user data exists in %.%', r.schemaname, r.tablename; END IF;
 END LOOP;
END $$;
ROLLBACK;
SQL
TMP="$(mktemp -d)"
U="eeeeeeee-0000-0000-0000-$(printf '%012d' $RANDOM)"
W="ffffffff-0000-0000-0000-$(printf '%012d' $RANDOM)"

cleanup() {
  local status=$? failed=0 pid
  trap - EXIT INT TERM
  for pid in $(jobs -pr); do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
  if ! psql "${BASE[@]}" -d postgres -q -c "DROP DATABASE \"$DB\" WITH (FORCE);"; then
    echo 'CLEANUP FAILED: external owner MUST destroy the entire local cluster' >&2
    failed=1
  else
    echo "CLEANUP OK: disposable database destroyed"
  fi
  rm -rf "$TMP"
  [ "$failed" -eq 0 ] || status=1
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "== fixture =="
psql_run <<SQL
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
