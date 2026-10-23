-- ============================================================================
-- MIGRATION: 20261023_van_tracking.sql
-- DESCRIPTION: The van wrap (client 2026-10-23): customers who find us through the van are
--              tracked as VAN-01.
--              1. marketing_events: the van page's visits and "Schedule Your Pickup" taps
--                 (one anonymous visitor id per browser, from a cookie), and each PICKUP
--                 text (the visitor id is a keyed hash of the phone number, never the number).
--                 channel: 'qr' (the QR code), 'text' (the link in the PICKUP reply) or
--                 'typed' (the address typed in).
--              2. orders.marketing_source / marketing_channel: the booking came from the van.
--              3. customers.marketing_source / marketing_channel / marketing_source_at: the
--                 customer's first order came from the van (stamped once, never changed).
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS marketing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(20) NOT NULL,
  channel VARCHAR(10) NOT NULL CHECK (channel IN ('qr', 'text', 'typed')),
  event VARCHAR(20) NOT NULL CHECK (event IN ('visit', 'book_click', 'text_in')),
  visitor_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_marketing_events_source ON marketing_events(source, created_at);
CREATE INDEX IF NOT EXISTS idx_marketing_events_visitor ON marketing_events(visitor_id, event, created_at DESC);
ALTER TABLE marketing_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON marketing_events FROM anon, authenticated;
GRANT ALL ON marketing_events TO service_role;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS marketing_source VARCHAR(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS marketing_channel VARCHAR(10);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS marketing_source VARCHAR(20);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS marketing_channel VARCHAR(10);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS marketing_source_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_orders_marketing_source ON orders(marketing_source) WHERE marketing_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_marketing_source ON customers(marketing_source) WHERE marketing_source IS NOT NULL;

COMMIT;

-- ============================================================================
-- VERIFY (read-only):
-- select
--   (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'marketing_events') as new_table,
--   (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name in ('marketing_source', 'marketing_channel')) as order_columns,
--   (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'customers' and column_name in ('marketing_source', 'marketing_channel', 'marketing_source_at')) as customer_columns
-- limit 1;
-- Expected: 1, 2, 3
-- ============================================================================
-- ROLLBACK SCRIPT (run as one block):
-- BEGIN;
-- DROP TABLE IF EXISTS marketing_events;
-- ALTER TABLE orders DROP COLUMN IF EXISTS marketing_source, DROP COLUMN IF EXISTS marketing_channel;
-- ALTER TABLE customers DROP COLUMN IF EXISTS marketing_source, DROP COLUMN IF EXISTS marketing_channel, DROP COLUMN IF EXISTS marketing_source_at;
-- COMMIT;
-- ============================================================================
