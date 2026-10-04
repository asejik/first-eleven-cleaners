-- ============================================================================
-- MIGRATION: 20261004_add_express_refund_columns.sql
-- DESCRIPTION: Add the 24-Hour Express columns that schema.sql defines but the
--              live database never received (SEC-26). Without them,
--              handleExpressDeliverySLA() (src/lib/express.ts) cannot record
--              late-delivery refunds and fails silently.
-- TYPE: ADDITIVE & IDEMPOTENT (Safe, non-destructive)
-- ============================================================================

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS express_surcharge NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS express_auto_refunded BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS express_refund_amount NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS express_refund_reason TEXT;

-- ============================================================================
-- ROLLBACK SCRIPT:
-- ALTER TABLE orders DROP COLUMN IF EXISTS express_surcharge;
-- ALTER TABLE orders DROP COLUMN IF EXISTS express_auto_refunded;
-- ALTER TABLE orders DROP COLUMN IF EXISTS express_refund_amount;
-- ALTER TABLE orders DROP COLUMN IF EXISTS express_refund_reason;
-- ============================================================================
