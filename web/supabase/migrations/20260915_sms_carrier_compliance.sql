-- ============================================================
-- MIGRATION: 20260915_sms_carrier_compliance.sql
-- DESCRIPTION: Add carrier-mandated optional SMS consent fields
--              to customers table for A2P 10DLC compliance.
-- TYPE: ADDITIVE (Safe, non-destructive, zero-downtime)
-- ============================================================

-- 1. Add SMS consent columns with safe defaults (unchecked/opt-out by default)
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS sms_consent BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS sms_promotions_consent BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS sms_consent_at TIMESTAMPTZ;

-- 2. Add column comments for audit trails
COMMENT ON COLUMN customers.sms_consent IS 'Explicit opt-in consent for transactional SMS order status updates and delivery notifications. Optional and unchecked by default per carrier compliance.';
COMMENT ON COLUMN customers.sms_promotions_consent IS 'Explicit opt-in consent for occasional marketing/promotional offers via SMS. Optional and unchecked by default.';
COMMENT ON COLUMN customers.sms_consent_at IS 'Timestamp when customer granted SMS consent.';

-- ============================================================
-- ROLLBACK SCRIPT:
-- ALTER TABLE customers DROP COLUMN IF EXISTS sms_consent;
-- ALTER TABLE customers DROP COLUMN IF EXISTS sms_promotions_consent;
-- ALTER TABLE customers DROP COLUMN IF EXISTS sms_consent_at;
-- ============================================================
