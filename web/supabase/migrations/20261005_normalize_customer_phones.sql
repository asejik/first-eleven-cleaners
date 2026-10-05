-- ============================================================================
-- MIGRATION: 20261005_normalize_customer_phones.sql
-- DESCRIPTION: Store customer phone numbers in E.164 ("+12145550100") (P03 PR-18).
--              Twilio needs E.164 and STOP/START replies are matched on it.
--              1. normalize_phone_e164(): same rules as src/lib/phone.ts
--                 (10 digits / 11 starting with 1 = US; "+" keeps its country code)
--              2. Trigger: every insert/update of customers.phone is normalized
--                 (covers the signup trigger, the browser and the server)
--              3. Backfill existing rows (originals saved to a backup table)
--              4. Index on customers(phone) for STOP/START lookups
-- TYPE: ADDITIVE + DATA UPDATE (phone formats only; unparseable values are left as-is)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.normalize_phone_e164(raw TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $function$
DECLARE
  digits TEXT := regexp_replace(coalesce(raw, ''), '\D', '', 'g');
BEGIN
  IF btrim(coalesce(raw, '')) LIKE '+%' THEN
    IF digits LIKE '1%' THEN
      RETURN CASE WHEN length(digits) = 11 THEN '+' || digits END;
    END IF;
    RETURN CASE WHEN length(digits) BETWEEN 8 AND 15 THEN '+' || digits END;
  END IF;
  IF length(digits) = 10 THEN RETURN '+1' || digits; END IF;
  IF length(digits) = 11 AND digits LIKE '1%' THEN RETURN '+' || digits; END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.customers_normalize_phone()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  NEW.phone := coalesce(public.normalize_phone_e164(NEW.phone), NEW.phone);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS customers_normalize_phone ON customers;
CREATE TRIGGER customers_normalize_phone
  BEFORE INSERT OR UPDATE OF phone ON customers
  FOR EACH ROW EXECUTE FUNCTION public.customers_normalize_phone();

REVOKE EXECUTE ON FUNCTION public.customers_normalize_phone() FROM PUBLIC, anon, authenticated;

-- Backfill, keeping the original values for rollback
CREATE TABLE IF NOT EXISTS customers_phone_backup_20261005 AS
  SELECT id, phone FROM customers WHERE false;
ALTER TABLE customers_phone_backup_20261005 ENABLE ROW LEVEL SECURITY; -- server-only
INSERT INTO customers_phone_backup_20261005 (id, phone)
  SELECT id, phone FROM customers
  WHERE public.normalize_phone_e164(phone) IS NOT NULL
    AND phone IS DISTINCT FROM public.normalize_phone_e164(phone);

UPDATE customers
SET phone = public.normalize_phone_e164(phone)
WHERE public.normalize_phone_e164(phone) IS NOT NULL
  AND phone IS DISTINCT FROM public.normalize_phone_e164(phone);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- ============================================================================
-- ROLLBACK SCRIPT:
-- DROP TRIGGER IF EXISTS customers_normalize_phone ON customers;
-- DROP FUNCTION IF EXISTS public.customers_normalize_phone();
-- DROP FUNCTION IF EXISTS public.normalize_phone_e164(TEXT);
-- DROP INDEX IF EXISTS idx_customers_phone;
-- UPDATE customers c SET phone = b.phone FROM customers_phone_backup_20261005 b WHERE b.id = c.id;
-- DROP TABLE IF EXISTS customers_phone_backup_20261005;
-- ============================================================================
