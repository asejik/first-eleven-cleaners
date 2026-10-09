-- ============================================================================
-- MIGRATION: 20261009_routine_bag.sql
-- DESCRIPTION: The Routine bag (client 2026-10-08, Part 2 item 5): every Routine
--              member gets a branded bag on their first pickup. A "bag delivered"
--              checkbox per member in Mission Control, so the driver knows who
--              still needs theirs.
--              routine_memberships.bag_delivered_at / bag_delivered_by.
-- TYPE: ADDITIVE (new nullable columns)
-- BEFORE RUNNING: nothing to back up.
-- ============================================================================
BEGIN;

ALTER TABLE routine_memberships ADD COLUMN IF NOT EXISTS bag_delivered_at TIMESTAMPTZ;
ALTER TABLE routine_memberships ADD COLUMN IF NOT EXISTS bag_delivered_by VARCHAR(255);

COMMIT;

-- ============================================================================
-- VERIFY (read-only):
-- select count(*) as bag_columns from information_schema.columns
-- where table_schema = 'public' and table_name = 'routine_memberships' and column_name in ('bag_delivered_at', 'bag_delivered_by')
-- limit 1;
-- Expected: 2
-- ============================================================================
-- ROLLBACK SCRIPT (run as one block):
-- BEGIN;
-- ALTER TABLE routine_memberships DROP COLUMN IF EXISTS bag_delivered_by;
-- ALTER TABLE routine_memberships DROP COLUMN IF EXISTS bag_delivered_at;
-- COMMIT;
-- ============================================================================
