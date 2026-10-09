-- =================================================================
-- FIRST ELEVEN CLEANERS — DATABASE SCHEMA (SUPABASE / POSTGRESQL)
-- =================================================================
-- Reference snapshot for building a NEW database from scratch (e.g. a dev
-- project). The live database is changed only through the dated files in
-- supabase/migrations/, which are the source of truth; keep this file in step
-- with them. Verified 2026-10-05 (P03 PR-23): this file, followed by every
-- migration in order, runs cleanly on a fresh Postgres 16 database.
-- =================================================================

-- Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. ZONES (DFW Service Coverage)
-- NOT USED by the app: zone rules live in ZONE_CONFIG (src/lib/constants.ts).
-- Only /api/health reads this table. Kept for a future admin-editable version.
CREATE TABLE IF NOT EXISTS zones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  minimum_order NUMERIC(10, 2) NOT NULL DEFAULT 45.00,
  service_days TEXT[] NOT NULL DEFAULT '{"Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"}',
  express_eligible BOOLEAN NOT NULL DEFAULT true,
  zip_codes TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. CUSTOMERS
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id UUID UNIQUE, -- linked to Supabase auth.users
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(50),
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'staff', 'admin', 'driver', 'intake_staff')),
  sms_consent BOOLEAN NOT NULL DEFAULT false,
  sms_promotions_consent BOOLEAN NOT NULL DEFAULT false,
  sms_consent_at TIMESTAMPTZ,
  square_customer_id VARCHAR(255), -- Square customer holding saved cards (SEC-06)
  phone_verified_at TIMESTAMPTZ, -- the owner proved the phone with a texted code (20261008_routine_and_passwordless)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. CUSTOMER PREFERENCES (Eleven's Memory)
CREATE TABLE IF NOT EXISTS customer_preferences (
  customer_id UUID PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  starch_level VARCHAR(50) DEFAULT 'none' CHECK (starch_level IN ('none', 'light', 'medium', 'heavy')),
  fold_vs_hang VARCHAR(50) DEFAULT 'hang' CHECK (fold_vs_hang IN ('fold', 'hang')),
  detergent_sensitivity TEXT,
  gate_code VARCHAR(100),
  delivery_instructions TEXT,
  special_notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. ADDRESSES
CREATE TABLE IF NOT EXISTS addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  street VARCHAR(255) NOT NULL,
  unit VARCHAR(100),
  city VARCHAR(100) NOT NULL DEFAULT 'Dallas',
  state VARCHAR(20) NOT NULL DEFAULT 'TX',
  zip VARCHAR(20) NOT NULL,
  lat NUMERIC(10, 7),
  lng NUMERIC(10, 7),
  is_default BOOLEAN NOT NULL DEFAULT false,
  delivery_notes TEXT,
  zone_id UUID REFERENCES zones(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_addresses_single_default
  ON addresses (customer_id)
  WHERE is_default = true;

-- 5. ORDERS
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number VARCHAR(50) UNIQUE NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  address_id UUID REFERENCES addresses(id) ON DELETE RESTRICT,
  status VARCHAR(50) NOT NULL DEFAULT 'booked' CHECK (
    status IN ('booked', 'picked_up', 'weighed_itemized', 'in_cleaning', 'out_for_delivery', 'delivered', 'cancelled')
  ),
  order_type VARCHAR(50) NOT NULL DEFAULT 'mixed' CHECK (
    order_type IN ('dry_clean', 'wash_fold', 'mixed')
  ),
  pickup_date DATE NOT NULL,
  pickup_window VARCHAR(50) NOT NULL CHECK (pickup_window IN ('morning', 'evening')),
  delivery_date DATE,
  delivery_window VARCHAR(50) CHECK (delivery_window IN ('morning', 'evening')),
  weight_lbs NUMERIC(6, 2),
  subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  express_tier VARCHAR(50) NOT NULL DEFAULT 'standard' CHECK (
    -- express_8hr / express_4hr are retired tiers kept valid for historical rows (SEC-29)
    express_tier IN ('standard', 'express_24hr', 'express_8hr', 'express_4hr')
  ),
  promo_code VARCHAR(50),
  discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  total NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  payment_id VARCHAR(255),
  payment_status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (
    payment_status IN ('pending', 'authorized', 'charged', 'failed', 'refunded')
  ),
  notes TEXT,
  express_surcharge NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  express_auto_refunded BOOLEAN NOT NULL DEFAULT false,
  express_refund_amount NUMERIC(10, 2),
  express_refund_reason TEXT,
  square_customer_id VARCHAR(255), -- card on file charged at intake (SEC-06)
  square_card_id VARCHAR(255),
  refunded_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (refunded_amount >= 0), -- synced with Square (PR-05)
  assigned_driver_id UUID REFERENCES customers(id) ON DELETE SET NULL, -- van holding the order (PR-19)
  environmental_fee NUMERIC(10, 2), -- charged on this order (PR-15)
  sales_tax NUMERIC(10, 2),
  idempotency_key UUID, -- one per checkout; a resubmit returns the first order (PR-11)
  -- Card hold for the estimate, captured at intake (20261007_payment_holds.sql)
  hold_payment_id VARCHAR(255),
  hold_amount NUMERIC(10, 2),
  hold_expires_at TIMESTAMPTZ,
  hold_status VARCHAR(20) NOT NULL DEFAULT 'none' CONSTRAINT orders_hold_status_check
    CHECK (hold_status IN ('none', 'scheduled', 'held', 'captured', 'released', 'declined', 'expired')),
  amount_due NUMERIC(10, 2) NOT NULL DEFAULT 0.00, -- still owed after intake (Payment Needed)
  payment_terms_accepted_at TIMESTAMPTZ, -- checkout payment-terms checkbox
  payment_terms_version VARCHAR(40),
  payment_needed_since TIMESTAMPTZ,
  -- 0 none, 1 reminder sent (24 h), 2 staff call due (48 h), 3 owner decision (7 days)
  payment_reminder_stage SMALLINT NOT NULL DEFAULT 0 CONSTRAINT orders_payment_reminder_stage_check
    CHECK (payment_reminder_stage BETWEEN 0 AND 3),
  -- Where the address resolved (20261007_zones_extended_reach.sql)
  zone_id VARCHAR(10),
  distance_miles NUMERIC(6, 1), -- driving miles from the hub, when known
  extended_reach_band VARCHAR(1) CONSTRAINT orders_extended_reach_band_check
    CHECK (extended_reach_band IS NULL OR extended_reach_band IN ('A', 'B')), -- Zone 5 only
  extended_reach_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00, -- Zone 5 delivery fee, after the Routine discount
  frequency VARCHAR(10) NOT NULL DEFAULT 'one_time' CONSTRAINT orders_frequency_check
    CHECK (frequency IN ('one_time', 'weekly', 'biweekly')), -- recurring plan (Routine)
  routine_membership_id UUID, -- made by a Routine membership (FK added after routine_memberships)
  -- Late-cancel fee: under 2 hours before the window (20261009_late_cancel_fee)
  late_cancel_fee NUMERIC(10, 2),
  late_cancel_status VARCHAR(20) CONSTRAINT orders_late_cancel_status_check
    CHECK (late_cancel_status IS NULL OR late_cancel_status IN ('charged', 'waived', 'declined')),
  late_cancel_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. ORDER ITEMS
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  garment_type VARCHAR(100) NOT NULL,
  service_type VARCHAR(50) NOT NULL DEFAULT 'dry_clean' CONSTRAINT order_items_service_type_check
    CHECK (service_type IN ('dry_clean', 'wash_fold', 'alteration')),
  quantity INT NOT NULL DEFAULT 1,
  unit_price NUMERIC(10, 2) NOT NULL,
  subtotal NUMERIC(10, 2) NOT NULL,
  notes TEXT,
  -- Alterations and quotes (20261007_alterations_quotes.sql)
  details JSONB, -- fit instruction and notes for an alteration
  -- none | pending | within_band | awaiting_approval | approved | declined | returned
  quote_status VARCHAR(20) NOT NULL DEFAULT 'none' CONSTRAINT order_items_quote_status_check
    CHECK (quote_status IN ('none', 'pending', 'within_band', 'awaiting_approval', 'approved', 'declined', 'returned')),
  quoted_unit_price NUMERIC(10, 2),
  quote_requested_at TIMESTAMPTZ,
  -- 0 quote sent, 1 reminder sent (24 h), 2 staff call due (48 h)
  quote_reminder_stage SMALLINT NOT NULL DEFAULT 0 CONSTRAINT order_items_quote_reminder_stage_check
    CHECK (quote_reminder_stage BETWEEN 0 AND 2),
  quote_decided_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_order_items_awaiting_quote ON order_items(quote_requested_at)
  WHERE quote_status = 'awaiting_approval';

-- 6b. ORDER PAYMENTS: one row per Square payment (hold, top-up, charge, quote).
-- Server only: RLS on, no policies, no grants (20261007_payment_holds.sql)
CREATE TABLE IF NOT EXISTS order_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  square_payment_id VARCHAR(255) UNIQUE,
  kind VARCHAR(20) NOT NULL CONSTRAINT order_payments_kind_check CHECK (kind IN ('hold', 'top_up', 'charge', 'quote', 'late_cancel')),
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  status VARCHAR(20) NOT NULL CHECK (status IN ('approved', 'completed', 'canceled', 'failed')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_payments_order ON order_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_late_cancel ON orders(customer_id, late_cancel_at) WHERE late_cancel_status IS NOT NULL;

-- 7. ORDER EVENTS (Timeline & Notification Audit Trail)
CREATE TABLE IF NOT EXISTS order_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT,
  triggered_by VARCHAR(100) DEFAULT 'system'
);

-- 8. GARMENT PHOTOS (Garment Passport & Proof)
CREATE TABLE IF NOT EXISTS garment_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL,
  photo_type VARCHAR(50) NOT NULL CONSTRAINT garment_photos_photo_type_check CHECK (
    photo_type IN ('intake', 'return', 'delivery_proof', 'pickup_proof', 'customer_reference')
  ),
  photo_url TEXT NOT NULL,
  condition_notes TEXT,
  captured_by VARCHAR(100),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. TIME SLOTS
-- NOT USED by the app: capacity is counted from orders (src/app/api/bookings).
CREATE TABLE IF NOT EXISTS time_slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  "window" VARCHAR(50) NOT NULL CHECK ("window" IN ('morning', 'evening')),
  capacity INT NOT NULL DEFAULT 20,
  booked_count INT NOT NULL DEFAULT 0,
  is_available BOOLEAN NOT NULL DEFAULT true,
  zone_id UUID REFERENCES zones(id) ON DELETE CASCADE,
  UNIQUE(date, "window", zone_id)
);

-- 10. PROMO CODES
CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) UNIQUE NOT NULL,
  discount_type VARCHAR(50) NOT NULL DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC(10, 2) NOT NULL,
  max_uses INT,
  current_uses INT NOT NULL DEFAULT 0,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- 11. COMMERCIAL ACCOUNTS
CREATE TABLE IF NOT EXISTS commercial_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255) NOT NULL,
  contact_phone VARCHAR(50) NOT NULL,
  billing_email VARCHAR(255),
  rate_card_id VARCHAR(100),
  payment_terms VARCHAR(50) DEFAULT 'net_30',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. STAFF
-- NOT USED for access control: roles come from customers.role (SEC-02).
CREATE TABLE IF NOT EXISTS staff (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'driver', 'intake_staff')),
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(50),
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- 14. CLAIMS (Make It Right)
CREATE TABLE IF NOT EXISTS claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  issue_type VARCHAR(50) NOT NULL CHECK (
    issue_type IN ('damage', 'lost_item', 'quality', 'wrong_item', 'other')
  ),
  description TEXT NOT NULL,
  photo_urls TEXT[] DEFAULT '{}',
  status VARCHAR(50) NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'investigating', 'resolved', 'refunded')
  ),
  resolution_notes TEXT,
  refund_amount NUMERIC(10, 2), -- PR-05
  square_refund_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. ERROR LOGS
CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  error_type VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  user_id VARCHAR(100),
  route VARCHAR(255),
  stack_trace TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =================================================================
-- INDEXES FOR HIGH PERFORMANCE
-- =================================================================
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_pickup_date ON orders(pickup_date);
CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON order_events(order_id);
CREATE INDEX IF NOT EXISTS idx_garment_photos_order_id ON garment_photos(order_id);
CREATE INDEX IF NOT EXISTS idx_time_slots_lookup ON time_slots(date, "window", is_available);

-- =================================================================
-- AUTOMATIC TIMESTAMP UPDATER FUNCTION
-- =================================================================
CREATE OR REPLACE FUNCTION update_timestamp_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
ALTER FUNCTION update_timestamp_column() SET search_path = public, pg_temp; -- SEC-17

CREATE TRIGGER update_customers_modtime
BEFORE UPDATE ON customers
FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

CREATE TRIGGER update_orders_modtime
BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION update_timestamp_column();

-- =================================================================
-- AUTH TRIGGERS: customer rows and verified-email account linking (SEC-03)
-- =================================================================
-- Signup: create the customer row; link an existing guest row only if confirmed
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  new_cust_id UUID;
BEGIN
  INSERT INTO public.customers (auth_id, email, full_name, phone)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'phone', '')
  )
  ON CONFLICT (email) DO UPDATE
    SET auth_id = EXCLUDED.auth_id
    WHERE public.customers.auth_id IS NULL
      AND NEW.email_confirmed_at IS NOT NULL
  RETURNING id INTO new_cust_id;

  -- Create default customer preferences entry
  IF new_cust_id IS NOT NULL THEN
    INSERT INTO public.customer_preferences (customer_id)
    VALUES (new_cust_id)
    ON CONFLICT (customer_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- Email confirmed: link the oldest unlinked guest record with that email
CREATE OR REPLACE FUNCTION public.link_customer_on_email_confirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  linked_id UUID;
BEGIN
  -- Already linked at signup (no guest record existed): nothing to do
  IF EXISTS (SELECT 1 FROM public.customers WHERE auth_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  UPDATE public.customers
  SET auth_id = NEW.id,
      updated_at = NOW()
  WHERE id = (
    SELECT id FROM public.customers
    WHERE lower(email) = lower(NEW.email) AND auth_id IS NULL
    ORDER BY created_at
    LIMIT 1
  )
  RETURNING id INTO linked_id;

  IF linked_id IS NOT NULL THEN
    INSERT INTO public.customer_preferences (customer_id)
    VALUES (linked_id)
    ON CONFLICT (customer_id) DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block email confirmation because of a linking problem
  RAISE WARNING 'link_customer_on_email_confirm failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_email_confirmed
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.link_customer_on_email_confirm();

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Text-code sign-in only goes to a phone its owner proved: a new phone is unproven
CREATE OR REPLACE FUNCTION public.clear_phone_verification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  -- A new phone is unproven, unless this same update is the verification
  IF NEW.phone IS DISTINCT FROM OLD.phone AND NEW.phone_verified_at IS NOT DISTINCT FROM OLD.phone_verified_at THEN
    NEW.phone_verified_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS customers_clear_phone_verification ON customers;
CREATE TRIGGER customers_clear_phone_verification
  BEFORE UPDATE OF phone ON customers
  FOR EACH ROW EXECUTE FUNCTION public.clear_phone_verification();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_customer_on_email_confirm() FROM PUBLIC, anon, authenticated;

-- =================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =================================================================
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE garment_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;

-- Customers can view their own record and edit only name/phone (SEC-04)
CREATE POLICY customers_select_self ON customers
  FOR SELECT USING (auth.uid() = auth_id);
CREATE POLICY customers_update_self ON customers
  FOR UPDATE USING (auth.uid() = auth_id) WITH CHECK (auth.uid() = auth_id);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON customers FROM anon, authenticated;
GRANT UPDATE (full_name, phone) ON customers TO authenticated;
GRANT UPDATE (sms_consent, sms_promotions_consent, sms_consent_at) ON customers TO authenticated;

-- Customer Preferences
CREATE POLICY customer_prefs_self ON customer_preferences
  FOR ALL USING (
    customer_id IN (SELECT id FROM customers WHERE auth_id = auth.uid())
  );

-- Addresses
CREATE POLICY addresses_self ON addresses
  FOR ALL USING (
    customer_id IN (SELECT id FROM customers WHERE auth_id = auth.uid())
  );

-- Orders
CREATE POLICY orders_customer_view ON orders
  FOR SELECT USING (
    customer_id IN (SELECT id FROM customers WHERE auth_id = auth.uid())
  );

CREATE POLICY orders_customer_insert ON orders
  FOR INSERT WITH CHECK (
    customer_id IN (SELECT id FROM customers WHERE auth_id = auth.uid())
  );

-- Order Items
CREATE POLICY order_items_customer_view ON order_items
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM orders WHERE customer_id IN (
        SELECT id FROM customers WHERE auth_id = auth.uid()
      )
    )
  );

-- Garment Photos
CREATE POLICY garment_photos_customer_view ON garment_photos
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM orders WHERE customer_id IN (
        SELECT id FROM customers WHERE auth_id = auth.uid()
      )
    )
  );

-- Claims
CREATE POLICY claims_self ON claims
  FOR ALL USING (
    customer_id IN (SELECT id FROM customers WHERE auth_id = auth.uid())
  );

-- =================================================================
-- SERVER FUNCTIONS
-- =================================================================
-- Atomic promo-code reservation used by /api/bookings (SEC-15)
CREATE OR REPLACE FUNCTION public.reserve_promo_use(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH reserved AS (
    UPDATE promo_codes
    SET current_uses = current_uses + 1
    WHERE code = p_code
      AND is_active = true
      AND (max_uses IS NULL OR current_uses < max_uses)
      AND (valid_from IS NULL OR valid_from <= NOW())
      AND (valid_until IS NULL OR valid_until >= NOW())
    RETURNING id
  )
  SELECT EXISTS (SELECT 1 FROM reserved);
$function$;

REVOKE EXECUTE ON FUNCTION public.reserve_promo_use(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_promo_use(TEXT) TO service_role;


-- =================================================================
-- OBJECTS ADDED BY MIGRATIONS (kept here so a new database matches live)
-- =================================================================
-- From 20260922_production_readiness_hardening.sql
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY zones_public_read ON zones FOR SELECT USING (is_active = true);
CREATE POLICY promo_codes_public_read ON promo_codes FOR SELECT USING (is_active = true);
CREATE POLICY staff_admin_read ON staff
  FOR SELECT USING (EXISTS (SELECT 1 FROM customers WHERE customers.auth_id = auth.uid() AND customers.role = 'admin'));
CREATE POLICY commercial_accounts_staff_access ON commercial_accounts
  FOR ALL USING (EXISTS (SELECT 1 FROM customers WHERE customers.auth_id = auth.uid() AND customers.role IN ('admin', 'staff')));
CREATE POLICY error_logs_admin_read ON error_logs
  FOR SELECT USING (EXISTS (SELECT 1 FROM customers WHERE customers.auth_id = auth.uid() AND customers.role = 'admin'));

CREATE INDEX IF NOT EXISTS idx_addresses_customer_id ON addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_claims_order_id ON claims(order_id);
CREATE INDEX IF NOT EXISTS idx_claims_customer_id ON claims(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_pickup_composite ON orders(pickup_date, pickup_window, status);
CREATE INDEX IF NOT EXISTS idx_orders_express_lookup ON orders(pickup_date, express_tier, status);

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
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target ON admin_audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at DESC);
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_audit_logs_admin_view ON admin_audit_logs
  FOR SELECT USING (EXISTS (SELECT 1 FROM customers WHERE customers.auth_id = auth.uid() AND customers.role = 'admin'));

-- Photo buckets: private, 10 MB images only
-- (20261004_lock_storage_uploads.sql, 20261005_private_photo_buckets.sql)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES
      ('garment-photos', 'garment-photos', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
      ('claims-photos', 'claims-photos', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
    ON CONFLICT (id) DO UPDATE
      SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;
END $$;

-- Browser roles keep only what they use (20261005_tighten_table_grants.sql)
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE INSERT, UPDATE, DELETE ON TABLES FROM anon;
GRANT UPDATE (full_name, phone, sms_consent, sms_promotions_consent, sms_consent_at) ON customers TO authenticated;

-- Customer phones are stored in E.164 (20261005_normalize_customer_phones.sql, PR-18)
CREATE OR REPLACE FUNCTION public.normalize_phone_e164(raw TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $function$
DECLARE
  digits TEXT := regexp_replace(coalesce(raw, ''), '\D', '', 'g');
BEGIN
  IF btrim(coalesce(raw, '')) LIKE '+%' THEN
    IF digits LIKE '1%' THEN
      RETURN CASE WHEN length(digits) = 11 THEN '+' || digits END;
    END IF;
    RETURN CASE WHEN length(digits) BETWEEN 8 AND 15 THEN '+' || digits END;
  END IF;
  IF length(digits) = 10 THEN RETURN '+1' || digits; END IF;
  IF length(digits) = 11 AND digits LIKE '1%' THEN RETURN '+' || digits; END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.customers_normalize_phone()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  NEW.phone := coalesce(public.normalize_phone_e164(NEW.phone), NEW.phone);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS customers_normalize_phone ON customers;
CREATE TRIGGER customers_normalize_phone
  BEFORE INSERT OR UPDATE OF phone ON customers
  FOR EACH ROW EXECUTE FUNCTION public.customers_normalize_phone();

REVOKE EXECUTE ON FUNCTION public.customers_normalize_phone() FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_driver ON orders(assigned_driver_id) WHERE assigned_driver_id IS NOT NULL;

-- admin_audit_logs is append-only (20261005_admin_audit_immutable.sql, PR-24)
CREATE OR REPLACE FUNCTION public.admin_audit_logs_block_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  RAISE EXCEPTION 'admin_audit_logs is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_audit_logs_block_changes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS admin_audit_logs_no_update_delete ON admin_audit_logs;
CREATE TRIGGER admin_audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.admin_audit_logs_block_changes();

DROP TRIGGER IF EXISTS admin_audit_logs_no_truncate ON admin_audit_logs;
CREATE TRIGGER admin_audit_logs_no_truncate
  BEFORE TRUNCATE ON admin_audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION public.admin_audit_logs_block_changes();


-- Dashboard aggregates (20261005_dashboard_summaries.sql, PR-14)
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

CREATE OR REPLACE FUNCTION public.mission_control_summary(p_today DATE)
RETURNS JSON
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $function$
  SELECT json_build_object(
    'active_count', (SELECT count(*) FROM orders WHERE status NOT IN ('delivered', 'cancelled')),
    'total_count', (SELECT count(*) FROM orders),
    'today_sales', (
      SELECT coalesce(sum(total), 0) FROM orders
      WHERE status <> 'cancelled'
        AND ((created_at AT TIME ZONE 'America/Chicago')::date = p_today OR pickup_date = p_today)
    ),
    'active_lbs', (SELECT coalesce(sum(weight_lbs), 0) FROM orders WHERE status NOT IN ('delivered', 'cancelled')),
    'active_pieces', (
      SELECT coalesce(sum(oi.quantity), 0)
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.status NOT IN ('delivered', 'cancelled') AND oi.service_type = 'dry_clean'
    ),
    'net_revenue', (
      SELECT coalesce(sum(total - refunded_amount), 0) FROM orders WHERE payment_status IN ('charged', 'refunded')
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.order_financial_summary(p_from DATE, p_to DATE)
RETURNS JSON
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $function$
  WITH o AS (
    SELECT *, payment_status IN ('charged', 'refunded') AS collected
    FROM orders
    WHERE (created_at AT TIME ZONE 'America/Chicago')::date BETWEEN p_from AND p_to
  )
  SELECT json_build_object(
    'gross_revenue', coalesce(sum(total) FILTER (WHERE collected), 0),
    'refunded_total', coalesce(sum(refunded_amount) FILTER (WHERE collected), 0),
    'net_revenue', coalesce(sum(total - refunded_amount) FILTER (WHERE collected), 0),
    'sales_tax_collected', coalesce(sum(sales_tax) FILTER (WHERE collected), 0),
    'environmental_fees_collected', coalesce(sum(environmental_fee) FILTER (WHERE collected), 0),
    'in_vault', coalesce(sum(total) FILTER (WHERE payment_status IN ('authorized', 'pending') AND status <> 'cancelled'), 0),
    'charged_count', count(*) FILTER (WHERE payment_status = 'charged'),
    'authorized_count', count(*) FILTER (WHERE payment_status IN ('authorized', 'pending') AND status <> 'cancelled'),
    'failed_count', count(*) FILTER (WHERE payment_status = 'failed'),
    'refunded_count', count(*) FILTER (WHERE payment_status = 'refunded'),
    'total_transactions', count(*),
    'aov', CASE WHEN count(*) FILTER (WHERE collected) > 0
                THEN round(sum(total) FILTER (WHERE collected) / count(*) FILTER (WHERE collected), 2)
                ELSE 0 END
  )
  FROM o;
$function$;

REVOKE EXECUTE ON FUNCTION public.mission_control_summary(DATE) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.order_financial_summary(DATE, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mission_control_summary(DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.order_financial_summary(DATE, DATE) TO service_role;

-- Bookings are created in one transaction; a repeated checkout returns the first order
-- (20261005_atomic_booking.sql, PR-10 / PR-11; saves the card hold since 20261007_payment_holds.sql)
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key ON orders(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Card holds and Payment Needed lists for the daily job and Mission Control (20261007_payment_holds.sql)
CREATE INDEX IF NOT EXISTS idx_orders_hold_expires ON orders(hold_expires_at) WHERE hold_status = 'held';
CREATE INDEX IF NOT EXISTS idx_orders_hold_scheduled ON orders(pickup_date) WHERE hold_status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_orders_payment_needed ON orders(payment_needed_since) WHERE payment_status = 'failed';
REVOKE ALL ON order_payments FROM anon, authenticated;
GRANT ALL ON order_payments TO service_role;

-- ZONES AND EXTENDED REACH (20261007_zones_extended_reach.sql). Server only: RLS on, no
-- policies, no grants to anon/authenticated.
-- Coverage settings edited in Mission Control (key 'coverage'; defaults in constants.ts)
CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(60) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by VARCHAR(255)
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_settings FROM anon, authenticated;
GRANT ALL ON app_settings TO service_role;

-- Driving miles from the hub per normalized address (one routing lookup per address)
CREATE TABLE IF NOT EXISTS distance_cache (
  address_key VARCHAR(400) PRIMARY KEY,
  miles NUMERIC(6, 1) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE distance_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON distance_cache FROM anon, authenticated;
GRANT ALL ON distance_cache TO service_role;

-- "Not in your area yet": addresses beyond the last Extended Reach band
CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(30),
  street VARCHAR(255),
  city VARCHAR(100),
  zip VARCHAR(10) NOT NULL,
  miles NUMERIC(6, 1),
  source VARCHAR(30) NOT NULL DEFAULT 'booking',
  -- 'beyond' the last band / outside North Texas, or Zone 5 before its first run (20261007_zones_v2)
  reason VARCHAR(30) NOT NULL DEFAULT 'beyond' CONSTRAINT waitlist_reason_check CHECK (reason IN ('beyond', 'zone5_not_started')),
  -- Ticked "text me" when joining; when they were told Zone 5 opened (20261008_zone5_messages)
  sms_consent BOOLEAN NOT NULL DEFAULT false,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT waitlist_contact_check CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_waitlist_created ON waitlist(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_waitlist_zone5_pending
  ON waitlist(created_at) WHERE reason = 'zone5_not_started' AND notified_at IS NULL;
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON waitlist FROM anon, authenticated;
GRANT ALL ON waitlist TO service_role;

-- Passwordless sign-in codes (hashed, 10 minutes, 5 tries), server only (20261008_routine_and_passwordless)
CREATE TABLE IF NOT EXISTS sign_in_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  purpose VARCHAR(20) NOT NULL CHECK (purpose IN ('sign_in', 'verify_phone')),
  code_hash VARCHAR(64) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sign_in_codes_customer ON sign_in_codes(customer_id, created_at DESC);
ALTER TABLE sign_in_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sign_in_codes FROM anon, authenticated;
GRANT ALL ON sign_in_codes TO service_role;

-- Routine memberships: the standing subscription (client 2026-10-08)
CREATE TABLE IF NOT EXISTS routine_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
  cadence VARCHAR(10) NOT NULL CHECK (cadence IN ('weekly', 'biweekly')),
  pickup_day VARCHAR(10) NOT NULL CHECK (pickup_day IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday')),
  pickup_window VARCHAR(20) NOT NULL,
  address_id UUID REFERENCES addresses(id) ON DELETE SET NULL,
  next_pickup_date DATE,
  paused_until DATE,
  consecutive_skips INT NOT NULL DEFAULT 0,
  -- What each automatic pickup is estimated at (the services booked when joining)
  template JSONB NOT NULL DEFAULT '{}'::jsonb,
  square_customer_id VARCHAR(255),
  square_card_id VARCHAR(255),
  terms_version VARCHAR(20) NOT NULL,
  terms_accepted_at TIMESTAMPTZ NOT NULL,
  enrolled_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_routine_one_open_per_customer
  ON routine_memberships(customer_id) WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS idx_routine_next_pickup ON routine_memberships(next_pickup_date) WHERE status = 'active';
ALTER TABLE routine_memberships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON routine_memberships FROM anon, authenticated;
GRANT SELECT ON routine_memberships TO authenticated;
GRANT ALL ON routine_memberships TO service_role;
DROP POLICY IF EXISTS routine_memberships_customer_read ON routine_memberships;
CREATE POLICY routine_memberships_customer_read ON routine_memberships
  FOR SELECT USING (customer_id IN (SELECT id FROM customers WHERE auth_id = auth.uid()));

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_routine_membership_id_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_routine_membership_id_fkey
  FOREIGN KEY (routine_membership_id) REFERENCES routine_memberships(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_routine ON orders(routine_membership_id, pickup_date) WHERE routine_membership_id IS NOT NULL;

-- Zone 5 runs per band: dispatched (threshold met or "dispatch anyway") and announced
CREATE TABLE IF NOT EXISTS route_cycles (
  run_date DATE NOT NULL,
  band VARCHAR(1) NOT NULL CHECK (band IN ('A', 'B')),
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dispatched')),
  dispatched_at TIMESTAMPTZ,
  dispatched_by VARCHAR(255),
  notified_at TIMESTAMPTZ,
  -- The Monday evening decision (confirmed or moved a week), once (20261008_zone5_messages)
  decided_at TIMESTAMPTZ,
  PRIMARY KEY (run_date, band)
);
ALTER TABLE route_cycles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON route_cycles FROM anon, authenticated;
GRANT ALL ON route_cycles TO service_role;

-- ZIP codes off the ZIP-to-zone table, placed by driving distance, for review (20261007_zones_v2)
CREATE TABLE IF NOT EXISTS zone_resolution_log (
  zip VARCHAR(5) PRIMARY KEY,
  miles NUMERIC(6, 1),
  zone_id VARCHAR(10) NOT NULL, -- zone_1..zone_5, or 'waitlist'
  band VARCHAR(1),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_zone_resolution_log_seen ON zone_resolution_log(last_seen_at DESC);
ALTER TABLE zone_resolution_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON zone_resolution_log FROM anon, authenticated;
GRANT ALL ON zone_resolution_log TO service_role;

CREATE INDEX IF NOT EXISTS idx_orders_extended_reach_run
  ON orders(pickup_date, extended_reach_band) WHERE extended_reach_band IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_booking(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_key UUID := nullif(p->>'idempotency_key', '')::UUID;
  v_date DATE := (p->'order'->>'pickup_date')::DATE;
  v_window TEXT := p->'order'->>'pickup_window';
  v_customer UUID := (p->'order'->>'customer_id')::UUID;
  v_promo TEXT := nullif(p->'order'->>'promo_code', '');
  v_count INT;
  v_order orders%ROWTYPE;
BEGIN
  -- One booking at a time per pickup day, so capacity checks can't race
  PERFORM pg_advisory_xact_lock(hashtext('f11_booking_' || v_date::TEXT));

  -- Same checkout submitted again: return the order it already created
  IF v_key IS NOT NULL THEN
    SELECT * INTO v_order FROM orders WHERE idempotency_key = v_key;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'replay', true, 'order', jsonb_build_object(
        'id', v_order.id, 'order_number', v_order.order_number, 'total', v_order.total, 'status', v_order.status,
        'customer_id', v_order.customer_id));
    END IF;
  END IF;

  SELECT count(*) INTO v_count FROM orders
  WHERE pickup_date = v_date AND pickup_window = v_window AND status <> 'cancelled';
  IF v_count >= (p->>'window_capacity')::INT THEN
    RETURN jsonb_build_object('ok', false, 'error', 'window_full');
  END IF;

  IF p->'order'->>'express_tier' = 'express_24hr' THEN
    SELECT count(*) INTO v_count FROM orders
    WHERE pickup_date = v_date AND express_tier = 'express_24hr' AND status <> 'cancelled';
    IF v_count >= (p->>'express_capacity')::INT THEN
      RETURN jsonb_build_object('ok', false, 'error', 'express_full');
    END IF;
  END IF;

  IF v_promo IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM orders WHERE customer_id = v_customer AND promo_code = v_promo AND status <> 'cancelled') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'promo_used');
    END IF;
    IF coalesce((p->>'reserve_promo')::BOOLEAN, false) AND NOT public.reserve_promo_use(v_promo) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'promo_exhausted');
    END IF;
  END IF;

  INSERT INTO orders (
    order_number, customer_id, address_id, status, order_type, pickup_date, pickup_window,
    delivery_date, delivery_window, weight_lbs, subtotal, express_tier, promo_code, discount_amount,
    express_surcharge, environmental_fee, sales_tax, total, payment_id, payment_status,
    square_customer_id, square_card_id, notes, idempotency_key,
    hold_payment_id, hold_amount, hold_expires_at, hold_status,
    payment_terms_accepted_at, payment_terms_version,
    zone_id, distance_miles, extended_reach_band, extended_reach_fee, frequency,
    routine_membership_id
  )
  SELECT
    r.order_number, r.customer_id, r.address_id, 'booked', r.order_type, r.pickup_date, r.pickup_window,
    r.delivery_date, r.delivery_window, r.weight_lbs, r.subtotal, r.express_tier, r.promo_code,
    coalesce(r.discount_amount, 0), coalesce(r.express_surcharge, 0), r.environmental_fee, r.sales_tax,
    r.total, r.payment_id, coalesce(r.payment_status, 'pending'), r.square_customer_id, r.square_card_id,
    r.notes, v_key,
    r.hold_payment_id, r.hold_amount, r.hold_expires_at, coalesce(r.hold_status, 'none'),
    r.payment_terms_accepted_at, r.payment_terms_version,
    r.zone_id, r.distance_miles, r.extended_reach_band, coalesce(r.extended_reach_fee, 0),
    coalesce(r.frequency, 'one_time'),
    r.routine_membership_id
  FROM jsonb_populate_record(NULL::orders, p->'order') r
  RETURNING * INTO v_order;

  INSERT INTO order_items (order_id, garment_type, service_type, quantity, unit_price, subtotal, notes, details, quote_status)
  SELECT v_order.id, i.garment_type, i.service_type, i.quantity, i.unit_price, i.subtotal, i.notes, i.details,
    coalesce(i.quote_status, 'none')
  FROM jsonb_populate_recordset(NULL::order_items, coalesce(p->'items', '[]'::jsonb)) i;

  INSERT INTO order_events (order_id, status, note, triggered_by)
  VALUES (v_order.id, 'booked', p->'event'->>'note', coalesce(p->'event'->>'triggered_by', 'system'));

  RETURN jsonb_build_object('ok', true, 'replay', false, 'order', jsonb_build_object(
    'id', v_order.id, 'order_number', v_order.order_number, 'total', v_order.total, 'status', v_order.status,
    'customer_id', v_order.customer_id));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_booking(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking(JSONB) TO service_role;

-- One row per message; replaced the old conversations.messages array
-- (20261005_messages_table.sql, PR-26; conversations dropped in 20261006).
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('web', 'sms', 'whatsapp')),
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body TEXT NOT NULL DEFAULT '',
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  stage VARCHAR(50),
  media_url TEXT,
  mode VARCHAR(50), -- simulated, live, ai_reply, ai_escalation, growth_winback ...
  external_id VARCHAR(100), -- Twilio message SID, or the id from the old array
  from_address VARCHAR(100),
  to_address VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_customer_channel ON messages(customer_id, channel, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_order_id ON messages(order_id) WHERE order_id IS NOT NULL;

-- Server writes only; a signed-in customer may read their own messages
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS messages_customer_read ON messages;
CREATE POLICY messages_customer_read ON messages
  FOR SELECT USING (customer_id IN (SELECT id FROM customers WHERE auth_id = auth.uid()));
REVOKE ALL ON messages FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON messages FROM authenticated;

-- Privacy request tools: export and anonymize a customer (20261005_privacy_tools.sql, PR-25).
-- How to use them: supabase/runbooks/privacy-requests.md
CREATE OR REPLACE FUNCTION public.export_customer_data(p_customer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM customers WHERE id = p_customer_id) THEN
    RAISE EXCEPTION 'No customer with id %', p_customer_id;
  END IF;

  SELECT jsonb_build_object(
    'generated_at', now(),
    'customer', (SELECT to_jsonb(c) FROM customers c WHERE c.id = p_customer_id),
    'preferences', (SELECT to_jsonb(p) FROM customer_preferences p WHERE p.customer_id = p_customer_id),
    'addresses', coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at)
                           FROM addresses a WHERE a.customer_id = p_customer_id), '[]'::jsonb),
    'orders', coalesce((
      SELECT jsonb_agg(to_jsonb(o) || jsonb_build_object(
        'items', coalesce((SELECT jsonb_agg(to_jsonb(i)) FROM order_items i WHERE i.order_id = o.id), '[]'::jsonb),
        'events', coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.timestamp) FROM order_events e WHERE e.order_id = o.id), '[]'::jsonb),
        'photos', coalesce((SELECT jsonb_agg(to_jsonb(g) ORDER BY g.captured_at) FROM garment_photos g WHERE g.order_id = o.id), '[]'::jsonb)
      ) ORDER BY o.created_at)
      FROM orders o WHERE o.customer_id = p_customer_id), '[]'::jsonb),
    'claims', coalesce((SELECT jsonb_agg(to_jsonb(cl) ORDER BY cl.created_at)
                        FROM claims cl WHERE cl.customer_id = p_customer_id), '[]'::jsonb),
    'messages', coalesce((SELECT jsonb_agg(to_jsonb(ms) ORDER BY ms.created_at)
                          FROM messages ms WHERE ms.customer_id = p_customer_id), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.anonymize_customer(p_customer_id UUID, p_request_id TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_customer customers%ROWTYPE;
  v_photos TEXT[];
  v_orders INT;
BEGIN
  SELECT * INTO v_customer FROM customers WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No customer with id %', p_customer_id;
  END IF;
  IF v_customer.role <> 'customer' THEN
    RAISE EXCEPTION 'This is a staff account (%). Remove it from Staff first.', v_customer.role;
  END IF;
  IF EXISTS (SELECT 1 FROM orders WHERE customer_id = p_customer_id AND status NOT IN ('delivered', 'cancelled')) THEN
    RAISE EXCEPTION 'This customer has orders still in progress. Deliver or cancel them first.';
  END IF;

  -- Photo files to delete from Storage (the database only holds their URLs)
  SELECT coalesce(array_agg(DISTINCT url), '{}') INTO v_photos FROM (
    SELECT g.photo_url AS url FROM garment_photos g JOIN orders o ON o.id = g.order_id WHERE o.customer_id = p_customer_id
    UNION ALL
    SELECT unnest(cl.photo_urls) FROM claims cl WHERE cl.customer_id = p_customer_id
  ) urls WHERE url IS NOT NULL AND url <> '';

  DELETE FROM garment_photos g USING orders o WHERE o.id = g.order_id AND o.customer_id = p_customer_id;
  UPDATE claims SET description = '[removed at customer request]', photo_urls = '{}', updated_at = now()
  WHERE customer_id = p_customer_id;
  DELETE FROM messages WHERE customer_id = p_customer_id;
  DELETE FROM customer_preferences WHERE customer_id = p_customer_id;

  -- City, state and ZIP stay: they decide which tax and zone applied to past orders
  UPDATE addresses SET street = '[removed]', unit = NULL, delivery_notes = NULL, lat = NULL, lng = NULL
  WHERE customer_id = p_customer_id;

  -- Orders and their amounts stay for tax records; the card link and free-text notes go
  UPDATE orders SET notes = NULL, square_customer_id = NULL, square_card_id = NULL, updated_at = now()
  WHERE customer_id = p_customer_id;
  GET DIAGNOSTICS v_orders = ROW_COUNT;

  UPDATE customers SET
    full_name = 'Deleted customer',
    email = 'deleted-' || id::TEXT || '@deleted.invalid',
    phone = NULL,
    auth_id = NULL,
    sms_consent = false,
    sms_promotions_consent = false,
    sms_consent_at = NULL,
    square_customer_id = NULL,
    updated_at = now()
  WHERE id = p_customer_id;

  INSERT INTO admin_audit_logs (admin_id, admin_email, action, target_type, target_id, details)
  VALUES (NULL, 'database: anonymize_customer', 'customer_anonymized', 'customer', p_customer_id::TEXT,
          jsonb_build_object('request_id', p_request_id, 'orders_kept', v_orders, 'photo_files', cardinality(v_photos)));

  RETURN jsonb_build_object(
    'customer_id', p_customer_id,
    'orders_kept', v_orders,
    'delete_login_user_id', v_customer.auth_id,
    'delete_square_customer_id', v_customer.square_customer_id,
    'delete_photo_files', to_jsonb(v_photos)
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.export_customer_data(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.anonymize_customer(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.export_customer_data(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.anonymize_customer(UUID, TEXT) TO service_role;
