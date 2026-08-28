-- ═══════════════════════════════════════════════════════════════════════════
-- 20260869_retire_sandbox.sql
-- DCIMe V2.1 — retiring a site that could never hold a reading.
--
-- WHAT SANDBOX WAS
-- 60 registered assets and ZERO parameters against any of them. Parameters are
-- what the reading form is built from and what the fan-out writes against, so
-- the site was structurally incapable of storing a measurement. It had one
-- submission, which produced nothing.
--
-- It also cost real time: three of the four admin accounts were attached to it,
-- so signing in as an admin showed an empty facility with a CRITICAL ingestion
-- alarm — correctly, since nothing had ever arrived — and there is no site
-- switcher in the app, so there was no way to reach the site that has the data.
--
-- WHAT HAPPENS HERE
--   · the three remaining staff move to SITE_01, where the work is
--   · monitoring is switched off, so it stops raising incidents about silence
--     that is now expected rather than a fault
--   · is_active = false, so it drops out of pickers
--
-- WHAT DOES NOT HAPPEN
-- The site row and its 60 topology nodes are NOT deleted. equipment_id is a
-- global primary key, so those ids are reserved whether the site is live or
-- not, and dropping the rows would free names that existing topology edges
-- still point at. Retired, not erased.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE public.employees
   SET site_uuid = (SELECT id FROM public.sites WHERE site_code = 'SITE_01')
 WHERE site_uuid = (SELECT id FROM public.sites WHERE site_code = 'SANDBOX');

UPDATE public.sites
   SET is_active = false,
       -- Left on, this raises a critical incident every 15 minutes for a site
       -- nobody is reporting from any more.
       monitoring_enabled = false
 WHERE site_code = 'SANDBOX';

COMMIT;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT s.site_code, s.is_active, s.monitoring_enabled,
           (SELECT count(*) FROM public.employees e WHERE e.site_uuid = s.id) AS staff,
           (SELECT count(*) FROM public.readings d WHERE d.site_uuid = s.id) AS readings
      FROM public.sites s ORDER BY s.site_code
  LOOP
    RAISE NOTICE '% — active %, monitored %, % staff, % readings',
      r.site_code, r.is_active, r.monitoring_enabled, r.staff, r.readings;
  END LOOP;
END $$;
