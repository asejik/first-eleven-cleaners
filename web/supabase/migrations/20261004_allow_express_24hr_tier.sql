-- ============================================================================
-- MIGRATION: 20261004_allow_express_24hr_tier.sql
-- DESCRIPTION: Allow the 24-Hour Express tier (SEC-29). The live database only
--              accepted the retired 'express_8hr' / 'express_4hr' tiers, so every
--              'express_24hr' booking was rejected. The retired tiers stay valid
--              only so historical rows remain consistent; the app writes
--              'standard' or 'express_24hr' only.
-- TYPE: ADDITIVE (constraint widened, no data changes)
-- ============================================================================

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_express_tier_check;
ALTER TABLE orders ADD CONSTRAINT orders_express_tier_check
  CHECK (express_tier IN ('standard', 'express_24hr', 'express_8hr', 'express_4hr'));

-- ============================================================================
-- ROLLBACK SCRIPT:
-- ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_express_tier_check;
-- ALTER TABLE orders ADD CONSTRAINT orders_express_tier_check
--   CHECK (express_tier IN ('standard', 'express_8hr', 'express_4hr'));
-- ============================================================================
