-- ========================================================================
-- 20260843_stamp_breach_limits.sql
-- DCIMe V2.1 - Stage 2: a breach keeps its own evidence.
--
-- 20260842 added breach_value / breach_min / breach_max to work_items. This
-- fills them, so a job raised by a threshold records the reading AND the band
-- it was judged against.
--
-- Without it, an administrator widening a limit next month silently rewrites
-- how many breaches happened last month - the jobs stay, but the numbers
-- behind them become whatever the current band says. For a record somebody
-- signs, that is not acceptable.
--
-- The function below is the LIVE definition, read out of the database and
-- patched, so nothing else about it can have been lost in retyping.
--
-- Idempotent: safe to re-run.
-- ========================================================================

CREATE OR REPLACE FUNCTION public.evaluate_thresholds(p_site_uuid uuid DEFAULT NULL::uuid)
 RETURNS TABLE(out_equipment text, out_parameter text, out_value double precision, out_severity text, out_raised boolean, out_source_ref text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

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

    -- Record what this breach was measured against, at the moment it was
    -- raised. Only on a NEW job, and only once: re-stamping an already-open one
    -- each time the evaluator runs would replace the reading that caused it
    -- with whatever the latest one happens to be. Retuning the band afterwards
    -- then cannot change what this job says happened.
    IF out_raised THEN
      UPDATE public.work_items
         SET breach_value = r.num,
             breach_min   = r.min_value,
             breach_max   = r.max_value
       WHERE id = v_id AND breach_value IS NULL;
    END IF;

    RETURN NEXT;

  END LOOP;

END $function$

;
