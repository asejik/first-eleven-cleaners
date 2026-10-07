-- ============================================================================
-- MIGRATION: 20261007_alterations_quotes.sql
-- DESCRIPTION: Alterations category and quote approval (client 2026-10-06, Parts B-D).
--              1. order_items.service_type also allows 'alteration'.
--              2. order_items: details (fit instruction and notes), and the quote for
--                 "from" items: quote_status, quoted_unit_price, quote_requested_at,
--                 quote_reminder_stage, quote_decided_at.
--              3. garment_photos.photo_type also allows 'customer_reference' (the photo
--                 a customer attaches to a general repair at booking).
--              4. create_booking() saves details and quote_status.
-- TYPE: ADDITIVE (wider CHECKs, new columns with defaults; replaces one function)
-- BEFORE RUNNING: nothing; no backup needed.
-- ============================================================================

BEGIN;

-- 1. Alteration line items (service_type 'alteration'). The old CHECK is found by what it
--    checks, so this works whatever the live constraint is called.
DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.order_items'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%service_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.order_items DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE order_items ADD CONSTRAINT order_items_service_type_check
  CHECK (service_type IN ('dry_clean', 'wash_fold', 'alteration'));

-- 2. Fit instruction for an alteration, and the quote for a "from" item
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS details JSONB,
  ADD COLUMN IF NOT EXISTS quote_status VARCHAR(20) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS quoted_unit_price NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS quote_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quote_reminder_stage SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quote_decided_at TIMESTAMPTZ;

-- none: fixed price. pending: "from" item booked, price confirmed at intake.
-- within_band: confirmed up to 25% above the from-price, charged at intake.
-- awaiting_approval: confirmed higher; waits for the customer's OK.
-- approved: the customer agreed and it was charged. declined: the customer said no.
-- returned: no answer after 5 business days; returned unaltered, no charge.
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_quote_status_check;
ALTER TABLE order_items ADD CONSTRAINT order_items_quote_status_check
  CHECK (quote_status IN ('none', 'pending', 'within_band', 'awaiting_approval', 'approved', 'declined', 'returned'));
-- 0 quote sent, 1 reminder sent (24 h), 2 staff call due (48 h)
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_quote_reminder_stage_check;
ALTER TABLE order_items ADD CONSTRAINT order_items_quote_reminder_stage_check
  CHECK (quote_reminder_stage BETWEEN 0 AND 2);
CREATE INDEX IF NOT EXISTS idx_order_items_awaiting_quote ON order_items(quote_requested_at)
  WHERE quote_status = 'awaiting_approval';

-- 3. The customer's own reference photo (general repair), attached at booking
DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.garment_photos'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%photo_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.garment_photos DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE garment_photos ADD CONSTRAINT garment_photos_photo_type_check
  CHECK (photo_type IN ('intake', 'return', 'delivery_proof', 'pickup_proof', 'customer_reference'));

-- 4. create_booking(): also saves each line's details and quote status
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
--   (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'order_items'
--      and column_name in ('details', 'quote_status', 'quoted_unit_price', 'quote_requested_at',
--        'quote_reminder_stage', 'quote_decided_at')) as new_columns,
--   (select pg_get_constraintdef(oid) like '%alteration%' from pg_constraint where conname = 'order_items_service_type_check') as allows_alteration,
--   (select pg_get_constraintdef(oid) like '%customer_reference%' from pg_constraint where conname = 'garment_photos_photo_type_check') as allows_reference_photo,
--   (select position('quote_status' in pg_get_functiondef('public.create_booking(jsonb)'::regprocedure)) > 0) as booking_saves_details
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
-- DROP INDEX IF EXISTS idx_order_items_awaiting_quote;
-- ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_quote_status_check;
-- ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_quote_reminder_stage_check;
-- ALTER TABLE order_items
--   DROP COLUMN IF EXISTS details,
--   DROP COLUMN IF EXISTS quote_status,
--   DROP COLUMN IF EXISTS quoted_unit_price,
--   DROP COLUMN IF EXISTS quote_requested_at,
--   DROP COLUMN IF EXISTS quote_reminder_stage,
--   DROP COLUMN IF EXISTS quote_decided_at;
-- -- Only after deleting or converting any 'alteration' items and 'customer_reference' photos:
-- ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_service_type_check;
-- ALTER TABLE order_items ADD CONSTRAINT order_items_service_type_check CHECK (service_type IN ('dry_clean', 'wash_fold'));
-- ALTER TABLE garment_photos DROP CONSTRAINT IF EXISTS garment_photos_photo_type_check;
-- ALTER TABLE garment_photos ADD CONSTRAINT garment_photos_photo_type_check
--   CHECK (photo_type IN ('intake', 'return', 'delivery_proof', 'pickup_proof'));
-- COMMIT;
-- ============================================================================
