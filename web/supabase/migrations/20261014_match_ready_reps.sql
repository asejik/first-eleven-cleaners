-- ============================================================================
-- MIGRATION: 20261014_match_ready_reps.sql
-- DESCRIPTION: Growth Engine batch 1 (client 2026-10-14).
--              1. Match-Ready Check: a new order stage 'match_ready_check' between
--                 'in_cleaning' and 'out_for_delivery'; match_ready_checks (one row per
--                 ticked item, 1-11); the owner's logged override on orders; two photo
--                 types ('pocket_item', 'stain'). Orders already weighed when this runs
--                 are marked exempt from items 1-5 (nobody ticked them at intake).
--              2. Plant ticket number on orders.
--              3. Rep codes: reps (TERRITORY-WAVE-REP, e.g. 1D-W1-JM, switched off with
--                 active = false); the code stamped on the customer (first one stays)
--                 and on the order.
-- ============================================================================

BEGIN;

-- 1. Match-Ready Check (the stage check was written inline, so drop it by what it says)
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%in_cleaning%'
  LOOP
    EXECUTE format('ALTER TABLE orders DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
  status IN ('booked', 'picked_up', 'weighed_itemized', 'in_cleaning', 'match_ready_check', 'out_for_delivery', 'delivered', 'cancelled')
);

CREATE TABLE IF NOT EXISTS match_ready_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item SMALLINT NOT NULL CHECK (item BETWEEN 1 AND 11),
  note TEXT,
  done_by VARCHAR(255),
  done_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, item)
);
ALTER TABLE match_ready_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON match_ready_checks FROM anon, authenticated;
GRANT ALL ON match_ready_checks TO service_role;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS match_ready_intake_exempt BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS match_ready_override_reason TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS match_ready_override_by VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS match_ready_override_at TIMESTAMPTZ;
UPDATE orders SET match_ready_intake_exempt = true WHERE status IN ('weighed_itemized', 'in_cleaning');

ALTER TABLE garment_photos DROP CONSTRAINT IF EXISTS garment_photos_photo_type_check;
ALTER TABLE garment_photos ADD CONSTRAINT garment_photos_photo_type_check CHECK (
  photo_type IN ('intake', 'return', 'delivery_proof', 'pickup_proof', 'customer_reference', 'no_show_proof', 'pocket_item', 'stain')
);

-- 2. Plant ticket number
ALTER TABLE orders ADD COLUMN IF NOT EXISTS plant_ticket_number VARCHAR(40);

-- 3. Rep codes
CREATE TABLE IF NOT EXISTS reps (
  code VARCHAR(20) PRIMARY KEY CHECK (code ~ '^[0-9A-Z]{1,4}-W[0-9]{1,3}-[A-Z]{2,4}$'),
  territory_id VARCHAR(10) NOT NULL REFERENCES territories(id) ON UPDATE CASCADE,
  rep_name VARCHAR(120) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at TIMESTAMPTZ
);
ALTER TABLE reps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON reps FROM anon, authenticated;
GRANT ALL ON reps TO service_role;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS rep_code VARCHAR(20) REFERENCES reps(code) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS rep_code_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rep_code VARCHAR(20) REFERENCES reps(code) ON UPDATE CASCADE ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_customers_rep_code ON customers(rep_code) WHERE rep_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_rep_code ON orders(rep_code) WHERE rep_code IS NOT NULL;

COMMIT;

-- ============================================================================
-- VERIFY (read-only):
-- select
--   (select count(*) from information_schema.tables where table_schema = 'public'
--      and table_name in ('match_ready_checks', 'reps')) as new_tables,
--   (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'orders'
--      and column_name in ('match_ready_intake_exempt', 'match_ready_override_reason', 'match_ready_override_by',
--                          'match_ready_override_at', 'plant_ticket_number', 'rep_code')) as order_columns,
--   (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'customers'
--      and column_name in ('rep_code', 'rep_code_at')) as customer_columns,
--   (select count(*) from pg_constraint where conname = 'orders_status_check'
--      and pg_get_constraintdef(oid) like '%match_ready_check%') as new_stage
-- limit 1;
-- Expected: 2, 6, 2, 1
-- ============================================================================
-- ROLLBACK SCRIPT (run as one block; orders in the check stage go back to In Cleaning):
-- BEGIN;
-- UPDATE orders SET status = 'in_cleaning' WHERE status = 'match_ready_check';
-- ALTER TABLE orders DROP COLUMN IF EXISTS rep_code;
-- ALTER TABLE customers DROP COLUMN IF EXISTS rep_code_at;
-- ALTER TABLE customers DROP COLUMN IF EXISTS rep_code;
-- DROP TABLE IF EXISTS reps;
-- ALTER TABLE orders DROP COLUMN IF EXISTS plant_ticket_number;
-- DELETE FROM garment_photos WHERE photo_type IN ('pocket_item', 'stain');
-- ALTER TABLE garment_photos DROP CONSTRAINT IF EXISTS garment_photos_photo_type_check;
-- ALTER TABLE garment_photos ADD CONSTRAINT garment_photos_photo_type_check CHECK (
--   photo_type IN ('intake', 'return', 'delivery_proof', 'pickup_proof', 'customer_reference', 'no_show_proof'));
-- ALTER TABLE orders DROP COLUMN IF EXISTS match_ready_override_at;
-- ALTER TABLE orders DROP COLUMN IF EXISTS match_ready_override_by;
-- ALTER TABLE orders DROP COLUMN IF EXISTS match_ready_override_reason;
-- ALTER TABLE orders DROP COLUMN IF EXISTS match_ready_intake_exempt;
-- DROP TABLE IF EXISTS match_ready_checks;
-- ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
-- ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
--   status IN ('booked', 'picked_up', 'weighed_itemized', 'in_cleaning', 'out_for_delivery', 'delivered', 'cancelled'));
-- COMMIT;
-- ============================================================================
