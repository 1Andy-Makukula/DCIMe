-- ═══════════════════════════════════════════════════════════════════════════
-- 20260868_vertiv_correction.sql
-- DCIMe V2.1 — six air conditioners were recorded as the wrong make.
--
-- WHAT WAS WRONG
-- All 27 CRACs carried manufacturer 'Stulz', model 'CyberAir 3PRO DX'. Six of
-- them are named "Vertiv 1" through "Vertiv 6" in the same table. Confirmed
-- with the site: they are Vertiv.
--
-- WHY IT MATTERED MORE THAN A LABEL
-- Those six run 14.3-17.9 °C against 18.2-22.6 °C for the twenty Emerson units
-- — perfect correlation with the naming, no exceptions. Applying one fleet-wide
-- ASHRAE band to all 27 marked every single reading from those six as a breach:
-- 1,008 on one unit alone. An alarm that fires on 100% of normal operation is
-- an alarm people learn to close without reading.
--
-- The earlier reading of this — "same model, same room, so a deliberate
-- setpoint or a real imbalance" — was wrong, and wrong because it trusted a
-- manufacturer column that turned out to be the actual fault.
--
-- THE BAND FOR THESE SIX
-- Fitted to how they run, and that IS circular — the honest objection to it is
-- that it declares current behaviour correct by construction. It is a holding
-- position until somebody reads the unit spec, and it is set wide enough to
-- keep catching what matters: the 0.0 blank boxes, and any genuine collapse.
--
-- Dragor is deliberately NOT included. It runs with this cluster thermally
-- (17.9 °C mean) but nothing in the registry or its name says Vertiv, and
-- guessing a make from a temperature is how the original error happened.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE public.equipment_registry
   SET manufacturer = 'Vertiv',
       -- The model is NOT invented. Stulz's model number cannot be right for a
       -- Vertiv unit, so it is cleared rather than replaced with a plausible
       -- guess; Inventory can fill it in from the nameplate.
       model = NULL
 WHERE category = 'AIRCON'
   AND name ILIKE '%Vertiv%'   -- 'Data Room Vertiv 6' does not START with it
   AND manufacturer = 'Stulz';

-- ── Their own temperature band ─────────────────────────────────────────────
UPDATE public.equipment_parameters p
   SET min_value = 12, warn_min = 14, warn_max = 25, max_value = 27
  FROM public.equipment_registry e
 WHERE e.equipment_id = p.equipment_id
   AND e.manufacturer = 'Vertiv'
   AND e.category = 'AIRCON'
   AND p.measure = 'return_temp_actual';

COMMIT;

DO $$
DECLARE v_units int; v_params int; v_before bigint; v_after bigint;
BEGIN
  SELECT count(*) INTO v_units FROM public.equipment_registry
   WHERE manufacturer = 'Vertiv' AND category = 'AIRCON';

  SELECT count(*) INTO v_params FROM public.equipment_parameters p
    JOIN public.equipment_registry e ON e.equipment_id = p.equipment_id
   WHERE e.manufacturer = 'Vertiv' AND p.measure = 'return_temp_actual';

  -- What the correction actually bought, in alarms that will no longer fire.
  SELECT count(*) INTO v_after
    FROM public.readings r
    JOIN public.equipment_parameters p
      ON p.equipment_id = r.equipment_id AND p.parameter_name = r.parameter_name
    JOIN public.equipment_registry e ON e.equipment_id = r.equipment_id
   WHERE e.manufacturer = 'Vertiv' AND r.value_num IS NOT NULL
     AND public.reading_status(r.value_num, p.min_value, p.max_value,
                               p.warn_min, p.warn_max) = 'breach';

  SELECT count(*) INTO v_before
    FROM public.readings r
    JOIN public.equipment_registry e ON e.equipment_id = r.equipment_id
   WHERE e.manufacturer = 'Vertiv' AND r.value_num IS NOT NULL
     AND r.value_num < 18 AND r.parameter_name LIKE '%return_temp_actual';

  RAISE NOTICE '% units corrected to Vertiv, % temperature bands widened', v_units, v_params;
  RAISE NOTICE 'breaching readings on those units: % under the old fleet band, % under their own',
    v_before, v_after;
END $$;
