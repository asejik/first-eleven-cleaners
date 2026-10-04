-- ============================================================================
-- MIGRATION: 20261004_grant_sms_consent_self_update.sql
-- DESCRIPTION: Let signed-in customers update their own SMS consent fields
--              (used by the signup flow in src/hooks/useAuth.tsx). Builds on
--              20261004_lock_customer_self_update.sql, which limits browser
--              updates to full_name and phone. Requires
--              20260915_sms_carrier_compliance.sql to be applied first.
-- TYPE: ADDITIVE & IDEMPOTENT (permissions only)
-- ============================================================================

GRANT UPDATE (sms_consent, sms_promotions_consent, sms_consent_at) ON customers TO authenticated;

-- ============================================================================
-- ROLLBACK SCRIPT:
-- REVOKE UPDATE (sms_consent, sms_promotions_consent, sms_consent_at) ON customers FROM authenticated;
-- ============================================================================
