-- ============================================================================
-- Check for export_customer_data() and anonymize_customer() (P03 PR-25).
-- Run against a DEV database only: everything happens inside a transaction
-- that is rolled back at the end. Raises an exception at the first wrong result.
-- ============================================================================
BEGIN;
INSERT INTO customers (id, auth_id, email, full_name, phone, sms_consent, square_customer_id)
VALUES ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'privacy-check@example.com',
        'Privacy Check', '+12145550111', true, 'SQ_CUST_CHECK');
INSERT INTO customer_preferences (customer_id, gate_code, special_notes) VALUES ('00000000-0000-0000-0000-0000000000c1', '1234#', 'side door');
INSERT INTO addresses (id, customer_id, street, unit, zip, delivery_notes)
VALUES ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', '12 Elm St', 'Apt 4', '75201', 'blue door');
INSERT INTO orders (id, order_number, customer_id, address_id, status, order_type, pickup_date, pickup_window,
                    delivery_date, delivery_window, subtotal, total, notes, payment_status, square_card_id)
VALUES ('00000000-0000-0000-0000-0000000000e1', 'PRIV-1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1',
        'delivered', 'dry_clean', '2026-09-01', 'morning', '2026-09-03', 'morning', 50, 55.32, 'leave with doorman', 'charged', 'ccof:check');
INSERT INTO order_items (order_id, garment_type, service_type, quantity, unit_price, subtotal)
VALUES ('00000000-0000-0000-0000-0000000000e1', 'suit_2pc', 'dry_clean', 1, 50, 50);
INSERT INTO garment_photos (order_id, photo_type, photo_url)
VALUES ('00000000-0000-0000-0000-0000000000e1', 'delivery_proof', 'https://x.supabase.co/storage/v1/object/public/garment-photos/e1/door.jpg');
INSERT INTO claims (order_id, customer_id, issue_type, description, photo_urls)
VALUES ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 'damage', 'My name is Privacy Check, call 214-555-0111',
        ARRAY['https://x.supabase.co/storage/v1/object/public/claims-photos/e1/tear.jpg']);
INSERT INTO conversations (customer_id, channel, messages) VALUES ('00000000-0000-0000-0000-0000000000c1', 'sms', '[{"role":"user","content":"hi"}]');

DO $$
DECLARE ex JSONB; res JSONB; c customers%ROWTYPE; failed BOOLEAN;
  cid UUID := '00000000-0000-0000-0000-0000000000c1';
BEGIN
  -- 1. export holds everything
  ex := export_customer_data(cid);
  IF ex->'customer'->>'email' <> 'privacy-check@example.com' THEN RAISE EXCEPTION '1: customer %', ex->'customer'; END IF;
  IF ex->'preferences'->>'gate_code' <> '1234#' THEN RAISE EXCEPTION '1: preferences'; END IF;
  IF jsonb_array_length(ex->'addresses') <> 1 OR jsonb_array_length(ex->'orders') <> 1 THEN RAISE EXCEPTION '1: addresses/orders'; END IF;
  IF jsonb_array_length(ex->'orders'->0->'items') <> 1 OR jsonb_array_length(ex->'orders'->0->'photos') <> 1 THEN RAISE EXCEPTION '1: items/photos'; END IF;
  IF jsonb_array_length(ex->'claims') <> 1 OR jsonb_array_length(ex->'conversations') <> 1 THEN RAISE EXCEPTION '1: claims/conversations'; END IF;

  -- 2. refuses while an order is in progress
  UPDATE orders SET status = 'in_cleaning' WHERE id = '00000000-0000-0000-0000-0000000000e1';
  failed := false;
  BEGIN PERFORM anonymize_customer(cid); EXCEPTION WHEN raise_exception THEN failed := true; END;
  IF NOT failed THEN RAISE EXCEPTION '2: anonymized a customer with an order in progress'; END IF;
  UPDATE orders SET status = 'delivered' WHERE id = '00000000-0000-0000-0000-0000000000e1';

  -- 3. anonymize: personal details gone, orders and amounts kept
  res := anonymize_customer(cid, 'tdpsa_check');
  IF res->>'delete_login_user_id' <> '00000000-0000-0000-0000-0000000000a1' THEN RAISE EXCEPTION '3: login %', res; END IF;
  IF res->>'delete_square_customer_id' <> 'SQ_CUST_CHECK' THEN RAISE EXCEPTION '3: square %', res; END IF;
  IF jsonb_array_length(res->'delete_photo_files') <> 2 THEN RAISE EXCEPTION '3: photos %', res; END IF;
  SELECT * INTO c FROM customers WHERE id = cid;
  IF c.full_name <> 'Deleted customer' OR c.email NOT LIKE 'deleted-%@deleted.invalid' OR c.phone IS NOT NULL
     OR c.auth_id IS NOT NULL OR c.sms_consent OR c.square_customer_id IS NOT NULL THEN
    RAISE EXCEPTION '3: customer not cleared %', to_jsonb(c);
  END IF;
  IF EXISTS (SELECT 1 FROM customer_preferences WHERE customer_id = cid) THEN RAISE EXCEPTION '3: preferences kept'; END IF;
  IF EXISTS (SELECT 1 FROM conversations WHERE customer_id = cid) THEN RAISE EXCEPTION '3: conversations kept'; END IF;
  IF EXISTS (SELECT 1 FROM garment_photos WHERE order_id = '00000000-0000-0000-0000-0000000000e1') THEN RAISE EXCEPTION '3: photo rows kept'; END IF;
  IF NOT EXISTS (SELECT 1 FROM addresses WHERE customer_id = cid AND street = '[removed]' AND unit IS NULL AND delivery_notes IS NULL AND zip = '75201') THEN
    RAISE EXCEPTION '3: address not cleared';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM orders WHERE id = '00000000-0000-0000-0000-0000000000e1' AND total = 55.32 AND notes IS NULL AND square_card_id IS NULL) THEN
    RAISE EXCEPTION '3: order not kept/cleared';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM order_items WHERE order_id = '00000000-0000-0000-0000-0000000000e1') THEN RAISE EXCEPTION '3: items deleted'; END IF;
  IF EXISTS (SELECT 1 FROM claims WHERE customer_id = cid AND (description LIKE '%Privacy Check%' OR cardinality(photo_urls) > 0)) THEN
    RAISE EXCEPTION '3: claim not cleared';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM admin_audit_logs WHERE action = 'customer_anonymized' AND target_id = cid::TEXT
                 AND details->>'request_id' = 'tdpsa_check') THEN
    RAISE EXCEPTION '3: no audit row';
  END IF;

  -- 4. staff accounts are refused
  UPDATE customers SET role = 'driver' WHERE id = cid;
  failed := false;
  BEGIN PERFORM anonymize_customer(cid); EXCEPTION WHEN raise_exception THEN failed := true; END;
  IF NOT failed THEN RAISE EXCEPTION '4: anonymized a staff account'; END IF;

  RAISE NOTICE 'privacy tools checks OK';
END $$;

-- 5. browsers cannot call either function
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.export_customer_data(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.anonymize_customer(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION '5: callable by browsers';
  END IF;
END $$;
ROLLBACK;
