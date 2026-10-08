-- ============================================================================
-- MIGRATION: 20261008_routine_and_passwordless.sql
-- DESCRIPTION: Routine membership and passwordless sign-in (client 2026-10-08,
--              Part 2 item 2).
--              1. customers.phone_verified_at: the account owner proved the phone
--                 with a texted code. Text-code sign-in only goes to a verified
--                 phone (a guest booking can type any phone). A trigger clears it
--                 whenever the phone changes.
--              2. sign_in_codes: one-time 6-digit codes (hashed), 10 minutes,
--                 5 tries. Server only.
--              3. routine_memberships: the standing Routine subscription (cadence,
--                 day, window, address, card, pause, skips, the agreement accepted).
--                 One open membership per customer. Customers read their own.
--              4. orders.routine_membership_id, saved by create_booking().
-- TYPE: ADDITIVE (new tables, new nullable columns, a trigger; create_booking()
--       replaced with the same body plus one column)
-- BEFORE RUNNING: nothing to back up.
-- ============================================================================
BEGIN;

-- 1. Verified phone
ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;

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

-- 2. One-time codes
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

-- 3. Routine memberships
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

-- 4. Orders made by a membership
ALTER TABLE orders ADD COLUMN IF NOT EXISTS routine_membership_id UUID REFERENCES routine_memberships(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_routine ON orders(routine_membership_id, pickup_date) WHERE routine_membership_id IS NOT NULL;

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

COMMIT;

-- ============================================================================
-- VERIFY (read-only):
-- select
--   (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'customers' and column_name = 'phone_verified_at') as phone_verified,
--   (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('sign_in_codes', 'routine_memberships')) as new_tables,
--   (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'routine_membership_id') as order_link,
--   (select count(*) from pg_proc where proname = 'create_booking' and prosrc like '%routine_membership_id%') as booking_function
-- limit 1;
-- Expected: 1, 2, 1, 1
-- ============================================================================
-- ROLLBACK SCRIPT (run as one block; first re-run create_booking() from
-- 20261007_zones_extended_reach.sql so it no longer names the column):
-- BEGIN;
-- ALTER TABLE orders DROP COLUMN IF EXISTS routine_membership_id;
-- DROP TABLE IF EXISTS routine_memberships;
-- DROP TABLE IF EXISTS sign_in_codes;
-- DROP TRIGGER IF EXISTS customers_clear_phone_verification ON customers;
-- DROP FUNCTION IF EXISTS public.clear_phone_verification();
-- ALTER TABLE customers DROP COLUMN IF EXISTS phone_verified_at;
-- COMMIT;
-- ============================================================================
