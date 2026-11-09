# Shiftly — Stage 2, offline v3 migrations

Prepared 2026-11-08. **Not connected, not deployed, not wired to the interface.**

Apply migrations in ascending filename order only after separate approval, a backup, and a clean isolated integration test. Rollback files live outside `migrations/` and run in reverse order. Never run a `.down.sql` against user data: restore a verified backup instead.

## Files and responsibilities

- `migrations/20261108140000_v3_schema.sql`: exactly 12 approved public tables; owner-scoped composite FK, NUMERIC, CHECK, indexes, grants and read-only owner RLS.
- `migrations/20261108141000_v3_guards.sql`: IANA/UTC-local consistency, sealed parent/child immutability, publication validation, constrained append-only audit, account-cascade exception, earnings and idempotency helpers.
- `migrations/20261108142000_v3_finance.sql`: actual elapsed hourly pay, independent monthly commissions, scheduler-only local-month close.
- `migrations/20261108143000_v3_operations.sql`: authenticated atomic writes, expected revisions, conflict override, version publication, archive, trash/restore/purge, financial changes and audit.
- `migrations/20261108144000_v3_finance_hardening.sql`: forward correction of provisional cent allocation, `none` commission, unchanged hourly snapshots and exact restoration.
- `rollback/`: one reverse file per migration.
- `migrations/20261108150000_v3_1_commission_largest_remainder.sql`: Largest Remainder cent allocation and digest hardening.
- `migrations/20261108151000_v3_1_status_and_validation.sql`: explicit status machine, strict nested money validation, atomic local/UTC time updates.
- `migrations/20261108152000_v3_1_versions_and_account.sql`: per-workplace version revisions, future planned-shift recalculation, service-role account deletion.
- `migrations/20261108153000_v3_1_timezone_guard.sql`: split timezone trigger (fixes profiles/workplaces insert failure found by fixture testing).
- `tests/v3_contract.sql`: catalog contracts and pure monetary/time expressions, without fixture rows.
- `tests/v3_1_contract.sql`: stage 2.1 catalog and validator contracts, without fixture rows.
- `tests/v3_1_scenarios.sql`: 11 permanent scenario tests (Largest Remainder, revisions, future recalculation, status machine, RLS, idempotency, trash, account deletion, DST, validators). Runs only in a disposable empty database with `PGOPTIONS='-c app.shiftly_test_env=on'`; single transaction, rolled back — no test data persists.
- `tests/v3_1_concurrency.sh`: real parallel sessions; independent external confirmation, pinned /tmp Unix socket, read-only preflight, no Auth replacement; drops the ENTIRE marked disposable database on success/error/INT/TERM. Arbitrary DSNs are rejected. External owner must finally destroy the cluster, including after SIGKILL or cleanup failure. Never run against Cloud or a working database.
- `tests/v3_1_harness_safety.py`: permanent local regression checks for preflight refusals, three C1–C3 rounds, SQL-error and signal cleanup. Requires an independently prepared marked `shiftly_disposable_seed` on PostgreSQL 17.11 (port 54399); changes only this disposable environment. The owner must destroy the entire cluster afterwards.
- `STAGE2_REPORT.md`: validation evidence, contradictions, missing end-to-end coverage and release blockers, including the stage 2.1 fix/test report (57 isolated scenario checks, all passed).

## Security and callers

`public.shiftly_write(uuid,text,jsonb)` is callable by authenticated users only and derives identity from `auth.uid()`. It is SECURITY DEFINER with a fixed search path. Client DML is revoked on all 12 tables; SELECT is owner-scoped by RLS. Helpers are in a schema not accessible to anon/authenticated. `public.shiftly_close_month(uuid,uuid,date,uuid)` is service-role-only; no scheduler is installed. The privileged key must never reach browsers.

All changes in one RPC are a single PostgreSQL transaction. Operation keys are unique within an owner. Same key/content replays the stored result; different content raises a conflict. Per-owner advisory locking establishes a deterministic order for moves, with additional workplace-month serialization. This intentionally trades concurrency within one owner for correctness; different owners remain independent.

Monetary payload values are canonical decimal strings or JSON null, never computed totals. Fixed payment snapshots come from sealed server-side rules. Stage 2.1 validates nested money and rejects JSON numbers/unknown fields.

## Settled v3 decisions

- `profiles.monthly_goal`: NUMERIC(14,2).
- `workplaces.revenue_goal`: NUMERIC(14,2).
- A rate_interval_id may source a fixed payment for a shift only once: UNIQUE(shift_id, rate_interval_id). These are approved, not unresolved gates; migrations remain unchanged.

## Local concurrency run (destructive; never Cloud)

The independent owner first prepares a fresh PostgreSQL 17.11 cluster under `/tmp/shiftly-disposable-…` with TCP disabled, test roles/minimal Auth and the nine unchanged migrations. The target database name must start `shiftly_disposable_`; the owner sets its database COMMENT to `shiftly-disposable-local-v1`. Preflight checks actual server metadata, not only names/GUC. No existing project is an acceptable target.

```sh
SHIFTLY_LOCAL_TEST_CONFIRM=DESTROY_DISPOSABLE_LOCAL_DATABASE \
PGOPTIONS='-c app.shiftly_test_env=on' \
TEST_CLUSTER_DIR=/tmp/shiftly-disposable-REPLACE \
TEST_DB_NAME=shiftly_disposable_REPLACE \
TEST_DB_PORT=54399 \
bash supabase/tests/v3_1_concurrency.sh
```

The REPLACE tokens are documentation placeholders, not an executable setup. Use lowercase database suffixes. Successful preflight arms whole-database cleanup; rejected preflight makes no schema/data changes. Auth is never rewritten by this harness. The external owner must stop/remove the entire cluster after testing; no trap can handle SIGKILL/power loss. Safety regression command for the marked disposable seed: `TEST_CLUSTER_DIR=<local cluster> python3 supabase/tests/v3_1_harness_safety.py`.

## Known approval gates

Historical `confirm_history` is **not implemented**: model v3 does not define a verifiable preview/confirmation contract. Retroactive publication with completed shifts is rejected rather than silently applying a new rule. Changing a workplace timezone with existing shifts is also rejected pending a historical month-close policy. These are explicit safe failures, not new product decisions; do not deploy before they are resolved.

No profile provisioning trigger or account-deletion endpoint is connected: authentication belongs to the next stage. Database cascade supports deletion from auth.users; backup retention remains an operational obligation.
