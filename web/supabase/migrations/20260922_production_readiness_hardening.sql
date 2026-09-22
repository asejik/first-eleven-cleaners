-- ============================================================================
-- MIGRATION: 20260922_production_readiness_hardening.sql
-- DESCRIPTION: Production database integrity hardening:
--              1. Enable RLS on unhedged tables (staff, commercial_accounts,
--                 conversations, promo_codes, zones, error_logs)
--              2. Add missing foreign key & composite performance indexes
--              3. Ensure garment-photos storage bucket exists
--              4. Create immutable admin_audit_logs table
-- TYPE: ADDITIVE (Safe, non-destructive, zero-downtime)
-- ============================================================================

-- 1. ROW LEVEL SECURITY (RLS) POLICIES ON UNPROTECTED TABLES
ALTER TABLE IF EXISTS zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS commercial_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS error_logs ENABLE ROW LEVEL SECURITY;

-- Zones: Active zones are publicly readable
DROP POLICY IF EXISTS zones_public_read ON zones;
CREATE POLICY zones_public_read ON zones
  FOR SELECT USING (is_active = true);

-- Promo Codes: Active coupons are publicly readable for client-side validation
DROP POLICY IF EXISTS promo_codes_public_read ON promo_codes;
CREATE POLICY promo_codes_public_read ON promo_codes
  FOR SELECT USING (is_active = true);

-- Conversations: Customers can only read and manage their own AI chats
DROP POLICY IF EXISTS conversations_customer_access ON conversations;
CREATE POLICY conversations_customer_access ON conversations
  FOR ALL USING (
    customer_id IN (SELECT id FROM customers WHERE auth_id = auth.uid())
  );

-- Staff: Only active admin staff can view the staff roster directly
DROP POLICY IF EXISTS staff_admin_read ON staff;
CREATE POLICY staff_admin_read ON staff
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM customers
      WHERE customers.auth_id = auth.uid()
        AND customers.role = 'admin'
    )
  );

-- Commercial Accounts: Only admins and internal staff can view corporate accounts directly
DROP POLICY IF EXISTS commercial_accounts_staff_access ON commercial_accounts;
CREATE POLICY commercial_accounts_staff_access ON commercial_accounts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM customers
      WHERE customers.auth_id = auth.uid()
        AND customers.role IN ('admin', 'staff')
    )
  );

-- Error Logs: Restricted to system service role & admins
DROP POLICY IF EXISTS error_logs_admin_read ON error_logs;
CREATE POLICY error_logs_admin_read ON error_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM customers
      WHERE customers.auth_id = auth.uid()
        AND customers.role = 'admin'
    )
  );


-- 2. HIGH-PERFORMANCE DATABASE INDEXES
CREATE INDEX IF NOT EXISTS idx_addresses_customer_id ON addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_claims_order_id ON claims(order_id);
CREATE INDEX IF NOT EXISTS idx_claims_customer_id ON claims(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_customer_id ON conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_pickup_composite ON orders(pickup_date, pickup_window, status);
CREATE INDEX IF NOT EXISTS idx_orders_express_lookup ON orders(pickup_date, express_tier, status);


-- 3. STORAGE BUCKET (Garment Passport Photos & Intake Verification)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'garment-photos',
      'garment-photos',
      true,
      10485760, -- 10MB
      ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;


-- 4. IMMUTABLE ADMIN AUDIT LOG TABLE
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  admin_email VARCHAR(255) NOT NULL,
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(50) NOT NULL,
  target_id VARCHAR(100) NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance index for audit searches by target and admin
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target ON admin_audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at DESC);

-- Enable RLS: Strictly Append-Only (NO UPDATE or DELETE policies)
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_audit_logs_admin_view ON admin_audit_logs;
CREATE POLICY admin_audit_logs_admin_view ON admin_audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM customers
      WHERE customers.auth_id = auth.uid()
        AND customers.role = 'admin'
    )
  );

-- ============================================================================
-- ROLLBACK SCRIPT (Execute only to revert this migration):
--
-- DROP TABLE IF EXISTS admin_audit_logs;
-- DROP INDEX IF EXISTS idx_orders_express_lookup;
-- DROP INDEX IF EXISTS idx_orders_pickup_composite;
-- DROP INDEX IF EXISTS idx_conversations_customer_id;
-- DROP INDEX IF EXISTS idx_claims_customer_id;
-- DROP INDEX IF EXISTS idx_claims_order_id;
-- DROP INDEX IF EXISTS idx_order_items_order_id;
-- DROP INDEX IF EXISTS idx_addresses_customer_id;
--
-- ALTER TABLE zones DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE promo_codes DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE staff DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE commercial_accounts DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE conversations DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE error_logs DISABLE ROW LEVEL SECURITY;
-- ============================================================================
