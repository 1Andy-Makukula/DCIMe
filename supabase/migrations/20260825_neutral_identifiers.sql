-- ═══════════════════════════════════════════════════════════════════════════
-- 20260825_neutral_identifiers.sql
-- DCIMe V2 — remove the last operator-specific identifiers
--
-- The display layer was made neutral early on: every label a person reads comes
-- through branding.ts. What survived were WIRE VALUES — identifiers stored in
-- rows and matched by code — which were left alone at the time because renaming
-- them orphans the data that references them.
--
-- This renames the data too, so nothing operator-specific is left anywhere:
--
--   sites.site_code                'NTC' -> 'SITE_01', 'WTC' -> 'SITE_02', 'KTC' -> 'SITE_03'
--   telemetry_logs.asset_id        'AIRTEL_DAILY_CHECKLIST' -> 'DAILY_CHECKLIST'
--   telemetry_logs.metrics key     'airtelSpoc' -> 'clientSpoc'
--
-- ORDER MATTERS. The data moves first and the code follows in the same change;
-- deploying either alone leaves the application looking for identifiers that no
-- longer exist.
--
-- Everything is keyed on uuid rather than these strings, so no foreign key is
-- affected — site_code is a human-facing code, not a join key.
--
-- Idempotent: safe to re-run, and safe on a database where some or all of the
-- renames have already happened.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Site codes ─────────────────────────────────────────────────────────
-- Guarded individually: a database may hold any subset of these.
UPDATE public.sites SET site_code = 'SITE_01' WHERE site_code = 'NTC';
UPDATE public.sites SET site_code = 'SITE_02' WHERE site_code = 'WTC';
UPDATE public.sites SET site_code = 'SITE_03' WHERE site_code = 'KTC';

-- Legacy free-text site references on employees, from before site_uuid existed.
UPDATE public.employees SET site_id = 'Site 1' WHERE site_id IN ('NTC', 'NTC ZM 0874', 'NTC ZM-0874');
UPDATE public.employees SET site_id = 'Site 2' WHERE site_id IN ('WTC', 'WTC ZM 0875');
UPDATE public.employees SET site_id = 'Site 3' WHERE site_id IN ('KTC', 'KTC ZM 0876');


-- ── 2. The daily checklist asset id ───────────────────────────────────────
-- Every archived checklist is stored against this id. Renaming the constant in
-- code without moving the rows would hide the entire history.
UPDATE public.telemetry_logs
   SET asset_id = 'DAILY_CHECKLIST'
 WHERE asset_id = 'AIRTEL_DAILY_CHECKLIST';

UPDATE public.equipment_registry
   SET equipment_id = 'DAILY_CHECKLIST'
 WHERE equipment_id = 'AIRTEL_DAILY_CHECKLIST';


-- ── 3. The SPOC signature block ───────────────────────────────────────────
-- Newer checklists already write clientSpoc; older ones carry airtelSpoc. This
-- moves the old key across so the read no longer needs a fallback, and drops
-- the old one only after the copy succeeds.
UPDATE public.telemetry_logs
   SET metrics = (metrics - 'airtelSpoc')
                 || jsonb_build_object('clientSpoc', metrics -> 'airtelSpoc')
 WHERE metrics ? 'airtelSpoc'
   AND NOT metrics ? 'clientSpoc';

-- Rows carrying BOTH: the newer key wins and the stale one is dropped.
UPDATE public.telemetry_logs
   SET metrics = metrics - 'airtelSpoc'
 WHERE metrics ? 'airtelSpoc' AND metrics ? 'clientSpoc';


-- ── 4. Report ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_sites int; v_checklists int; v_spoc int;
BEGIN
  SELECT count(*) INTO v_sites FROM public.sites
   WHERE site_code IN ('NTC','WTC','KTC');
  SELECT count(*) INTO v_checklists FROM public.telemetry_logs
   WHERE asset_id = 'AIRTEL_DAILY_CHECKLIST';
  SELECT count(*) INTO v_spoc FROM public.telemetry_logs
   WHERE metrics ? 'airtelSpoc';

  RAISE NOTICE 'Remaining operator-specific identifiers:';
  RAISE NOTICE '  site codes      : %', v_sites;
  RAISE NOTICE '  checklist rows  : %', v_checklists;
  RAISE NOTICE '  airtelSpoc keys : %', v_spoc;

  IF v_sites + v_checklists + v_spoc > 0 THEN
    RAISE EXCEPTION 'Rename incomplete — % identifier(s) still present',
      v_sites + v_checklists + v_spoc;
  END IF;

  RAISE NOTICE 'Clean.';
END $$;

COMMIT;
