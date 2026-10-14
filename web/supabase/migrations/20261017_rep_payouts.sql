-- ============================================================================
-- MIGRATION: 20261017_rep_payouts.sql
-- DESCRIPTION: Growth Engine batch 3, part 2 (client 2026-10-14): the weekly payout report.
--              1. reps.kind: 'field' (a field rep: $10 per verified first order plus $25
--                 per Starting XI order) or 'driver' (referral cards: $5 per conversion, no
--                 Starting XI). The rates are app_settings 'rep_rates'.
--              2. rep_conversions: a customer's verified first order on a rep code, recorded
--                 when the card is actually charged (one per customer), with the rep's kind,
--                 the territory (the customer's address, else the rep's), and refunded_at
--                 when it was later fully refunded (in the same payout week it drops off).
-- ============================================================================

BEGIN;

ALTER TABLE reps ADD COLUMN IF NOT EXISTS kind VARCHAR(10) NOT NULL DEFAULT 'field';
ALTER TABLE reps DROP CONSTRAINT IF EXISTS reps_kind_check;
ALTER TABLE reps ADD CONSTRAINT reps_kind_check CHECK (kind IN ('field', 'driver'));

CREATE TABLE IF NOT EXISTS rep_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  rep_code VARCHAR(20) NOT NULL REFERENCES reps(code) ON UPDATE CASCADE,
  rep_kind VARCHAR(10) NOT NULL CHECK (rep_kind IN ('field', 'driver')),
  territory_id VARCHAR(10) REFERENCES territories(id) ON UPDATE CASCADE ON DELETE SET NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  refunded_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_rep_conversions_captured ON rep_conversions(captured_at);
CREATE INDEX IF NOT EXISTS idx_rep_conversions_territory ON rep_conversions(territory_id, captured_at);
CREATE INDEX IF NOT EXISTS idx_rep_conversions_order ON rep_conversions(order_id);
ALTER TABLE rep_conversions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rep_conversions FROM anon, authenticated;
GRANT ALL ON rep_conversions TO service_role;

COMMIT;

-- ============================================================================
-- VERIFY (read-only):
-- select
--   (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'reps' and column_name = 'kind') as reps_kind,
--   (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'rep_conversions') as new_table
-- limit 1;
-- Expected: 1, 1
-- ============================================================================
-- ROLLBACK SCRIPT (run as one block):
-- BEGIN;
-- DROP TABLE IF EXISTS rep_conversions;
-- ALTER TABLE reps DROP CONSTRAINT IF EXISTS reps_kind_check;
-- ALTER TABLE reps DROP COLUMN IF EXISTS kind;
-- DELETE FROM app_settings WHERE key = 'rep_rates';
-- COMMIT;
-- ============================================================================
