-- ============================================================================
-- MIGRATION: 20261008_zone5_messages.sql
-- DESCRIPTION: Zone 5 texts (client 2026-10-08).
--              1. route_cycles.decided_at: when the Monday evening job decided a
--                 run (confirmed, or moved a week), so it is decided and texted
--                 only once.
--              2. waitlist.sms_consent: the person ticked "text me" when joining,
--                 so they get texts (everyone else gets email).
--              3. waitlist.notified_at: when they were told Zone 5 opened, so
--                 nobody gets that message twice.
-- TYPE: ADDITIVE (new nullable columns, one with a default)
-- BEFORE RUNNING: nothing to back up.
-- ============================================================================
BEGIN;

ALTER TABLE route_cycles ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;

ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS sms_consent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_waitlist_zone5_pending
  ON waitlist(created_at) WHERE reason = 'zone5_not_started' AND notified_at IS NULL;

COMMIT;

-- ============================================================================
-- VERIFY (read-only):
-- select
--   (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'route_cycles' and column_name = 'decided_at') as run_decided,
--   (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'waitlist' and column_name in ('sms_consent', 'notified_at')) as waitlist_columns
-- limit 1;
-- ============================================================================
-- ROLLBACK SCRIPT (run as one block):
-- BEGIN;
-- DROP INDEX IF EXISTS idx_waitlist_zone5_pending;
-- ALTER TABLE waitlist DROP COLUMN IF EXISTS notified_at;
-- ALTER TABLE waitlist DROP COLUMN IF EXISTS sms_consent;
-- ALTER TABLE route_cycles DROP COLUMN IF EXISTS decided_at;
-- COMMIT;
-- ============================================================================
