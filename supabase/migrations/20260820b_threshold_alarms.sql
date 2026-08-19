-- ═══════════════════════════════════════════════════════════════════════════
-- 20260820_threshold_alarms.sql
-- DCIMe V2 — readings become work
--
-- This is the Infrastructure -> Technical link from the V2 document: a sensor
-- reads badly, the system works out it matters, and a PERSON is given a job.
--
-- V1 has no rules engine at all (audit C-06, G-10). Every "Active Alarm" on the
-- admin screen is something a human noticed and typed up. A fault the
-- technician doesn't spot, or spots and doesn't file, does not exist.
--
-- The thresholds already exist — Stage 1 put min_value and max_value on every
-- parameter, and Stage 6 made the forms enforce them on entry. This closes the
-- loop by evaluating what was actually recorded and raising work from it.
--
-- Depends on: 20260820_work_items.sql, the parameter registry
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. SEVERITY FROM DISTANCE
--
--    How far outside its band a reading sits, as a fraction of the band width.
--    Using distance rather than a fixed table means one rule serves every
--    parameter: 2 °C over on a 20 °C band is not the same event as 2 V over on
--    a 0.5 V band, and a fixed mapping cannot tell them apart.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.severity_from_excursion(
  p_value double precision,
  p_min   double precision,
  p_max   double precision
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_band double precision;
  v_over double precision;
BEGIN
  IF p_value IS NULL THEN RETURN NULL; END IF;

  IF p_max IS NOT NULL AND p_value > p_max THEN
    v_over := p_value - p_max;
  ELSIF p_min IS NOT NULL AND p_value < p_min THEN
    v_over := p_min - p_value;
  ELSE
    RETURN NULL;   -- inside its band
  END IF;

  v_band := NULLIF(COALESCE(p_max,0) - COALESCE(p_min,0), 0);
  -- With only one bound there is no band to measure against, so fall back to a
  -- mid severity rather than inventing a scale.
  IF v_band IS NULL THEN RETURN 'P3'; END IF;

  RETURN CASE
    WHEN v_over > v_band * 0.25 THEN 'P1'
    WHEN v_over > v_band * 0.10 THEN 'P2'
    WHEN v_over > v_band * 0.02 THEN 'P3'
    ELSE 'P4'
  END;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. EVALUATION
--
--    Reads the most recent telemetry for a site, compares each value against
--    its registered band, and raises work for every breach.
--
--    Only the LATEST reading per parameter is considered. Evaluating history
--    would raise work for excursions that were resolved weeks ago.
-- ═══════════════════════════════════════════════════════════════════════════
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
      -- One row per (equipment, parameter): the newest reading.
      -- Ordered by target_hour, not submission time. A reading backdated to
      -- 06:00 and typed at noon describes 06:00 — treating it as the latest
      -- state would let a late entry overwrite a more recent one.
      SELECT DISTINCT ON (t.site_uuid, t.asset_id, kv.key)
             t.site_uuid, t.asset_id, kv.key AS param, kv.value AS raw,
             t.target_hour
        FROM public.telemetry_logs t
        CROSS JOIN LATERAL jsonb_each_text(t.metrics) AS kv(key, value)
       WHERE (p_site_uuid IS NULL OR t.site_uuid = p_site_uuid)
         AND t.target_hour > now() - interval '48 hours'
       ORDER BY t.site_uuid, t.asset_id, kv.key, t.target_hour DESC
    )
    SELECT l.site_uuid, l.asset_id, l.param, l.raw,
           e.name AS equipment_name,
           p.display_label, p.unit, p.min_value, p.max_value,
           -- Text metrics ('OK', 'YES') are not comparable to a band; only
           -- something that parses as a number is evaluated.
           CASE WHEN l.raw ~ '^-?[0-9]+\.?[0-9]*$'
                THEN l.raw::double precision END AS num
      FROM latest l
      JOIN public.equipment_registry e
        ON e.equipment_id = l.asset_id AND e.site_uuid = l.site_uuid
      JOIN public.equipment_parameters p
        ON (p.equipment_id = e.equipment_id
            OR p.template_id = e.template_id)
       AND l.param = COALESCE(e.metric_prefix, e.equipment_id) || '_' || p.parameter_name
     WHERE p.is_active
       AND (p.min_value IS NOT NULL OR p.max_value IS NOT NULL)
  LOOP
    CONTINUE WHEN r.num IS NULL;

    out_equipment  := r.equipment_name;
    out_parameter  := COALESCE(r.display_label, r.param);
    out_value      := r.num;
    out_severity   := public.severity_from_excursion(r.num, r.min_value, r.max_value);
    out_raised     := false;
    out_source_ref := r.asset_id || '.' || r.param;

    CONTINUE WHEN out_severity IS NULL;   -- within band

    SELECT count(*) INTO v_before FROM public.work_items
     WHERE site_uuid = r.site_uuid AND source_kind = 'THRESHOLD'
       AND source_ref = r.asset_id || '.' || r.param
       AND state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS');

    v_id := public.raise_work_item(
      p_site_uuid   => r.site_uuid,
      -- Written as an instruction, not a measurement. "Inspect X" tells someone
      -- what to do; "temperature 38" leaves them to work it out.
      p_title       => 'Inspect ' || r.equipment_name || ' — '
                       || COALESCE(r.display_label, r.param) || ' out of range',
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
      p_source_ref  => r.asset_id || '.' || r.param
    );

    SELECT count(*) INTO v_after FROM public.work_items
     WHERE site_uuid = r.site_uuid AND source_kind = 'THRESHOLD'
       AND source_ref = r.asset_id || '.' || r.param
       AND state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS');

    out_raised := (v_after > v_before);
    RETURN NEXT;
  END LOOP;
END $$;

COMMENT ON FUNCTION public.evaluate_thresholds(uuid) IS
  'Compares the latest reading of every bounded parameter against its band and '
  'raises work for breaches. Idempotent: a breach that is still open is not '
  'raised again.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. AUTO-RESOLUTION
--
--    A reading that returns to normal closes its own ticket, with a note saying
--    why. Without this, a technician has to manually clear alarms the plant
--    already fixed, and within a week they stop trusting the queue.
--
--    Deliberately NOT applied to acknowledged or in-progress work: once a
--    person has picked something up, closing it under them destroys the record
--    of what they did.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.resolve_recovered_thresholds(p_site_uuid uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closed int := 0;
BEGIN
  -- Materialised first: evaluate_thresholds() has side effects (it raises work),
  -- so it must run exactly once rather than being re-executed per candidate row
  -- by the planner.
  CREATE TEMP TABLE IF NOT EXISTS _breached (source_ref text PRIMARY KEY) ON COMMIT DROP;
  DELETE FROM _breached;

  INSERT INTO _breached (source_ref)
  SELECT DISTINCT r.out_source_ref
    FROM public.evaluate_thresholds(p_site_uuid) r
   WHERE r.out_severity IS NOT NULL AND r.out_source_ref IS NOT NULL;

  UPDATE public.work_items w
     SET state = 'RESOLVED',
         resolved_at = now(),
         resolution_note = 'Reading returned to its expected range. Closed automatically.'
   WHERE w.source_kind = 'THRESHOLD'
     -- OPEN only. Once someone has acknowledged or started work, closing it
     -- under them destroys the record of what they did.
     AND w.state = 'OPEN'
     AND w.origin = 'SYSTEM'
     AND (p_site_uuid IS NULL OR w.site_uuid = p_site_uuid)
     AND w.source_ref IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM _breached b WHERE b.source_ref = w.source_ref);

  GET DIAGNOSTICS v_closed = ROW_COUNT;
  RETURN v_closed;
END $$;

GRANT EXECUTE ON FUNCTION public.evaluate_thresholds(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_recovered_thresholds(uuid) TO authenticated;

COMMIT;
