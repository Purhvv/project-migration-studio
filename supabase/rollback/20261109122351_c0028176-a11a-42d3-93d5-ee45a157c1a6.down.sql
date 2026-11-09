-- Migration 10 is forward-only. This rollback intentionally refuses execution.
-- Reintroducing TRUNCATE/REFERENCES/TRIGGER would restore the confirmed security risk.
-- No automatic rollback is permitted. A separately approved recovery migration
-- must use a verified privilege snapshot; do not infer historical ACLs from owners.
DO $$
BEGIN
 RAISE EXCEPTION 'Forward-only security migration: rollback is disabled; use separately approved recovery with verified ACL snapshot';
END $$;