-- ═══════════════════════════════════════════════════════════════════════════
-- 20260844_thresholds_on_readings.sql
-- DCIMe V2.1 — Stage 2: the alarm path could never have fired. Now it can.
--
-- WHAT WAS WRONG
-- evaluate_thresholds() reads telemetry_logs and reconstructs which asset a
-- value belongs to from the shape of its JSONB key. Both halves of that are
-- impossible against the data that exists:
--
--   JOIN equipment_registry e ON e.equipment_id = l.asset_id
--     telemetry_logs.asset_id is 'facility_wide' on every row ever written.
--     No asset is called that, so the join matches nothing, for any site,
--     forever.
--
--   AND l.param = COALESCE(e.metric_prefix, e.equipment_id) || '_' || p.parameter_name
--     This expects the key to be <asset>_<parameter>. But parameter_name IS
--     already the whole key — 'pr1_ambient_temp', not 'ambient_temp' — so even
--     with the join fixed it would look for 'room_pr1_ambient_pr1_ambient_temp'.
--
-- So no threshold has ever raised a job, and none could have. This was invisible
-- because the function returns zero rows rather than failing, and because only
-- one parameter has a band configured — which made "finds nothing" look like
-- "nothing is wrong".
--
-- WHY IT IS FIXABLE NOW
-- public.readings carries equipment_id and parameter_name as real columns, so
-- there is nothing to reconstruct. The query below is both correct and shorter
-- than the one it replaces — the string surgery existed only to compensate for
-- a model where a reading did not know what it belonged to.
--
-- Behaviour is otherwise unchanged: same 48-hour window, same newest-reading
-- rule, same severity function, same source_ref identity, same breach stamping.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.evaluate_thresholds(p_site_uuid uuid DEFAULT NULL)
RETURNS TABLE (
  out_equipment  text,
  out_parameter  text,
  out_value      double precision,
  out_severity   text,
  out_raised     boolean,
  -- The stable identity of this breach. Recovery matches on THIS, never on
  -- title text: two parameters on one device produce near-identical titles, and
  -- a LIKE match would close the wrong ticket.
  out_source_ref text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

    out_raised := (v_after > v_before);

    -- Record what this breach was measured against, at the moment it was
    -- raised. Only on a NEW job, and only once: re-stamping an already-open one
    -- each time the evaluator runs would replace the reading that caused it
    -- with whatever the latest one happens to be.
    IF out_raised THEN
      UPDATE public.work_items
         SET breach_value = r.num,
             breach_min   = r.min_value,
             breach_max   = r.max_value
       WHERE id = v_id AND breach_value IS NULL;
    END IF;

    RETURN NEXT;
  END LOOP;
END $$;

COMMENT ON FUNCTION public.evaluate_thresholds(uuid) IS
  'Compares the newest reading of every banded parameter against its limits and '
  'raises work for each breach. Reads public.readings, where a value knows which '
  'asset and parameter it belongs to — the previous version reconstructed that '
  'from JSONB key shapes and matched nothing, ever.';

COMMIT;
