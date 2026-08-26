-- ═══════════════════════════════════════════════════════════════════════════
-- 20260840_graphable_readings.sql
-- DCIMe V2.1 — Stage 1: say which readings can be plotted.
--
-- 20260837 seeded 546 parameters from the blueprint, which never carried this
-- flag, so every one of them arrived with is_graphable false. TelemetryChart
-- filters on it, so the asset chart has nothing to draw — not a regression, it
-- was empty before too, but the registry is now the thing that would fix it and
-- it was loaded without the answer.
--
-- The rule is narrow on purpose: a NUMBER a person actually reads. Constants
-- (a UPS rating) plot as a flat line that says nothing; NOT_APPLICABLE
-- parameters have no readings at all; text ones cannot be plotted. Anything
-- else is an administrator's call, which is why this only ever turns the flag
-- ON — a parameter somebody has already excluded by hand stays excluded.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE public.equipment_parameters
   SET is_graphable = true
 WHERE capture_mode = 'CAPTURED'
   AND data_type = 'number'
   AND is_active
   AND COALESCE(is_graphable, false) = false
   -- Times and dates are stored as numbers in places but are not series.
   AND input_type NOT IN ('time','date','boolean','select')
   -- Meter totals and run-hour counters only ever climb; the useful series is
   -- their delta, which the rollups derive in Stage 3. Plotting the raw total
   -- draws a straight line that hides the thing worth seeing.
   AND parameter_name !~ '_(kwh_meter|cumulative_hrs|hr_meter_start|hr_meter_stop|brought_forward)$';

COMMIT;

DO $$
DECLARE v_on int; v_off int;
BEGIN
  SELECT count(*) FILTER (WHERE is_graphable),
         count(*) FILTER (WHERE NOT COALESCE(is_graphable, false))
    INTO v_on, v_off
    FROM public.equipment_parameters WHERE is_active;
  RAISE NOTICE 'graphable: % on, % off', v_on, v_off;
END $$;
