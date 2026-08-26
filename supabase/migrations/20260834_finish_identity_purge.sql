-- ═══════════════════════════════════════════════════════════════════════════
-- 20260834_finish_identity_purge.sql
-- DCIMe V2 — finish what 20260825 started.
--
-- 20260825 renamed sites.site_code but never touched sites.site_name, so the
-- header chip — which renders site_name, not site_code — still read
-- "Airtel WTC" and "Airtel KTC". The purge was reported complete on the
-- strength of the CODE being clean; the DATA was never checked.
--
-- Rows still carrying identifying names, found by querying the live database:
--   sites.site_name              3   'NTC ZM 0874', 'Airtel WTC', 'Airtel KTC'
--   incidents.site_name          7   'NTC ZM 0874'
--   equipment_registry.name/loc  2   'ZESCO Grid', 'ZESCO Grid Feed'
--   rooms.room_name              1   'ZESCO Load Room'
--
-- The equipment and room names are DISPLAY labels — equipment_id and room id
-- are the keys — so renaming them breaks no joins. The matching blueprint JSON
-- is renamed in the same commit, because the renderer matches rooms by name.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Sites: the name shown in the header ────────────────────────────────────
UPDATE public.sites SET site_name = 'Site 1' WHERE site_code = 'SITE_01';
UPDATE public.sites SET site_name = 'Site 2' WHERE site_code = 'SITE_02';
UPDATE public.sites SET site_name = 'Site 3' WHERE site_code = 'SITE_03';

-- ── Incidents carry a denormalised site name onto printed tickets ─────────
UPDATE public.incidents i
   SET site_name = s.site_name
  FROM public.sites s
 WHERE s.id = i.site_uuid
   AND i.site_name IS DISTINCT FROM s.site_name;

-- Any left over predate site_uuid being populated.
UPDATE public.incidents
   SET site_name = 'Site 1'
 WHERE site_name ~* '(airtel|NTC|WTC|KTC)';

-- ── The utility operator ──────────────────────────────────────────────────
-- Matches UTILITY_NAME in src/shared/utils/branding.ts. Display only: the
-- wire value in telemetry_logs.active_power_source is untouched, because
-- historical readings are keyed on it.
UPDATE public.equipment_registry
   SET name = regexp_replace(name, 'ZESCO', 'Utility', 'gi')
 WHERE name ~* 'zesco';

UPDATE public.equipment_registry
   SET location = regexp_replace(location, 'ZESCO', 'Utility', 'gi')
 WHERE location ~* 'zesco';

UPDATE public.rooms
   SET room_name = regexp_replace(room_name, 'ZESCO', 'Utility', 'gi')
 WHERE room_name ~* 'zesco';

-- ── Self-check: fail loudly rather than reporting a clean purge again ─────
DO $$
DECLARE n integer;
BEGIN
  SELECT (SELECT count(*) FROM public.sites              WHERE site_name ~* '(airtel|NTC|WTC|KTC)')
       + (SELECT count(*) FROM public.incidents          WHERE site_name ~* '(airtel|NTC|WTC|KTC)')
       + (SELECT count(*) FROM public.equipment_registry WHERE name ~* 'zesco' OR location ~* 'zesco')
       + (SELECT count(*) FROM public.rooms              WHERE room_name ~* 'zesco')
    INTO n;
  IF n > 0 THEN
    RAISE EXCEPTION 'Identity purge incomplete: % row(s) still match.', n;
  END IF;
  RAISE NOTICE 'Identity purge verified: 0 rows carry identifying names.';
END $$;

COMMIT;
