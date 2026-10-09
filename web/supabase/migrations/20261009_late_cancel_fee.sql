-- ============================================================================
-- MIGRATION: 20261009_late_cancel_fee.sql
-- DESCRIPTION: Late-cancel fee (client 2026-10-08, Part 2 item 4). Cancelling or
--              rescheduling under 2 hours before the pickup window costs $15
--              (Zone 5: its Extended Reach fee); the first one is waived (Routine
--              members: one each calendar month).
--              1. orders.late_cancel_fee / late_cancel_status / late_cancel_at:
--                 the fee, and whether it was charged, waived or declined.
--              2. order_payments.kind gains 'late_cancel' for the fee's charge.
-- TYPE: ADDITIVE (new nullable columns; a CHECK widened)
-- BEFORE RUNNING: nothing to back up.
-- ============================================================================
BEGIN;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS late_cancel_fee NUMERIC(10, 2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS late_cancel_status VARCHAR(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS late_cancel_at TIMESTAMPTZ;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_late_cancel_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_late_cancel_status_check
  CHECK (late_cancel_status IS NULL OR late_cancel_status IN ('charged', 'waived', 'declined'));
CREATE INDEX IF NOT EXISTS idx_orders_late_cancel ON orders(customer_id, late_cancel_at) WHERE late_cancel_status IS NOT NULL;

ALTER TABLE order_payments DROP CONSTRAINT IF EXISTS order_payments_kind_check;
ALTER TABLE order_payments ADD CONSTRAINT order_payments_kind_check
  CHECK (kind IN ('hold', 'top_up', 'charge', 'quote', 'late_cancel'));

COMMIT;

-- ============================================================================
-- VERIFY (read-only):
-- select
--   (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name in ('late_cancel_fee', 'late_cancel_status', 'late_cancel_at')) as order_columns,
--   (select count(*) from pg_constraint where conname = 'order_payments_kind_check' and pg_get_constraintdef(oid) like '%late_cancel%') as payment_kind
-- limit 1;
-- Expected: 3, 1
-- ============================================================================
-- ROLLBACK SCRIPT (run as one block; first delete any 'late_cancel' payment rows):
-- BEGIN;
-- ALTER TABLE order_payments DROP CONSTRAINT IF EXISTS order_payments_kind_check;
-- ALTER TABLE order_payments ADD CONSTRAINT order_payments_kind_check
--   CHECK (kind IN ('hold', 'top_up', 'charge', 'quote'));
-- DROP INDEX IF EXISTS idx_orders_late_cancel;
-- ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_late_cancel_status_check;
-- ALTER TABLE orders DROP COLUMN IF EXISTS late_cancel_at;
-- ALTER TABLE orders DROP COLUMN IF EXISTS late_cancel_status;
-- ALTER TABLE orders DROP COLUMN IF EXISTS late_cancel_fee;
-- COMMIT;
-- ============================================================================
