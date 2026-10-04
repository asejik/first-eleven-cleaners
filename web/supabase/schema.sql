-- =================================================================
-- FIRST ELEVEN CLEANERS — DATABASE SCHEMA (SUPABASE / POSTGRESQL)
-- =================================================================

-- Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. ZONES (DFW Service Coverage)
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. ORDER ITEMS
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  garment_type VARCHAR(100) NOT NULL,
  service_type VARCHAR(50) NOT NULL DEFAULT 'dry_clean' CHECK (service_type IN ('dry_clean', 'wash_fold')),
  quantity INT NOT NULL DEFAULT 1,
  unit_price NUMERIC(10, 2) NOT NULL,
  subtotal NUMERIC(10, 2) NOT NULL,
  notes TEXT
);

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
  photo_type VARCHAR(50) NOT NULL CHECK (
    photo_type IN ('intake', 'return', 'delivery_proof', 'pickup_proof')
  ),
  photo_url TEXT NOT NULL,
  condition_notes TEXT,
  captured_by VARCHAR(100),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. TIME SLOTS
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
CREATE TABLE IF NOT EXISTS staff (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'driver', 'intake_staff')),
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(50),
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- 13. CONVERSATIONS (Eleven Memory)
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  channel VARCHAR(50) NOT NULL DEFAULT 'web' CHECK (channel IN ('web', 'sms', 'whatsapp')),
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
$ LANGUAGE plpgsql;
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
