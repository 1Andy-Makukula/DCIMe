-- ═══════════════════════════════════════════════════════════════════════════
-- 20260864_zeros_are_not_faults.sql
-- DCIMe V2.1 — an empty box should not wake somebody up.
--
-- WHAT HAPPENED
-- Operating limits landed in 20260861. Within the hour the dcime_thresholds
-- cron raised the first work items this database has ever had — which is the
-- machinery working correctly for the first time. Three of the ten were these:
--
--     Inspect UPS 2 — Battery Charge (%) out of range        recorded 0, expected 80–100
--     Inspect Vertiv 1 — Return Temp (Actual) out of range   recorded 0, expected 18–27
--     Inspect Power Room 1 Ambient — Humidity out of range   recorded 0, expected 20–60
--
-- All three are P1. None of them is real. A UPS at 0% charge is not reporting
-- 230 V on all three output phases at the same moment, and a data hall is not
-- at 0 °C. They are blank boxes saved as numbers — the same 9% zero rate found
-- across the whole dataset — and severity_from_excursion correctly scores a
-- zero against a floor of 80 as catastrophic.
--
-- Left alone this is an alarm system that cries wolf on roughly nine readings
-- in a hundred. Across the generated history the effect is stark: 595 of 636
-- work items were P1, every one of them a zero, drowning the 41 real
-- excursions that actually deserve attention.
--
-- THE RULE
-- An exact zero, on a parameter whose minimum is above zero, is treated as a
-- MISSING reading rather than an excursion — and does not raise work.
--
-- WHAT THIS DELIBERATELY DOES NOT CHANGE
-- reading_status() still calls it a breach, the rollups still count it, and the
-- detail screens still show it. The reading really is outside the band, and
-- hiding that would lose the data-quality signal that says these boxes are not
-- being filled in. The change is only to DISPATCH: it stops a blank field
-- putting a P1 on somebody's queue at three in the morning.
--
-- Recording and reacting are different questions, and this is the line between
-- them.
--
-- THE LIMIT OF THE RULE
-- A genuine zero on one of these parameters would now go undispatched. That is
-- a real cost, accepted because such a failure never arrives alone — a room at
-- 0 °C shows up across every other sensor in it — whereas the false alarms
-- arrive nine times in a hundred and teach people to ignore the queue.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.evaluate_thresholds(p_site_uuid uuid DEFAULT NULL::uuid)
RETURNS TABLE(out_equipment text, out_parameter text, out_value double precision,
              out_severity text, out_raised boolean, out_source_ref text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  r        record;
  v_id     uuid;
  v_before int;
  v_after  int;
BEGIN
  FOR r IN
    WITH latest AS (
      -- One row per (asset, parameter): the newest reading.
      -- Ordered by target_hour, not submission time. A reading backdated to
      -- 06:00 and typed at noon describes 06:00 — treating it as the latest
      -- state would let a late entry overwrite a more recent one.
      SELECT DISTINCT ON (d.site_uuid, d.equipment_id, d.parameter_name)
             d.site_uuid, d.equipment_id, d.parameter_name, d.value_num, d.target_hour
        FROM public.readings d
       WHERE (p_site_uuid IS NULL OR d.site_uuid = p_site_uuid)
         AND d.target_hour > now() - interval '48 hours'
         -- Text readings ('OK', 'NA', 'OFFLINE') are not comparable to a band.
         -- value_num is null for all of them, which is the whole filter.
         AND d.value_num IS NOT NULL
       ORDER BY d.site_uuid, d.equipment_id, d.parameter_name, d.target_hour DESC
    )
    SELECT l.site_uuid, l.equipment_id, l.parameter_name, l.value_num AS num,
           e.name AS equipment_name,
           p.display_label, p.unit, p.min_value, p.max_value
      FROM latest l
      JOIN public.equipment_registry e
        ON e.equipment_id = l.equipment_id AND e.site_uuid = l.site_uuid
      -- A direct key match. No prefix arithmetic, because a reading now knows
      -- which parameter it is.
      JOIN public.equipment_parameters p
        ON p.equipment_id = l.equipment_id AND p.parameter_name = l.parameter_name
     WHERE p.is_active
       AND p.capture_mode = 'CAPTURED'
       AND (p.min_value IS NOT NULL OR p.max_value IS NOT NULL)
       -- A decommissioned asset cannot be inspected, so raising work for it
       -- only puts something on a technician's queue that they cannot close.
       AND COALESCE(e.is_active, true)
       -- ── An empty box is not a fault ───────────────────────────────────────
       -- An exact zero where the floor is above zero is a field left blank and
       -- saved, not a plant excursion. Still recorded, still counted, still
       -- shown as out of range — just not dispatched.
       AND NOT (l.value_num = 0 AND COALESCE(p.min_value, 0) > 0)
  LOOP
    out_equipment  := r.equipment_name;
    out_parameter  := COALESCE(r.display_label, r.parameter_name);
    out_value      := r.num;
    out_severity   := public.severity_from_excursion(r.num, r.min_value, r.max_value);
    out_raised     := false;
    out_source_ref := r.equipment_id || '.' || r.parameter_name;

    CONTINUE WHEN out_severity IS NULL;   -- within band

    SELECT count(*) INTO v_before FROM public.work_items
     WHERE site_uuid = r.site_uuid AND source_kind = 'THRESHOLD'
       AND source_ref = out_source_ref
       AND state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS');

    v_id := public.raise_work_item(
      p_site_uuid   => r.site_uuid,
      -- Written as an instruction, not a measurement. "Inspect X" tells someone
      -- what to do; "temperature 38" leaves them to work it out.
      p_title       => 'Inspect ' || r.equipment_name || ' — '
                       || COALESCE(r.display_label, r.parameter_name) || ' out of range',
      p_severity    => out_severity,
      p_kind        => 'FAULT',
      p_detail      => 'Recorded ' || r.num || COALESCE(' ' || r.unit, '')
                       || ', expected '
                       || COALESCE(r.min_value::text, '–') || ' to '
                       || COALESCE(r.max_value::text, '–')
                       || COALESCE(' ' || r.unit, '')
                       || '. Raised automatically from the reading logged for '
                       || r.equipment_name || '.',
      p_origin      => 'SYSTEM',
      p_source_kind => 'THRESHOLD',
      p_source_ref  => out_source_ref
    );

    SELECT count(*) INTO v_after FROM public.work_items
     WHERE site_uuid = r.site_uuid AND source_kind = 'THRESHOLD'
       AND source_ref = out_source_ref
       AND state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS');

    out_raised := v_after > v_before;
    RETURN NEXT;
  END LOOP;
END $function$;

COMMENT ON FUNCTION public.evaluate_thresholds(uuid) IS
  'Raises work from the newest reading per asset-parameter in the last 48 '
  'hours. An exact zero where the floor is above zero is treated as a blank '
  'field rather than an excursion and is not dispatched — it remains a breach '
  'everywhere it is COUNTED, just not somewhere it is ACTED ON.';

COMMIT;


-- ── Clear the false alarms already raised ──────────────────────────────────
-- Cancelled rather than deleted: they were genuinely raised, and the record of
-- the system having done so is worth keeping.
BEGIN;

UPDATE public.work_items w
   SET state = 'CANCELLED',
       resolution_note = 'Cancelled automatically: raised from a reading of '
         || 'exactly zero, which is a field left blank rather than a measured '
         || 'excursion. See migration 20260864.',
       updated_at = now()
 WHERE w.source_kind = 'THRESHOLD'
   AND w.state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS')
   AND w.breach_value = 0
   AND COALESCE(w.breach_min, 0) > 0;

COMMIT;


DO $$
DECLARE v_cancelled int; v_live int;
BEGIN
  SELECT count(*) INTO v_cancelled FROM public.work_items
   WHERE state = 'CANCELLED' AND breach_value = 0;
  SELECT count(*) INTO v_live FROM public.work_items
   WHERE state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS');
  RAISE NOTICE '% zero-valued alarms cancelled; % work items still live', v_cancelled, v_live;
END $$;
