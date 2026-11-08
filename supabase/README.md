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
- `tests/v3_contract.sql`: catalog contracts and pure monetary/time expressions, without fixture rows.
- `STAGE2_REPORT.md`: validation evidence, contradictions, missing end-to-end coverage and release blockers.

## Security and callers

`public.shiftly_write(uuid,text,jsonb)` is callable by authenticated users only and derives identity from `auth.uid()`. It is SECURITY DEFINER with a fixed search path. Client DML is revoked on all 12 tables; SELECT is owner-scoped by RLS. Helpers are in a schema not accessible to anon/authenticated. `public.shiftly_close_month(uuid,uuid,date,uuid)` is service-role-only; no scheduler is installed. The privileged key must never reach browsers.

All changes in one RPC are a single PostgreSQL transaction. Operation keys are unique within an owner. Same key/content replays the stored result; different content raises a conflict. Per-owner advisory locking establishes a deterministic order for moves, with additional workplace-month serialization. This intentionally trades concurrency within one owner for correctness; different owners remain independent.

Monetary payload values are canonical decimal strings or JSON null, never computed totals. Fixed payment snapshots come from sealed server-side rules. Financial rule and adjustment subobjects currently cast NUMERIC directly; strict nested canonical-string validation remains a pre-release gate documented in the report.

## Known approval gates

Historical `confirm_history` is **not implemented**: model v3 does not define a verifiable preview/confirmation contract. Retroactive publication with completed shifts is rejected rather than silently applying a new rule. Changing a workplace timezone with existing shifts is also rejected pending a historical month-close policy. These are explicit safe failures, not new product decisions; do not deploy before they are resolved.

No profile provisioning trigger or account-deletion endpoint is connected: authentication belongs to the next stage. Database cascade supports deletion from auth.users; backup retention remains an operational obligation.
