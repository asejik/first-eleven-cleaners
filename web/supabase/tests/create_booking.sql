-- ============================================================================
-- Check for create_booking() (P03 PR-10/11). Run against a DEV database only:
-- everything happens inside a transaction that is rolled back at the end.
-- Raises an exception at the first wrong result.
-- ============================================================================
BEGIN;
INSERT INTO customers (id, email, full_name) VALUES ('00000000-0000-0000-0000-0000000000b1', 'booking-check@example.com', 'Booking Check');
INSERT INTO promo_codes (code, discount_type, discount_value, max_uses, current_uses, is_active)
VALUES ('CHECKONE', 'percentage', 10, 1, 0, true);

CREATE TEMP TABLE r (label TEXT, res JSONB);

CREATE FUNCTION pg_temp.req(num TEXT, key UUID, win_cap INT, exp_cap INT, tier TEXT, promo TEXT, items JSONB)
RETURNS JSONB LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'idempotency_key', key, 'window_capacity', win_cap, 'express_capacity', exp_cap, 'reserve_promo', promo IS NOT NULL,
    'order', jsonb_build_object('order_number', num, 'customer_id', '00000000-0000-0000-0000-0000000000b1',
      'order_type', 'dry_clean', 'pickup_date', '2026-10-12', 'pickup_window', 'morning', 'delivery_date', '2026-10-14',
      'delivery_window', 'morning', 'subtotal', 50, 'express_tier', tier, 'promo_code', promo, 'discount_amount', 0,
      'total', 55, 'payment_status', 'authorized'),
    'items', items,
    'event', jsonb_build_object('note', 'check', 'triggered_by', 'Booking Check'))
$$;

DO $$
DECLARE res JSONB; k UUID := gen_random_uuid(); n INT;
  good_items JSONB := '[{"garment_type":"shirt_blouse","service_type":"dry_clean","quantity":2,"unit_price":8.99,"subtotal":17.98}]';
BEGIN
  -- 1. creates order + items + event
  res := create_booking(pg_temp.req('CHK-1', k, 25, 8, 'standard', NULL, good_items));
  IF NOT (res->>'ok')::BOOLEAN THEN RAISE EXCEPTION '1 failed: %', res; END IF;
  SELECT count(*) INTO n FROM order_items WHERE order_id = (res->'order'->>'id')::UUID;
  IF n <> 1 THEN RAISE EXCEPTION '1: items not inserted'; END IF;
  SELECT count(*) INTO n FROM order_events WHERE order_id = (res->'order'->>'id')::UUID;
  IF n <> 1 THEN RAISE EXCEPTION '1: event not inserted'; END IF;

  -- 2. same checkout key returns the first order, no duplicate
  res := create_booking(pg_temp.req('CHK-1-AGAIN', k, 25, 8, 'standard', NULL, good_items));
  IF NOT (res->>'replay')::BOOLEAN OR res->'order'->>'order_number' <> 'CHK-1' THEN RAISE EXCEPTION '2 failed: %', res; END IF;
  SELECT count(*) INTO n FROM orders WHERE customer_id = '00000000-0000-0000-0000-0000000000b1';
  IF n <> 1 THEN RAISE EXCEPTION '2: duplicate order created'; END IF;

  -- 3. window capacity
  res := create_booking(pg_temp.req('CHK-2', gen_random_uuid(), 1, 8, 'standard', NULL, good_items));
  IF res->>'error' IS DISTINCT FROM 'window_full' THEN RAISE EXCEPTION '3 failed: %', res; END IF;

  -- 4. Express daily capacity
  res := create_booking(pg_temp.req('CHK-3', gen_random_uuid(), 25, 0, 'express_24hr', NULL, good_items));
  IF res->>'error' IS DISTINCT FROM 'express_full' THEN RAISE EXCEPTION '4 failed: %', res; END IF;

  -- 5. promo: first use works, second use by the same customer refused
  res := create_booking(pg_temp.req('CHK-4', gen_random_uuid(), 25, 8, 'standard', 'CHECKONE', good_items));
  IF NOT (res->>'ok')::BOOLEAN THEN RAISE EXCEPTION '5a failed: %', res; END IF;
  res := create_booking(pg_temp.req('CHK-5', gen_random_uuid(), 25, 8, 'standard', 'CHECKONE', good_items));
  IF res->>'error' IS DISTINCT FROM 'promo_used' THEN RAISE EXCEPTION '5b failed: %', res; END IF;

  -- 6. a failure part-way rolls everything back (bad item) including the promo use
  UPDATE promo_codes SET max_uses = 5 WHERE code = 'CHECKONE';
  DELETE FROM order_events WHERE order_id IN (SELECT id FROM orders WHERE order_number = 'CHK-4');
  DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE order_number = 'CHK-4');
  DELETE FROM orders WHERE order_number = 'CHK-4';
  SELECT current_uses INTO n FROM promo_codes WHERE code = 'CHECKONE';
  BEGIN
    res := create_booking(pg_temp.req('CHK-6', gen_random_uuid(), 25, 8, 'standard', 'CHECKONE',
      '[{"garment_type":"x","service_type":"not_a_service","quantity":1,"unit_price":1,"subtotal":1}]'));
    RAISE EXCEPTION '6: expected a failure';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM orders WHERE order_number = 'CHK-6') THEN RAISE EXCEPTION '6: order left behind'; END IF;
  IF (SELECT current_uses FROM promo_codes WHERE code = 'CHECKONE') <> n THEN RAISE EXCEPTION '6: promo use not rolled back'; END IF;

  RAISE NOTICE 'create_booking checks OK';
END $$;
ROLLBACK;
