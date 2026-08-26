-- =================================================================
-- FIRST ELEVEN CLEANERS — DATABASE SEED DATA
-- =================================================================

-- 1. SEED ZONES (Dallas-Fort Worth Metroplex)
INSERT INTO zones (id, name, service_days, is_active) VALUES
  ('11111111-1111-1111-1111-111111111101', 'North Dallas Corridor (Preston / Addison / Galleria)', '{"Monday", "Wednesday", "Friday"}', true),
  ('11111111-1111-1111-1111-111111111102', 'Farmers Branch & Carrollton (Hub Zone)', '{"Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"}', true),
  ('11111111-1111-1111-1111-111111111103', 'Plano & Frisco', '{"Tuesday", "Thursday", "Saturday"}', true),
  ('11111111-1111-1111-1111-111111111104', 'Uptown, Downtown & Highland Park', '{"Monday", "Wednesday", "Friday"}', true),
  ('11111111-1111-1111-1111-111111111105', 'Irving & Las Colinas', '{"Tuesday", "Thursday", "Saturday"}', true),
  ('11111111-1111-1111-1111-111111111106', 'Fort Worth & Arlington Metro', '{"Wednesday", "Saturday"}', true)
ON CONFLICT (id) DO NOTHING;

-- 2. SEED PROMO CODES
INSERT INTO promo_codes (code, discount_type, discount_value, max_uses, is_active) VALUES
  ('KICKOFF15', 'percentage', 15.00, 10000, true),
  ('MATCHREADY', 'percentage', 10.00, 5000, true),
  ('WELCOME5', 'fixed', 5.00, 2000, true)
ON CONFLICT (code) DO NOTHING;

-- 3. SEED INITIAL TIME SLOTS (Current & Upcoming Days)
DO $$
DECLARE
  curr_date DATE := CURRENT_DATE;
  end_date DATE := CURRENT_DATE + INTERVAL '14 days';
  z_record RECORD;
BEGIN
  WHILE curr_date <= end_date LOOP
    -- Skip Sundays (plant is dark)
    IF EXTRACT(DOW FROM curr_date) != 0 THEN
      FOR z_record IN SELECT id, service_days FROM zones WHERE is_active = true LOOP
        -- Check if day matches zone schedule
        IF TO_CHAR(curr_date, 'Day') LIKE ANY(SELECT '%' || TRIM(day) || '%' FROM unnest(z_record.service_days) AS day) THEN
          -- Morning slot
          INSERT INTO time_slots (date, "window", capacity, booked_count, is_available, zone_id)
          VALUES (curr_date, 'morning', 25, 0, true, z_record.id)
          ON CONFLICT (date, "window", zone_id) DO NOTHING;

          -- Evening slot
          INSERT INTO time_slots (date, "window", capacity, booked_count, is_available, zone_id)
          VALUES (curr_date, 'evening', 25, 0, true, z_record.id)
          ON CONFLICT (date, "window", zone_id) DO NOTHING;
        END IF;
      END LOOP;
    END IF;
    curr_date := curr_date + INTERVAL '1 day';
  END LOOP;
END $$;
