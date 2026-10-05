-- ============================================================================
-- MIGRATION: 20261005_order_tax_and_fee.sql
-- DESCRIPTION: Store the sales tax and environmental fee charged on each order
--              (P03 PR-15), so Texas sales-tax filing and reconciliation don't
--              have to re-derive them. Written at booking (quote) and replaced at
--              intake (final weighed charge). Older orders stay NULL.
-- TYPE: ADDITIVE (new nullable columns; no data changes)
-- ============================================================================

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS environmental_fee NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS sales_tax NUMERIC(10, 2);

-- ============================================================================
-- ROLLBACK SCRIPT:
-- ALTER TABLE orders DROP COLUMN IF EXISTS sales_tax;
-- ALTER TABLE orders DROP COLUMN IF EXISTS environmental_fee;
-- ============================================================================
