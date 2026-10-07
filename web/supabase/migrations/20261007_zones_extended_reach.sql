-- ============================================================================
-- MIGRATION: 20261007_zones_extended_reach.sql
-- DESCRIPTION: Zones and Zone 5 Extended Reach (client 2026-10-07, request 8).
--              1. app_settings: coverage settings edited in Mission Control (zone
--                 minimums, route days, distance bands, Zone 5 fees, thresholds and
--                 cadence, the Express switch). Server only.
--              2. distance_cache: driving miles from the hub per address, so each
--                 address is looked up with the routing service once. Server only.
--              3. waitlist: addresses beyond 80 miles. Server only.
--              4. route_cycles: each Zone 5 run per band (open or dispatched, and
--                 whether its customers were told it runs). Server only.
--              5. orders: zone, driving miles, Zone 5 band and fee, and the recurring
--                 plan (until now only written into the notes).
--              6. create_booking(): also saves those five order columns.
-- TYPE: ADDITIVE (new tables, new columns with defaults; replaces one function with
--       a version that saves five more columns)
-- BEFORE RUNNING: nothing to back up.
-- ============================================================================

BEGIN;

-- 1. Coverage settings (one row per key; the app reads key 'coverage')
CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(60) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by VARCHAR(255)
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_settings FROM anon, authenticated;
GRANT ALL ON app_settings TO service_role;

-- 2. Driving miles from the hub, per normalized address
CREATE TABLE IF NOT EXISTS distance_cache (
  address_key VARCHAR(400) PRIMARY KEY,
  miles NUMERIC(6, 1) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE distance_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON distance_cache FROM anon, authenticated;
GRANT ALL ON distance_cache TO service_role;

-- 3. "Not in your area yet" waitlist
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT waitlist_contact_check CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_waitlist_created ON waitlist(created_at DESC);
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON waitlist FROM anon, authenticated;
GRANT ALL ON waitlist TO service_role;

-- 4. Zone 5 runs: one row per run date and band once it is dispatched or announced
CREATE TABLE IF NOT EXISTS route_cycles (
  run_date DATE NOT NULL,
  band VARCHAR(1) NOT NULL CHECK (band IN ('A', 'B')),
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dispatched')),
  dispatched_at TIMESTAMPTZ,
  dispatched_by VARCHAR(255),
  -- The customers in the run were told it runs
  notified_at TIMESTAMPTZ,
  PRIMARY KEY (run_date, band)
);
ALTER TABLE route_cycles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON route_cycles FROM anon, authenticated;
GRANT ALL ON route_cycles TO service_role;

-- 5. Orders: where the address resolved, the Zone 5 fee, and the recurring plan
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS zone_id VARCHAR(10),
  ADD COLUMN IF NOT EXISTS distance_miles NUMERIC(6, 1),
  ADD COLUMN IF NOT EXISTS extended_reach_band VARCHAR(1),
  ADD COLUMN IF NOT EXISTS extended_reach_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS frequency VARCHAR(10) NOT NULL DEFAULT 'one_time';
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_extended_reach_band_check;
ALTER TABLE orders ADD CONSTRAINT orders_extended_reach_band_check
  CHECK (extended_reach_band IS NULL OR extended_reach_band IN ('A', 'B'));
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_frequency_check;
ALTER TABLE orders ADD CONSTRAINT orders_frequency_check
  CHECK (frequency IN ('one_time', 'weekly', 'biweekly'));
CREATE INDEX IF NOT EXISTS idx_orders_extended_reach_run
  ON orders(pickup_date, extended_reach_band) WHERE extended_reach_band IS NOT NULL;

-- Orders booked before this change kept their plan only in the notes
UPDATE orders SET frequency = 'biweekly' WHERE frequency = 'one_time' AND notes LIKE '%Recurring Plan: Bi-Weekly%';
UPDATE orders SET frequency = 'weekly' WHERE frequency = 'one_time' AND notes LIKE '%Recurring Plan: Weekly%';

-- 6. create_booking(): also saves the zone, miles, Zone 5 band and fee, and the plan
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
    zone_id, distance_miles, extended_reach_band, extended_reach_fee, frequency
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
    coalesce(r.frequency, 'one_time')
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

COMMIT;

-- ============================================================================
-- VERIFY (read-only):
-- select
--   (select count(*) from information_schema.tables where table_schema = 'public'
--      and table_name in ('app_settings', 'distance_cache', 'waitlist', 'route_cycles')) as new_tables,
--   (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'orders'
--      and column_name in ('zone_id', 'distance_miles', 'extended_reach_band', 'extended_reach_fee', 'frequency')) as new_order_columns,
--   (select position('extended_reach_fee' in pg_get_functiondef('public.create_booking(jsonb)'::regprocedure)) > 0) as booking_saves_zone
-- limit 1;
-- ============================================================================
-- ROLLBACK SCRIPT (run as one block):
-- BEGIN;
-- CREATE OR REPLACE FUNCTION public.create_booking(p JSONB)
-- RETURNS JSONB
-- LANGUAGE plpgsql
-- SET search_path = public, pg_temp
-- AS $function$
-- DECLARE
--   v_key UUID := nullif(p->>'idempotency_key', '')::UUID;
--   v_date DATE := (p->'order'->>'pickup_date')::DATE;
--   v_window TEXT := p->'order'->>'pickup_window';
--   v_customer UUID := (p->'order'->>'customer_id')::UUID;
--   v_promo TEXT := nullif(p->'order'->>'promo_code', '');
--   v_count INT;
--   v_order orders%ROWTYPE;
-- BEGIN
--   -- One booking at a time per pickup day, so capacity checks can't race
--   PERFORM pg_advisory_xact_lock(hashtext('f11_booking_' || v_date::TEXT));
--
--   -- Same checkout submitted again: return the order it already created
--   IF v_key IS NOT NULL THEN
--     SELECT * INTO v_order FROM orders WHERE idempotency_key = v_key;
--     IF FOUND THEN
--       RETURN jsonb_build_object('ok', true, 'replay', true, 'order', jsonb_build_object(
--         'id', v_order.id, 'order_number', v_order.order_number, 'total', v_order.total, 'status', v_order.status,
--         'customer_id', v_order.customer_id));
--     END IF;
--   END IF;
--
--   SELECT count(*) INTO v_count FROM orders
--   WHERE pickup_date = v_date AND pickup_window = v_window AND status <> 'cancelled';
--   IF v_count >= (p->>'window_capacity')::INT THEN
--     RETURN jsonb_build_object('ok', false, 'error', 'window_full');
--   END IF;
--
--   IF p->'order'->>'express_tier' = 'express_24hr' THEN
--     SELECT count(*) INTO v_count FROM orders
--     WHERE pickup_date = v_date AND express_tier = 'express_24hr' AND status <> 'cancelled';
--     IF v_count >= (p->>'express_capacity')::INT THEN
--       RETURN jsonb_build_object('ok', false, 'error', 'express_full');
--     END IF;
--   END IF;
--
--   IF v_promo IS NOT NULL THEN
--     IF EXISTS (SELECT 1 FROM orders WHERE customer_id = v_customer AND promo_code = v_promo AND status <> 'cancelled') THEN
--       RETURN jsonb_build_object('ok', false, 'error', 'promo_used');
--     END IF;
--     IF coalesce((p->>'reserve_promo')::BOOLEAN, false) AND NOT public.reserve_promo_use(v_promo) THEN
--       RETURN jsonb_build_object('ok', false, 'error', 'promo_exhausted');
--     END IF;
--   END IF;
--
--   INSERT INTO orders (
--     order_number, customer_id, address_id, status, order_type, pickup_date, pickup_window,
--     delivery_date, delivery_window, weight_lbs, subtotal, express_tier, promo_code, discount_amount,
--     express_surcharge, environmental_fee, sales_tax, total, payment_id, payment_status,
--     square_customer_id, square_card_id, notes, idempotency_key,
--     hold_payment_id, hold_amount, hold_expires_at, hold_status,
--     payment_terms_accepted_at, payment_terms_version
--   )
--   SELECT
--     r.order_number, r.customer_id, r.address_id, 'booked', r.order_type, r.pickup_date, r.pickup_window,
--     r.delivery_date, r.delivery_window, r.weight_lbs, r.subtotal, r.express_tier, r.promo_code,
--     coalesce(r.discount_amount, 0), coalesce(r.express_surcharge, 0), r.environmental_fee, r.sales_tax,
--     r.total, r.payment_id, coalesce(r.payment_status, 'pending'), r.square_customer_id, r.square_card_id,
--     r.notes, v_key,
--     r.hold_payment_id, r.hold_amount, r.hold_expires_at, coalesce(r.hold_status, 'none'),
--     r.payment_terms_accepted_at, r.payment_terms_version
--   FROM jsonb_populate_record(NULL::orders, p->'order') r
--   RETURNING * INTO v_order;
--
--   INSERT INTO order_items (order_id, garment_type, service_type, quantity, unit_price, subtotal, notes, details, quote_status)
--   SELECT v_order.id, i.garment_type, i.service_type, i.quantity, i.unit_price, i.subtotal, i.notes, i.details,
--     coalesce(i.quote_status, 'none')
--   FROM jsonb_populate_recordset(NULL::order_items, coalesce(p->'items', '[]'::jsonb)) i;
--
--   INSERT INTO order_events (order_id, status, note, triggered_by)
--   VALUES (v_order.id, 'booked', p->'event'->>'note', coalesce(p->'event'->>'triggered_by', 'system'));
--
--   RETURN jsonb_build_object('ok', true, 'replay', false, 'order', jsonb_build_object(
--     'id', v_order.id, 'order_number', v_order.order_number, 'total', v_order.total, 'status', v_order.status,
--     'customer_id', v_order.customer_id));
-- END;
-- $function$;
--
-- REVOKE EXECUTE ON FUNCTION public.create_booking(JSONB) FROM PUBLIC, anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.create_booking(JSONB) TO service_role;
-- ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_extended_reach_band_check;
-- ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_frequency_check;
-- DROP INDEX IF EXISTS idx_orders_extended_reach_run;
-- ALTER TABLE orders
--   DROP COLUMN IF EXISTS zone_id,
--   DROP COLUMN IF EXISTS distance_miles,
--   DROP COLUMN IF EXISTS extended_reach_band,
--   DROP COLUMN IF EXISTS extended_reach_fee,
--   DROP COLUMN IF EXISTS frequency;
-- DROP TABLE IF EXISTS route_cycles;
-- DROP TABLE IF EXISTS waitlist;
-- DROP TABLE IF EXISTS distance_cache;
-- DROP TABLE IF EXISTS app_settings;
-- COMMIT;
-- ============================================================================
