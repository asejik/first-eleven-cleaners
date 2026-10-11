-- ============================================================================
-- MIGRATION: 20261011_territory_zips_and_zone_lists.sql
-- DESCRIPTION: The client's ZIP answers of 2026-10-11 (data only, no schema change).
--              1. Nine served ZIPs that were in no territory: 75209 -> 1C,
--                 75243 -> 1F, 75235 -> 2, 76202/76203/76204 -> 3,
--                 76109/76110/76116 -> 4.
--              2. Four ZIPs from his file join the zone lists (75223 and 75270 to
--                 Zone 2, 75054 and 76014 to Zone 3). constants.ts holds the default
--                 lists; when Mission Control has saved its own ZIP table (app_settings
--                 'coverage'.zipZones), that table is the live one, so they are added
--                 there too. A ZIP the saved table already has keeps its zone.
-- ============================================================================

BEGIN;

INSERT INTO territory_zips (zip, territory_id) VALUES
  ('75209', '1C'),
  ('75243', '1F'),
  ('75235', '2'),
  ('76202', '3'), ('76203', '3'), ('76204', '3'),
  ('76109', '4'), ('76110', '4'), ('76116', '4')
ON CONFLICT (zip) DO NOTHING;

UPDATE app_settings
SET value = jsonb_set(
      value,
      '{zipZones}',
      '{"75223": "zone_2", "75270": "zone_2", "75054": "zone_3", "76014": "zone_3"}'::jsonb || (value -> 'zipZones')
    ),
    updated_at = NOW(),
    updated_by = 'migration 20261011'
WHERE key = 'coverage'
  AND jsonb_typeof(value -> 'zipZones') = 'object';

COMMIT;

-- Verify (read-only). Expected: 126, 9, and either 4 (a saved ZIP table) or 0 (none saved).
-- select
--   (select count(*) from territory_zips) as territory_zips,
--   (select count(*) from territory_zips where zip in ('75209','75243','75235','76202','76203','76204','76109','76110','76116')) as new_territory_zips,
--   (select count(*) from app_settings, jsonb_object_keys(value -> 'zipZones') k
--      where key = 'coverage' and jsonb_typeof(value -> 'zipZones') = 'object'
--      and k in ('75223','75270','75054','76014')) as saved_zone_zips;

-- ROLLBACK:
-- BEGIN;
-- DELETE FROM territory_zips WHERE zip IN ('75209','75243','75235','76202','76203','76204','76109','76110','76116');
-- UPDATE app_settings SET value = value #- '{zipZones,75223}' #- '{zipZones,75270}' #- '{zipZones,75054}' #- '{zipZones,76014}'
--   WHERE key = 'coverage' AND jsonb_typeof(value -> 'zipZones') = 'object';
-- COMMIT;
