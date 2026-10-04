-- ============================================================================
-- MIGRATION: 20261004_reserve_promo_use.sql
-- DESCRIPTION: Atomic promo-code reservation (SEC-15). Booking previously read
--              current_uses, then wrote current_uses + 1 later, so simultaneous
--              bookings could exceed max_uses. This function checks and
--              increments in one statement and returns true only if a use was
--              reserved. Server-only (service role); not callable by browsers.
-- TYPE: ADDITIVE (new function)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reserve_promo_use(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH reserved AS (
    UPDATE promo_codes
    SET current_uses = current_uses + 1
    WHERE code = p_code
      AND is_active = true
      AND (max_uses IS NULL OR current_uses < max_uses)
      AND (valid_from IS NULL OR valid_from <= NOW())
      AND (valid_until IS NULL OR valid_until >= NOW())
    RETURNING id
  )
  SELECT EXISTS (SELECT 1 FROM reserved);
$function$;

REVOKE EXECUTE ON FUNCTION public.reserve_promo_use(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_promo_use(TEXT) TO service_role;

-- ============================================================================
-- ROLLBACK SCRIPT:
-- DROP FUNCTION IF EXISTS public.reserve_promo_use(TEXT);
-- ============================================================================
