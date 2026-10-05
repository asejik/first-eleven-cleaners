-- ============================================================================
-- MIGRATION: 20261005_retire_matchready_promo.sql
-- DESCRIPTION: Retire the MATCHREADY promo code (P05 AR-02, owner decision
--              2026-10-05). The row is kept (is_active = false) so past orders
--              that used it still point at a real code; bookings and the promo
--              box only accept active codes, so it stops working immediately.
-- TYPE: DATA (one row updated; no schema change)
-- ============================================================================

UPDATE promo_codes
   SET is_active = false
 WHERE code = 'MATCHREADY';

-- ============================================================================
-- ROLLBACK SCRIPT:
-- UPDATE promo_codes SET is_active = true WHERE code = 'MATCHREADY';
-- ============================================================================
