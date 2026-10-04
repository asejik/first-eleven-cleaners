-- ============================================================================
-- MIGRATION: 20261004_role_based_staff_access.sql
-- DESCRIPTION: Roles come only from customers.role, and accounts are linked
--              to existing guest records only after email verification
--              (SEC-02, SEC-03):
--              1. Allow the driver and intake_staff roles in customers.role
--              2. Convert existing 'staff' rows to their real role, using the
--                 role an admin stored at creation (driver/intake_staff only)
--              3. handle_new_user: link an existing guest record at signup only
--                 if the email is already confirmed
--              4. New trigger: link the guest record when the email is confirmed
--              5. Pin search_path and revoke RPC access on both functions (SEC-17)
-- TYPE: ADDITIVE + DATA UPDATE (staff rows only). Requires Confirm email ON.
-- ============================================================================

-- 1. Allowed roles
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_role_check;
ALTER TABLE customers ADD CONSTRAINT customers_role_check
  CHECK (role IN ('customer', 'staff', 'admin', 'driver', 'intake_staff'));

-- 2. Convert existing staff rows (never grants admin)
UPDATE customers c
SET role = u.raw_user_meta_data->>'role',
    updated_at = NOW()
FROM auth.users u
WHERE u.id = c.auth_id
  AND c.role = 'staff'
  AND u.raw_user_meta_data->>'role' IN ('driver', 'intake_staff');

-- 3. Signup: create the customer row; link an existing guest row only if confirmed
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

-- 4. Email confirmed: link the oldest unlinked guest record with that email
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

-- 5. Trigger functions must not be callable via /rest/v1/rpc
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_customer_on_email_confirm() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- ROLLBACK SCRIPT:
-- DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;
-- DROP FUNCTION IF EXISTS public.link_customer_on_email_confirm();
-- CREATE OR REPLACE FUNCTION public.handle_new_user()
-- RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
-- DECLARE new_cust_id UUID;
-- BEGIN
--   INSERT INTO public.customers (auth_id, email, full_name, phone)
--   VALUES (NEW.id, NEW.email,
--     COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
--     COALESCE(NEW.raw_user_meta_data->>'phone', ''))
--   ON CONFLICT (email) DO UPDATE SET auth_id = EXCLUDED.auth_id
--   RETURNING id INTO new_cust_id;
--   IF new_cust_id IS NOT NULL THEN
--     INSERT INTO public.customer_preferences (customer_id) VALUES (new_cust_id)
--     ON CONFLICT (customer_id) DO NOTHING;
--   END IF;
--   RETURN NEW;
-- END; $function$;
-- ALTER FUNCTION public.handle_new_user() RESET search_path;
-- GRANT EXECUTE ON FUNCTION public.handle_new_user() TO PUBLIC, anon, authenticated;
-- UPDATE customers SET role = 'staff' WHERE role IN ('driver', 'intake_staff');
-- ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_role_check;
-- ALTER TABLE customers ADD CONSTRAINT customers_role_check
--   CHECK (role IN ('customer', 'staff', 'admin'));
-- ============================================================================
