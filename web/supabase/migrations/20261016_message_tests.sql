-- ============================================================================
-- MIGRATION: 20261016_message_tests.sql
-- DESCRIPTION: Growth Engine batch 3, part 1 (client 2026-10-14): A/B message tests.
--              message_sends records each tested message sent: which message and
--              version (A or B), to whom, the link it points to (taps go through
--              /m/<id>, which records the tap), and the booking that followed within
--              7 days. The texts themselves live in app_settings ('message_tests').
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS message_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_key VARCHAR(40) NOT NULL,
  variant CHAR(1) NOT NULL CHECK (variant IN ('A', 'B')),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  channel VARCHAR(10),
  target_url TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tapped_at TIMESTAMPTZ,
  tap_count INT NOT NULL DEFAULT 0,
  booked_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  booked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_message_sends_key ON message_sends(message_key, variant, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_sends_customer ON message_sends(customer_id, sent_at DESC);
ALTER TABLE message_sends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON message_sends FROM anon, authenticated;
GRANT ALL ON message_sends TO service_role;

COMMIT;

-- ============================================================================
-- VERIFY (read-only):
-- select
--   (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'message_sends') as new_table,
--   (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'message_sends') as columns
-- limit 1;
-- Expected: 1, 12
-- ============================================================================
-- ROLLBACK SCRIPT (run as one block):
-- BEGIN;
-- DROP TABLE IF EXISTS message_sends;
-- DELETE FROM app_settings WHERE key = 'message_tests';
-- COMMIT;
-- ============================================================================
