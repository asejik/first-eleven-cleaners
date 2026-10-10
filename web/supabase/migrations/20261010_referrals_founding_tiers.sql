-- ============================================================================
-- MIGRATION: 20261010_referrals_founding_tiers.sql
-- DESCRIPTION: The client's answers of 2026-10-10 (one migration for all of them).
--              1. No-show fee: orders.late_cancel_reason ('late_cancel' | 'no_show');
--                 garment_photos.photo_type gains 'no_show_proof'.
--              2. Referrals (Give $15 / Get $15) and account credit: referral_codes
--                 (one code per customer), referrals (one per new customer),
--                 customer_credits (a ledger: + granted, - used), and on orders the
--                 referral code used, its discount and the credit applied.
--              3. Territories (the client's named ZIP groups, seeded from
--                 First_Eleven_Territories_by_ZIP.csv) and Founding 111:
--                 founding_members (number 1-111 per territory, the locked discount
--                 rates) and claim_founding_number(), which hands out numbers safely.
--              4. Tier-down: zip_tier_steps, the history of approved steps (the live
--                 per-ZIP minimums are in the coverage settings).
-- TYPE: ADDITIVE (new tables, new nullable/defaulted columns, two CHECKs widened,
--       one new function, seed rows)
-- BEFORE RUNNING: nothing to back up.
-- ============================================================================
BEGIN;

-- 1. No-show fee
ALTER TABLE orders ADD COLUMN IF NOT EXISTS late_cancel_reason VARCHAR(20);
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_late_cancel_reason_check;
ALTER TABLE orders ADD CONSTRAINT orders_late_cancel_reason_check
  CHECK (late_cancel_reason IS NULL OR late_cancel_reason IN ('late_cancel', 'no_show'));
ALTER TABLE garment_photos DROP CONSTRAINT IF EXISTS garment_photos_photo_type_check;
ALTER TABLE garment_photos ADD CONSTRAINT garment_photos_photo_type_check CHECK (
  photo_type IN ('intake', 'return', 'delivery_proof', 'pickup_proof', 'customer_reference', 'no_show_proof')
);

-- 2. Referrals and account credit
CREATE TABLE IF NOT EXISTS referral_codes (
  customer_id UUID PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  code VARCHAR(20) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON referral_codes FROM anon, authenticated;
GRANT ALL ON referral_codes TO service_role;

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  referred_customer_id UUID NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
  referred_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  code VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'rewarded', 'void')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rewarded_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_customer_id);
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON referrals FROM anon, authenticated;
GRANT ALL ON referrals TO service_role;

CREATE TABLE IF NOT EXISTS customer_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount <> 0),
  reason VARCHAR(30) NOT NULL CHECK (reason IN ('referral_reward', 'make_it_right', 'used', 'adjustment')),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  referral_id UUID REFERENCES referrals(id) ON DELETE SET NULL,
  note TEXT,
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_credits_customer ON customer_credits(customer_id, created_at DESC);
-- A reward is granted once per referral, and credit is used once per order
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_credits_one_reward ON customer_credits(referral_id) WHERE reason = 'referral_reward';
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_credits_one_use ON customer_credits(order_id) WHERE reason = 'used';
ALTER TABLE customer_credits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON customer_credits FROM anon, authenticated;
GRANT ALL ON customer_credits TO service_role;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS referral_discount NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS credit_applied NUMERIC(10, 2) NOT NULL DEFAULT 0;

-- 3. Territories and Founding 111
CREATE TABLE IF NOT EXISTS territories (
  id VARCHAR(10) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  zone_id VARCHAR(10) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS territory_zips (
  zip VARCHAR(5) PRIMARY KEY,
  territory_id VARCHAR(10) NOT NULL REFERENCES territories(id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_territory_zips_territory ON territory_zips(territory_id);
ALTER TABLE territories ENABLE ROW LEVEL SECURITY;
ALTER TABLE territory_zips ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON territories, territory_zips FROM anon, authenticated;
GRANT ALL ON territories, territory_zips TO service_role;

CREATE TABLE IF NOT EXISTS founding_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  territory_id VARCHAR(10) NOT NULL REFERENCES territories(id) ON UPDATE CASCADE,
  number INT NOT NULL CHECK (number BETWEEN 1 AND 111),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  membership_id UUID REFERENCES routine_memberships(id) ON DELETE SET NULL,
  -- Lifetime pricing: the plan discount rates on the day they joined
  locked_weekly_percent INT NOT NULL,
  locked_biweekly_percent INT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Set when the membership is cancelled; they have 60 days to come back
  ended_at TIMESTAMPTZ,
  UNIQUE (territory_id, number)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_founding_one_per_customer ON founding_members(customer_id);
ALTER TABLE founding_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON founding_members FROM anon, authenticated;
GRANT ALL ON founding_members TO service_role;

-- The next founder number in a territory (1-111), one at a time. A founder keeps their
-- number (and locked rates) while their membership is open or paused, and gets it back if
-- they rejoin within 60 days of cancelling; after that, founder status is gone for good.
-- Returns the number, or NULL (no founder status: the 111 are taken, or it lapsed).
CREATE OR REPLACE FUNCTION public.claim_founding_number(
  p_territory VARCHAR, p_customer UUID, p_membership UUID, p_weekly INT, p_biweekly INT
)
RETURNS INT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_number INT;
  v_ended TIMESTAMPTZ;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('f11_founding_' || p_territory));
  SELECT number, ended_at INTO v_number, v_ended FROM founding_members WHERE customer_id = p_customer;
  IF FOUND THEN
    IF v_ended IS NULL OR v_ended > NOW() - INTERVAL '60 days' THEN
      UPDATE founding_members SET ended_at = NULL, membership_id = p_membership WHERE customer_id = p_customer;
      RETURN v_number;
    END IF;
    RETURN NULL;
  END IF;
  SELECT count(*) + 1 INTO v_number FROM founding_members WHERE territory_id = p_territory;
  IF v_number > 111 THEN
    RETURN NULL;
  END IF;
  INSERT INTO founding_members (territory_id, number, customer_id, membership_id, locked_weekly_percent, locked_biweekly_percent)
  VALUES (p_territory, v_number, p_customer, p_membership, p_weekly, p_biweekly);
  RETURN v_number;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.claim_founding_number(VARCHAR, UUID, UUID, INT, INT) FROM PUBLIC, anon, authenticated;

-- The client's starting list (Mission Control edits it from here)
INSERT INTO territories (id, name, zone_id) VALUES
  ('1A', 'Home Turf — Farmers Branch · Addison · Carrollton', 'zone_1'),
  ('1B', 'North Dallas — Prestonwood · Far North Dallas', 'zone_1'),
  ('1C', 'Park Cities & Preston Hollow', 'zone_1'),
  ('1D', 'Plano', 'zone_1'),
  ('1E', 'Frisco', 'zone_1'),
  ('1F', 'Richardson', 'zone_1'),
  ('1G', 'Lewisville · The Colony', 'zone_1'),
  ('1H', 'Flower Mound · Coppell', 'zone_1'),
  ('2', 'Dallas Central & Mid-Cities', 'zone_2'),
  ('3', 'Outer Ring', 'zone_3'),
  ('4', 'Far Metroplex', 'zone_4'),
  ('5A', 'Burleson', 'zone_5'),
  ('5B', 'Waxahachie', 'zone_5'),
  ('5C', 'Greenville', 'zone_5'),
  ('5D', 'Sherman', 'zone_5'),
  ('5E', 'Denison', 'zone_5'),
  ('5F', 'Weatherford', 'zone_5'),
  ('5G', 'Corsicana', 'zone_5'),
  ('5H', 'Gainesville', 'zone_5')
ON CONFLICT (id) DO NOTHING;

INSERT INTO territory_zips (zip, territory_id) VALUES
  ('75001', '1A'),
  ('75006', '1A'),
  ('75007', '1A'),
  ('75010', '1A'),
  ('75234', '1A'),
  ('75244', '1A'),
  ('75287', '1A'),
  ('75230', '1B'),
  ('75240', '1B'),
  ('75248', '1B'),
  ('75251', '1B'),
  ('75252', '1B'),
  ('75254', '1B'),
  ('75205', '1C'),
  ('75220', '1C'),
  ('75225', '1C'),
  ('75229', '1C'),
  ('75023', '1D'),
  ('75024', '1D'),
  ('75025', '1D'),
  ('75074', '1D'),
  ('75075', '1D'),
  ('75093', '1D'),
  ('75094', '1D'),
  ('75033', '1E'),
  ('75034', '1E'),
  ('75035', '1E'),
  ('75036', '1E'),
  ('75080', '1F'),
  ('75081', '1F'),
  ('75082', '1F'),
  ('75056', '1G'),
  ('75057', '1G'),
  ('75067', '1G'),
  ('75077', '1G'),
  ('75019', '1H'),
  ('75022', '1H'),
  ('75028', '1H'),
  ('75002', '2'),
  ('75013', '2'),
  ('75038', '2'),
  ('75039', '2'),
  ('75060', '2'),
  ('75061', '2'),
  ('75062', '2'),
  ('75063', '2'),
  ('75069', '2'),
  ('75070', '2'),
  ('75071', '2'),
  ('75072', '2'),
  ('75078', '2'),
  ('75201', '2'),
  ('75202', '2'),
  ('75204', '2'),
  ('75206', '2'),
  ('75207', '2'),
  ('75208', '2'),
  ('75214', '2'),
  ('75218', '2'),
  ('75219', '2'),
  ('75223', '2'),
  ('75226', '2'),
  ('75270', '2'),
  ('76034', '2'),
  ('76039', '2'),
  ('76040', '2'),
  ('76051', '2'),
  ('76092', '2'),
  ('75032', '3'),
  ('75050', '3'),
  ('75051', '3'),
  ('75052', '3'),
  ('75054', '3'),
  ('75087', '3'),
  ('75126', '3'),
  ('76006', '3'),
  ('76010', '3'),
  ('76011', '3'),
  ('76012', '3'),
  ('76013', '3'),
  ('76014', '3'),
  ('76015', '3'),
  ('76016', '3'),
  ('76017', '3'),
  ('76018', '3'),
  ('76021', '3'),
  ('76022', '3'),
  ('76053', '3'),
  ('76054', '3'),
  ('76201', '3'),
  ('76205', '3'),
  ('76207', '3'),
  ('76208', '3'),
  ('76209', '3'),
  ('76210', '3'),
  ('76244', '3'),
  ('76248', '3'),
  ('76262', '3'),
  ('76063', '4'),
  ('76102', '4'),
  ('76104', '4'),
  ('76107', '4'),
  ('76028', '5A'),
  ('75165', '5B'),
  ('75167', '5B'),
  ('75401', '5C'),
  ('75402', '5C'),
  ('75090', '5D'),
  ('75092', '5D'),
  ('75020', '5E'),
  ('75021', '5E'),
  ('76086', '5F'),
  ('76087', '5F'),
  ('76088', '5F'),
  ('75109', '5G'),
  ('75110', '5G'),
  ('76240', '5H')
ON CONFLICT (zip) DO NOTHING;

-- 4. Tier-down history
CREATE TABLE IF NOT EXISTS zip_tier_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zip VARCHAR(5) NOT NULL,
  action VARCHAR(20) NOT NULL CHECK (action IN ('tier_down', 'promote_zone_4')),
  from_minimum NUMERIC(10, 2),
  to_minimum NUMERIC(10, 2),
  orders_counted INT,
  approved_by VARCHAR(255),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_zip_tier_steps_zip ON zip_tier_steps(zip, approved_at DESC);
ALTER TABLE zip_tier_steps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON zip_tier_steps FROM anon, authenticated;
GRANT ALL ON zip_tier_steps TO service_role;

COMMIT;

-- ============================================================================
-- VERIFY (read-only):
-- select
--   (select count(*) from information_schema.tables where table_schema = 'public'
--      and table_name in ('referral_codes', 'referrals', 'customer_credits', 'territories', 'territory_zips', 'founding_members', 'zip_tier_steps')) as new_tables,
--   (select count(*) from territories) as territories,
--   (select count(*) from territory_zips) as territory_zips,
--   (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'orders'
--      and column_name in ('late_cancel_reason', 'referral_code', 'referral_discount', 'credit_applied')) as order_columns,
--   (select count(*) from pg_proc where proname = 'claim_founding_number') as founding_function
-- limit 1;
-- Expected: 7, 19, 117, 4, 1
-- ============================================================================
-- ROLLBACK SCRIPT (run as one block):
-- BEGIN;
-- DROP TABLE IF EXISTS zip_tier_steps;
-- DROP FUNCTION IF EXISTS public.claim_founding_number(VARCHAR, UUID, UUID, INT, INT);
-- DROP TABLE IF EXISTS founding_members;
-- DROP TABLE IF EXISTS territory_zips;
-- DROP TABLE IF EXISTS territories;
-- ALTER TABLE orders DROP COLUMN IF EXISTS credit_applied;
-- ALTER TABLE orders DROP COLUMN IF EXISTS referral_discount;
-- ALTER TABLE orders DROP COLUMN IF EXISTS referral_code;
-- DROP TABLE IF EXISTS customer_credits;
-- DROP TABLE IF EXISTS referrals;
-- DROP TABLE IF EXISTS referral_codes;
-- ALTER TABLE garment_photos DROP CONSTRAINT IF EXISTS garment_photos_photo_type_check;
-- ALTER TABLE garment_photos ADD CONSTRAINT garment_photos_photo_type_check CHECK (
--   photo_type IN ('intake', 'return', 'delivery_proof', 'pickup_proof', 'customer_reference'));
-- ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_late_cancel_reason_check;
-- ALTER TABLE orders DROP COLUMN IF EXISTS late_cancel_reason;
-- COMMIT;
-- ============================================================================
