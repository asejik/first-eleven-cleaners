-- ============================================================================
-- MIGRATION: 20261007_payment_holds.sql
-- DESCRIPTION: "See it as you pay it" payment model (client 2026-10-06, Part A).
--              1. orders: the card hold placed for the estimate (a Square payment
--                 with autocomplete=false), the amount still owed after intake,
--                 the checkout payment-terms acceptance, and the Payment Needed
--                 reminder ladder.
--              2. order_payments: one row per Square payment on an order (the
--                 hold, a top-up charge above the hold, later quote charges).
--                 Server only: RLS on, no policies, no grants to anon/authenticated.
--              3. create_booking(): also saves the hold and terms columns, so the
--                 order and its hold record are written in one transaction.
-- TYPE: ADDITIVE (new columns with defaults, a new table; replaces one function
--       with a version that saves six more columns)
-- BEFORE RUNNING: confirm the live create_booking() matches the repo (read-only
--              check from the developer). No backup needed.
-- ============================================================================

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS hold_payment_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS hold_amount NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS hold_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hold_status VARCHAR(20) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS amount_due NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS payment_terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_terms_version VARCHAR(40),
  ADD COLUMN IF NOT EXISTS payment_needed_since TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_reminder_stage SMALLINT NOT NULL DEFAULT 0;

-- none: no hold yet (old orders, or Square not configured)
-- scheduled: to be placed 2 days before pickup by the daily job
-- held: authorized with Square; captured: completed at intake
-- released: cancelled by us (pickup cancelled); declined: Square refused it
-- expired: Square cancelled it after 7 days without capture
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_hold_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_hold_status_check
  CHECK (hold_status IN ('none', 'scheduled', 'held', 'captured', 'released', 'declined', 'expired'));

-- 0 none sent, 1 reminder sent (24 h), 2 staff call due (48 h), 3 owner decision (7 days)
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_reminder_stage_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_reminder_stage_check
  CHECK (payment_reminder_stage BETWEEN 0 AND 3);

CREATE INDEX IF NOT EXISTS idx_orders_hold_expires ON orders(hold_expires_at) WHERE hold_status = 'held';
CREATE INDEX IF NOT EXISTS idx_orders_hold_scheduled ON orders(pickup_date) WHERE hold_status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_orders_payment_needed ON orders(payment_needed_since) WHERE payment_status = 'failed';

-- One row per Square payment on an order (P: client 2026-10-06, Part A)
CREATE TABLE IF NOT EXISTS order_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  square_payment_id VARCHAR(255) UNIQUE,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('hold', 'top_up', 'charge', 'quote')),
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  status VARCHAR(20) NOT NULL CHECK (status IN ('approved', 'completed', 'canceled', 'failed')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_payments_order ON order_payments(order_id);

-- Server only (service role): RLS on, no policies, no grants to signed-in or anonymous users
ALTER TABLE order_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON order_payments FROM anon, authenticated;
GRANT ALL ON order_payments TO service_role;

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
    payment_terms_accepted_at, payment_terms_version
  )
  SELECT
    r.order_number, r.customer_id, r.address_id, 'booked', r.order_type, r.pickup_date, r.pickup_window,
    r.delivery_date, r.delivery_window, r.weight_lbs, r.subtotal, r.express_tier, r.promo_code,
    coalesce(r.discount_amount, 0), coalesce(r.express_surcharge, 0), r.environmental_fee, r.sales_tax,
    r.total, r.payment_id, coalesce(r.payment_status, 'pending'), r.square_customer_id, r.square_card_id,
    r.notes, v_key,
    r.hold_payment_id, r.hold_amount, r.hold_expires_at, coalesce(r.hold_status, 'none'),
    r.payment_terms_accepted_at, r.payment_terms_version
  FROM jsonb_populate_record(NULL::orders, p->'order') r
  RETURNING * INTO v_order;

  INSERT INTO order_items (order_id, garment_type, service_type, quantity, unit_price, subtotal, notes)
  SELECT v_order.id, i.garment_type, i.service_type, i.quantity, i.unit_price, i.subtotal, i.notes
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
-- select column_name, data_type, column_default from information_schema.columns
--   where table_schema = 'public' and table_name = 'orders'
--   and column_name in ('hold_payment_id', 'hold_amount', 'hold_expires_at', 'hold_status', 'amount_due',
--     'payment_terms_accepted_at', 'payment_terms_version', 'payment_needed_since', 'payment_reminder_stage')
--   limit 20;
-- select relrowsecurity from pg_class where relname = 'order_payments';
-- select position('hold_payment_id' in pg_get_functiondef('public.create_booking(jsonb)'::regprocedure)) > 0 as saves_hold;
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
--     square_customer_id, square_card_id, notes, idempotency_key
--   )
--   SELECT
--     r.order_number, r.customer_id, r.address_id, 'booked', r.order_type, r.pickup_date, r.pickup_window,
--     r.delivery_date, r.delivery_window, r.weight_lbs, r.subtotal, r.express_tier, r.promo_code,
--     coalesce(r.discount_amount, 0), coalesce(r.express_surcharge, 0), r.environmental_fee, r.sales_tax,
--     r.total, r.payment_id, coalesce(r.payment_status, 'pending'), r.square_customer_id, r.square_card_id,
--     r.notes, v_key
--   FROM jsonb_populate_record(NULL::orders, p->'order') r
--   RETURNING * INTO v_order;
--
--   INSERT INTO order_items (order_id, garment_type, service_type, quantity, unit_price, subtotal, notes)
--   SELECT v_order.id, i.garment_type, i.service_type, i.quantity, i.unit_price, i.subtotal, i.notes
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
-- DROP TABLE IF EXISTS order_payments;
-- DROP INDEX IF EXISTS idx_orders_hold_expires;
-- DROP INDEX IF EXISTS idx_orders_hold_scheduled;
-- DROP INDEX IF EXISTS idx_orders_payment_needed;
-- ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_hold_status_check;
-- ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_reminder_stage_check;
-- ALTER TABLE orders
--   DROP COLUMN IF EXISTS hold_payment_id,
--   DROP COLUMN IF EXISTS hold_amount,
--   DROP COLUMN IF EXISTS hold_expires_at,
--   DROP COLUMN IF EXISTS hold_status,
--   DROP COLUMN IF EXISTS amount_due,
--   DROP COLUMN IF EXISTS payment_terms_accepted_at,
--   DROP COLUMN IF EXISTS payment_terms_version,
--   DROP COLUMN IF EXISTS payment_needed_since,
--   DROP COLUMN IF EXISTS payment_reminder_stage;
-- COMMIT;
-- ============================================================================
