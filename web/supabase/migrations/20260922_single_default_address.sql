-- ============================================================================
-- MIGRATION: 20260922_single_default_address.sql
-- DESCRIPTION: Ensure exactly one default address per customer:
--              1. Demote older duplicate default addresses per customer
--              2. Add partial unique index to enforce single default at DB level
-- TYPE: ADDITIVE & IDEMPOTENT (Safe, non-destructive)
-- ============================================================================

-- 1. Deduplicate existing default addresses (keep the newest per customer)
WITH ranked_defaults AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC) as rn
  FROM addresses
  WHERE is_default = true
)
UPDATE addresses
SET is_default = false
WHERE id IN (
  SELECT id FROM ranked_defaults WHERE rn > 1
);

-- 2. Enforce at most one default address per customer
CREATE UNIQUE INDEX IF NOT EXISTS idx_addresses_single_default
  ON addresses (customer_id)
  WHERE is_default = true;
