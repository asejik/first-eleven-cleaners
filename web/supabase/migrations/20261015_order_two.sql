-- ============================================================================
-- MIGRATION: 20261015_order_two.sql
-- DESCRIPTION: Growth Engine batch 2 (client 2026-10-14): the order-two sequence.
--              1. orders.order_two_discount: the automatic $10 off a customer's second
--                 order (pickup within 21 days of the first), kept apart from promo
--                 codes so the Growth Panel and message tests can count it.
--              2. customers.order_two_nudged_at: when the Day 6 nudge went out (once).
-- ============================================================================

BEGIN;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_two_discount NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS order_two_nudged_at TIMESTAMPTZ;

COMMIT;

-- ============================================================================
-- VERIFY (read-only):
-- select
--   (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'orders'
--      and column_name = 'order_two_discount') as order_column,
--   (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'customers'
--      and column_name = 'order_two_nudged_at') as customer_column
-- limit 1;
-- Expected: 1, 1
-- ============================================================================
-- ROLLBACK SCRIPT (run as one block):
-- BEGIN;
-- ALTER TABLE customers DROP COLUMN IF EXISTS order_two_nudged_at;
-- ALTER TABLE orders DROP COLUMN IF EXISTS order_two_discount;
-- COMMIT;
-- ============================================================================
