-- ============================================================================
-- MIGRATION: 20261005_privacy_tools.sql
-- DESCRIPTION: Tools for fulfilling customer privacy requests (P03 PR-25).
--              Before: a request was only a note and an email; there was no way
--              to export a customer's data, and a customer couldn't be deleted
--              because their orders must be kept (orders.customer_id is
--              ON DELETE RESTRICT).
--              export_customer_data(id) returns everything held about a customer
--              as one JSON document.
--              anonymize_customer(id, request_id) removes the personal details
--              (name, email, phone, street, notes, preferences, conversations,
--              photo records) and keeps the orders and amounts needed for tax
--              records. It returns the login, Square customer and photo files
--              that must be deleted by hand (see supabase/runbooks/privacy-requests.md).
--              Run from the SQL Editor; not callable by browsers.
-- TYPE: ADDITIVE (two new functions; no data changes until anonymize_customer is run)
-- ============================================================================

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
    'conversations', coalesce((SELECT jsonb_agg(to_jsonb(cv) ORDER BY cv.created_at)
                               FROM conversations cv WHERE cv.customer_id = p_customer_id), '[]'::jsonb),
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
  DELETE FROM conversations WHERE customer_id = p_customer_id;
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

-- ============================================================================
-- ROLLBACK SCRIPT:
-- DROP FUNCTION IF EXISTS public.anonymize_customer(UUID, TEXT);
-- DROP FUNCTION IF EXISTS public.export_customer_data(UUID);
-- ============================================================================
