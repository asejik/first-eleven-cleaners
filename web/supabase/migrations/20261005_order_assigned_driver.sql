-- ============================================================================
-- MIGRATION: 20261005_order_assigned_driver.sql
-- DESCRIPTION: Record which driver's van holds an order (P03 PR-19). Drivers
--              claim an order with one conditional update instead of the app
--              matching driver names in order_events text. Orders loaded before
--              this column existed keep working through the old name check.
-- TYPE: ADDITIVE (new nullable column + index; no data changes)
-- ============================================================================

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS assigned_driver_id UUID REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_assigned_driver ON orders(assigned_driver_id)
  WHERE assigned_driver_id IS NOT NULL;

-- ============================================================================
-- ROLLBACK SCRIPT:
-- DROP INDEX IF EXISTS idx_orders_assigned_driver;
-- ALTER TABLE orders DROP COLUMN IF EXISTS assigned_driver_id;
-- ============================================================================
