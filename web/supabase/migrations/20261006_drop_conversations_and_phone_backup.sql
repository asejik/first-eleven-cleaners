-- ============================================================================
-- MIGRATION: 20261006_drop_conversations_and_phone_backup.sql
-- DESCRIPTION: Post-audit cleanup (owner approved 2026-10-06).
--              1. conversations: no longer written since PR-26; every message
--                 it held was copied into messages by 20261005_messages_table.sql.
--                 export_customer_data() and anonymize_customer() stop reading it.
--              2. customers_phone_backup_20261005: original phone formats saved by
--                 20261005_normalize_customer_phones.sql. The migration is
--                 trusted, so this extra copy of personal data is removed.
-- TYPE: DESTRUCTIVE (drops two tables; replaces two functions)
-- BEFORE RUNNING: run the read-only pre-checks the developer provided. Optional
--              backup: Table Editor > each table > Export to CSV.
-- ============================================================================

BEGIN;

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

DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS customers_phone_backup_20261005;

COMMIT;

-- ============================================================================
-- ROLLBACK SCRIPT (recreates the empty conversations table and the previous
-- function bodies; dropped rows come back only from a CSV backup. The phone
-- backup table can't be meaningfully recreated: the originals are gone.)
--
-- BEGIN;
-- CREATE TABLE IF NOT EXISTS conversations (
--   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--   customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
--   channel VARCHAR(50) NOT NULL DEFAULT 'web' CHECK (channel IN ('web', 'sms', 'whatsapp')),
--   messages JSONB NOT NULL DEFAULT '[]'::jsonb,
--   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );
-- ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY conversations_customer_access ON conversations
--   FOR ALL USING (customer_id IN (SELECT id FROM customers WHERE auth_id = auth.uid()));
-- CREATE INDEX IF NOT EXISTS idx_conversations_customer_id ON conversations(customer_id);
--
-- CREATE OR REPLACE FUNCTION public.export_customer_data(p_customer_id UUID)
-- RETURNS JSONB
-- LANGUAGE plpgsql
-- STABLE
-- SET search_path = public, pg_temp
-- AS $function$
-- DECLARE
--   v_result JSONB;
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM customers WHERE id = p_customer_id) THEN
--     RAISE EXCEPTION 'No customer with id %', p_customer_id;
--   END IF;
--
--   SELECT jsonb_build_object(
--     'generated_at', now(),
--     'customer', (SELECT to_jsonb(c) FROM customers c WHERE c.id = p_customer_id),
--     'preferences', (SELECT to_jsonb(p) FROM customer_preferences p WHERE p.customer_id = p_customer_id),
--     'addresses', coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at)
--                            FROM addresses a WHERE a.customer_id = p_customer_id), '[]'::jsonb),
--     'orders', coalesce((
--       SELECT jsonb_agg(to_jsonb(o) || jsonb_build_object(
--         'items', coalesce((SELECT jsonb_agg(to_jsonb(i)) FROM order_items i WHERE i.order_id = o.id), '[]'::jsonb),
--         'events', coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.timestamp) FROM order_events e WHERE e.order_id = o.id), '[]'::jsonb),
--         'photos', coalesce((SELECT jsonb_agg(to_jsonb(g) ORDER BY g.captured_at) FROM garment_photos g WHERE g.order_id = o.id), '[]'::jsonb)
--       ) ORDER BY o.created_at)
--       FROM orders o WHERE o.customer_id = p_customer_id), '[]'::jsonb),
--     'claims', coalesce((SELECT jsonb_agg(to_jsonb(cl) ORDER BY cl.created_at)
--                         FROM claims cl WHERE cl.customer_id = p_customer_id), '[]'::jsonb),
--     'conversations', coalesce((SELECT jsonb_agg(to_jsonb(cv) ORDER BY cv.created_at)
--                                FROM conversations cv WHERE cv.customer_id = p_customer_id), '[]'::jsonb),
--     'messages', coalesce((SELECT jsonb_agg(to_jsonb(ms) ORDER BY ms.created_at)
--                           FROM messages ms WHERE ms.customer_id = p_customer_id), '[]'::jsonb)
--   ) INTO v_result;
--
--   RETURN v_result;
-- END;
-- $function$;
--
-- CREATE OR REPLACE FUNCTION public.anonymize_customer(p_customer_id UUID, p_request_id TEXT DEFAULT NULL)
-- RETURNS JSONB
-- LANGUAGE plpgsql
-- SET search_path = public, pg_temp
-- AS $function$
-- DECLARE
--   v_customer customers%ROWTYPE;
--   v_photos TEXT[];
--   v_orders INT;
-- BEGIN
--   SELECT * INTO v_customer FROM customers WHERE id = p_customer_id FOR UPDATE;
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'No customer with id %', p_customer_id;
--   END IF;
--   IF v_customer.role <> 'customer' THEN
--     RAISE EXCEPTION 'This is a staff account (%). Remove it from Staff first.', v_customer.role;
--   END IF;
--   IF EXISTS (SELECT 1 FROM orders WHERE customer_id = p_customer_id AND status NOT IN ('delivered', 'cancelled')) THEN
--     RAISE EXCEPTION 'This customer has orders still in progress. Deliver or cancel them first.';
--   END IF;
--
--   -- Photo files to delete from Storage (the database only holds their URLs)
--   SELECT coalesce(array_agg(DISTINCT url), '{}') INTO v_photos FROM (
--     SELECT g.photo_url AS url FROM garment_photos g JOIN orders o ON o.id = g.order_id WHERE o.customer_id = p_customer_id
--     UNION ALL
--     SELECT unnest(cl.photo_urls) FROM claims cl WHERE cl.customer_id = p_customer_id
--   ) urls WHERE url IS NOT NULL AND url <> '';
--
--   DELETE FROM garment_photos g USING orders o WHERE o.id = g.order_id AND o.customer_id = p_customer_id;
--   UPDATE claims SET description = '[removed at customer request]', photo_urls = '{}', updated_at = now()
--   WHERE customer_id = p_customer_id;
--   DELETE FROM conversations WHERE customer_id = p_customer_id;
--   DELETE FROM messages WHERE customer_id = p_customer_id;
--   DELETE FROM customer_preferences WHERE customer_id = p_customer_id;
--
--   -- City, state and ZIP stay: they decide which tax and zone applied to past orders
--   UPDATE addresses SET street = '[removed]', unit = NULL, delivery_notes = NULL, lat = NULL, lng = NULL
--   WHERE customer_id = p_customer_id;
--
--   -- Orders and their amounts stay for tax records; the card link and free-text notes go
--   UPDATE orders SET notes = NULL, square_customer_id = NULL, square_card_id = NULL, updated_at = now()
--   WHERE customer_id = p_customer_id;
--   GET DIAGNOSTICS v_orders = ROW_COUNT;
--
--   UPDATE customers SET
--     full_name = 'Deleted customer',
--     email = 'deleted-' || id::TEXT || '@deleted.invalid',
--     phone = NULL,
--     auth_id = NULL,
--     sms_consent = false,
--     sms_promotions_consent = false,
--     sms_consent_at = NULL,
--     square_customer_id = NULL,
--     updated_at = now()
--   WHERE id = p_customer_id;
--
--   INSERT INTO admin_audit_logs (admin_id, admin_email, action, target_type, target_id, details)
--   VALUES (NULL, 'database: anonymize_customer', 'customer_anonymized', 'customer', p_customer_id::TEXT,
--           jsonb_build_object('request_id', p_request_id, 'orders_kept', v_orders, 'photo_files', cardinality(v_photos)));
--
--   RETURN jsonb_build_object(
--     'customer_id', p_customer_id,
--     'orders_kept', v_orders,
--     'delete_login_user_id', v_customer.auth_id,
--     'delete_square_customer_id', v_customer.square_customer_id,
--     'delete_photo_files', to_jsonb(v_photos)
--   );
-- END;
-- $function$;
-- COMMIT;
-- ============================================================================
