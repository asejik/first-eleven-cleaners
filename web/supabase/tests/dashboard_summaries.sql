-- ============================================================================
-- Check for order_financial_summary() and mission_control_summary() (P03 PR-14/15).
-- Run against a DEV database (never production): it inserts sample rows inside a
-- transaction and rolls everything back. Raises an exception if a total is wrong.
-- ============================================================================
BEGIN;
INSERT INTO customers (id, email, full_name) VALUES ('00000000-0000-0000-0000-0000000000c1', 'summary-check@example.com', 'Summary Check');
INSERT INTO orders (order_number, customer_id, status, pickup_date, pickup_window, total, refunded_amount, payment_status, sales_tax, environmental_fee, weight_lbs, created_at) VALUES
  ('CHK-A', '00000000-0000-0000-0000-0000000000c1', 'delivered', '2026-09-10', 'morning', 100, 0,  'charged',    7.89, 2.83, NULL, '2026-09-10T15:00:00Z'),
  ('CHK-B', '00000000-0000-0000-0000-0000000000c1', 'delivered', '2026-09-10', 'morning', 50,  20, 'charged',    7.89, 2.83, NULL, '2026-09-10T15:00:00Z'),
  ('CHK-C', '00000000-0000-0000-0000-0000000000c1', 'delivered', '2026-09-10', 'morning', 40,  40, 'refunded',   7.89, 2.83, NULL, '2026-09-10T15:00:00Z'),
  ('CHK-D', '00000000-0000-0000-0000-0000000000c1', 'booked',    '2026-10-06', 'morning', 75,  0,  'authorized', NULL, NULL, 20,   '2026-09-10T15:00:00Z'),
  ('CHK-E', '00000000-0000-0000-0000-0000000000c1', 'cancelled', '2026-10-06', 'morning', 60,  0,  'authorized', NULL, NULL, NULL, '2026-09-10T15:00:00Z'),
  -- 11 PM Dallas on 30 Sept is 04:00 UTC on 1 Oct: it belongs to September
  ('CHK-F', '00000000-0000-0000-0000-0000000000c1', 'delivered', '2026-09-30', 'evening', 10,  0,  'charged',    0.80, 0.30, NULL, '2026-10-01T04:00:00Z');

DO $$
DECLARE s JSON := order_financial_summary('2026-09-01', '2026-09-30');
BEGIN
  IF (s->>'gross_revenue')::numeric <> 200 OR (s->>'refunded_total')::numeric <> 60 OR (s->>'net_revenue')::numeric <> 140
     OR (s->>'in_vault')::numeric <> 75 OR (s->>'sales_tax_collected')::numeric <> 24.47 THEN
    RAISE EXCEPTION 'order_financial_summary wrong: %', s;
  END IF;
  IF (order_financial_summary('2026-10-01', '2026-10-31')->>'gross_revenue')::numeric <> 0 THEN
    RAISE EXCEPTION 'Dallas day boundary wrong';
  END IF;
  IF (mission_control_summary('2026-09-30')->>'today_sales')::numeric < 10 THEN
    RAISE EXCEPTION 'mission_control_summary today_sales wrong: %', mission_control_summary('2026-09-30');
  END IF;
  RAISE NOTICE 'dashboard summaries OK';
END $$;
ROLLBACK;
