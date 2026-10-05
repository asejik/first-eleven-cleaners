-- ============================================================================
-- MIGRATION: 20261005_order_refund_tracking.sql
-- DESCRIPTION: Track refunds so they can be issued from the app and reconciled
--              against Square (P03 PR-05).
--              1. orders.refunded_amount: total refunded on the order's Square
--                 payment (kept in sync with Square by the payments webhook)
--              2. claims.refund_amount / square_refund_id: the refund issued
--                 when a Make It Right claim is resolved with money back
-- TYPE: ADDITIVE & IDEMPOTENT (new columns with safe defaults; no data changes)
-- DEPLOY ORDER: run this BEFORE deploying the PR-05 code (the driver and
--               Express refund code read and write orders.refunded_amount).
-- ============================================================================

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_refunded_amount_check;
ALTER TABLE orders ADD CONSTRAINT orders_refunded_amount_check CHECK (refunded_amount >= 0);

ALTER TABLE claims
ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS square_refund_id VARCHAR(255);

-- Express refunds already recorded before this column existed
UPDATE orders
SET refunded_amount = express_refund_amount
WHERE express_auto_refunded = true
  AND express_refund_amount IS NOT NULL
  AND refunded_amount = 0;

-- ============================================================================
-- ROLLBACK SCRIPT:
-- ALTER TABLE claims DROP COLUMN IF EXISTS square_refund_id;
-- ALTER TABLE claims DROP COLUMN IF EXISTS refund_amount;
-- ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_refunded_amount_check;
-- ALTER TABLE orders DROP COLUMN IF EXISTS refunded_amount;
-- ============================================================================
