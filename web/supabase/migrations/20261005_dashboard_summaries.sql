-- ============================================================================
-- MIGRATION: 20261005_dashboard_summaries.sql
-- DESCRIPTION: SQL aggregates for Mission Control and the Financials ledger
--              (P03 PR-14). The dashboards used to download every order (and its
--              items, events and photos) every 15-25 seconds and add them up in
--              the app; past the API's 1,000-row limit the totals were silently
--              wrong. Days are Dallas (America/Chicago) calendar days.
--              Server-only: callable by the service role, not by browsers.
-- TYPE: ADDITIVE (two read-only functions + one index; no data changes)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

CREATE OR REPLACE FUNCTION public.mission_control_summary(p_today DATE)
RETURNS JSON
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $function$
  SELECT json_build_object(
    'active_count', (SELECT count(*) FROM orders WHERE status NOT IN ('delivered', 'cancelled')),
    'total_count', (SELECT count(*) FROM orders),
    'today_sales', (
      SELECT coalesce(sum(total), 0) FROM orders
      WHERE status <> 'cancelled'
        AND ((created_at AT TIME ZONE 'America/Chicago')::date = p_today OR pickup_date = p_today)
    ),
    'active_lbs', (SELECT coalesce(sum(weight_lbs), 0) FROM orders WHERE status NOT IN ('delivered', 'cancelled')),
    'active_pieces', (
      SELECT coalesce(sum(oi.quantity), 0)
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.status NOT IN ('delivered', 'cancelled') AND oi.service_type = 'dry_clean'
    ),
    'net_revenue', (
      SELECT coalesce(sum(total - refunded_amount), 0) FROM orders WHERE payment_status IN ('charged', 'refunded')
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.order_financial_summary(p_from DATE, p_to DATE)
RETURNS JSON
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $function$
  WITH o AS (
    SELECT *, payment_status IN ('charged', 'refunded') AS collected
    FROM orders
    WHERE (created_at AT TIME ZONE 'America/Chicago')::date BETWEEN p_from AND p_to
  )
  SELECT json_build_object(
    'gross_revenue', coalesce(sum(total) FILTER (WHERE collected), 0),
    'refunded_total', coalesce(sum(refunded_amount) FILTER (WHERE collected), 0),
    'net_revenue', coalesce(sum(total - refunded_amount) FILTER (WHERE collected), 0),
    'sales_tax_collected', coalesce(sum(sales_tax) FILTER (WHERE collected), 0),
    'environmental_fees_collected', coalesce(sum(environmental_fee) FILTER (WHERE collected), 0),
    'in_vault', coalesce(sum(total) FILTER (WHERE payment_status IN ('authorized', 'pending') AND status <> 'cancelled'), 0),
    'charged_count', count(*) FILTER (WHERE payment_status = 'charged'),
    'authorized_count', count(*) FILTER (WHERE payment_status IN ('authorized', 'pending') AND status <> 'cancelled'),
    'failed_count', count(*) FILTER (WHERE payment_status = 'failed'),
    'refunded_count', count(*) FILTER (WHERE payment_status = 'refunded'),
    'total_transactions', count(*),
    'aov', CASE WHEN count(*) FILTER (WHERE collected) > 0
                THEN round(sum(total) FILTER (WHERE collected) / count(*) FILTER (WHERE collected), 2)
                ELSE 0 END
  )
  FROM o;
$function$;

REVOKE EXECUTE ON FUNCTION public.mission_control_summary(DATE) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.order_financial_summary(DATE, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mission_control_summary(DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.order_financial_summary(DATE, DATE) TO service_role;

-- ============================================================================
-- ROLLBACK SCRIPT:
-- DROP FUNCTION IF EXISTS public.order_financial_summary(DATE, DATE);
-- DROP FUNCTION IF EXISTS public.mission_control_summary(DATE);
-- DROP INDEX IF EXISTS idx_orders_created_at;
-- ============================================================================
