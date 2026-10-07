-- ============================================================================
-- MIGRATION: 20261007_zones_v2_resolution_log.sql
-- DESCRIPTION: Zones revised (client 2026-10-07, second answer).
--              1. zone_resolution_log: one row per ZIP code that was NOT on the
--                 ZIP-to-zone table and was placed by driving distance, with its
--                 miles and where it went, so Mission Control can assign it to a
--                 zone. Server only.
--              2. waitlist.reason: 'beyond' (past the last Zone 5 band or outside
--                 North Texas) or 'zone5_not_started' (Zone 5 before its first run
--                 is set), so the right people can be told when Extended Reach starts.
-- TYPE: ADDITIVE (a new table, a new column with a default)
-- BEFORE RUNNING: nothing to back up.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS zone_resolution_log (
  zip VARCHAR(5) PRIMARY KEY,
  miles NUMERIC(6, 1),
  -- zone_1..zone_5, or 'waitlist'
  zone_id VARCHAR(10) NOT NULL,
  band VARCHAR(1),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_zone_resolution_log_seen ON zone_resolution_log(last_seen_at DESC);
ALTER TABLE zone_resolution_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON zone_resolution_log FROM anon, authenticated;
GRANT ALL ON zone_resolution_log TO service_role;

ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS reason VARCHAR(30) NOT NULL DEFAULT 'beyond';
ALTER TABLE waitlist DROP CONSTRAINT IF EXISTS waitlist_reason_check;
ALTER TABLE waitlist ADD CONSTRAINT waitlist_reason_check CHECK (reason IN ('beyond', 'zone5_not_started'));

COMMIT;

-- ============================================================================
-- VERIFY (read-only):
-- select
--   (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'zone_resolution_log') as log_table,
--   (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'waitlist' and column_name = 'reason') as waitlist_reason
-- limit 1;
-- ============================================================================
-- ROLLBACK SCRIPT (run as one block):
-- BEGIN;
-- ALTER TABLE waitlist DROP CONSTRAINT IF EXISTS waitlist_reason_check;
-- ALTER TABLE waitlist DROP COLUMN IF EXISTS reason;
-- DROP TABLE IF EXISTS zone_resolution_log;
-- COMMIT;
-- ============================================================================
