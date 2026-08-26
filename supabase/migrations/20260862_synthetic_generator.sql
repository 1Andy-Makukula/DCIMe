-- ═══════════════════════════════════════════════════════════════════════════
-- 20260862_synthetic_generator.sql
-- DCIMe V2.1 — generating demonstration readings that behave like the plant.
--
-- HOW IT WRITES
-- Into telemetry_logs, one row per round, exactly as a technician's submission
-- arrives. The existing fan-out trigger turns each into ~260 readings and
-- carries provenance = 'SYNTHETIC' down with them. Writing into readings
-- directly would produce charts with no source document behind them, and the
-- Excel export — which reads telemetry_logs — would come out empty.
--
-- HOW IT DECIDES WHAT TO WRITE
-- Every value is modelled on THIS site's own history: the mean, spread and
-- observed range of each parameter's real readings. Nothing is invented from a
-- catalogue. A parameter with no history is skipped rather than guessed at.
--
--   · values WALK. Each hour moves from the last by a fraction of the observed
--     spread, so 03:00 sits near 02:00. Independent draws each hour produce a
--     hairball that no instrument has ever produced.
--   · temperatures carry a DIURNAL cycle, warmest mid-afternoon, amplitude
--     taken from the parameter's own spread.
--   · values are clamped to the observed range, so nothing invents an
--     excursion the plant has never actually had.
--
-- THE IMPERFECTIONS ARE DELIBERATE
-- Real rounds get missed, fields get skipped, and boxes get answered 'NA'.
-- Perfect coverage is the giveaway that data was generated. Rates are taken
-- from the real data: ~10% NA, and a zero rate around 7% — the rate seen in
-- thermal and electrical capture.
--
-- ONE DEPARTURE, STATED PLAINLY: fuel logging is 99.7% zeros in the real data,
-- which is a defect rather than a characteristic — a tank balance of zero is
-- not a reading. Reproducing it faithfully would make the Generators & Fuel
-- screen a flat line at zero. Fuel measures therefore get realistic tank
-- levels and the ordinary zero rate. Consumption and delivery still sit at zero
-- on most days, because a standby generator that did not run genuinely burned
-- nothing.
--
-- ROUND TIMING follows the real rhythm: attempted hourly, ~14 achieved per day
-- against the 24 possible, thinner through the afternoon. The real site manages
-- about 10, so this is a well-run period rather than a perfect one.
--
-- TECHNICIANS are assigned in SHIFT BLOCKS — one person for a run of hours,
-- against a real shift_sessions row. Rotating per reading is the tell that
-- makes generated attribution look generated.
--
-- Everything it writes is removable with purge_synthetic_data().
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── A roughly normal deviate ───────────────────────────────────────────────
-- Three uniforms summed approximate a normal well enough for this, and avoid
-- Box-Muller's log/sqrt per call across a few hundred thousand values.
CREATE OR REPLACE FUNCTION public.rand_normal()
RETURNS double precision
LANGUAGE sql VOLATILE
AS $$ SELECT (random() + random() + random() - 1.5) * 1.1547 $$;

COMMENT ON FUNCTION public.rand_normal() IS
  'Approximately standard-normal. Sum of three uniforms, scaled to unit variance.';


CREATE OR REPLACE FUNCTION public.generate_synthetic_readings(
  p_site_uuid      uuid,
  p_from           timestamptz,
  p_to             timestamptz,
  p_rounds_per_day int DEFAULT 14
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hour        timestamptz;
  v_metrics     jsonb;
  v_logs        int := 0;
  v_readings    bigint;
  v_tech        record;
  v_shift_id    uuid;
  v_shift_until timestamptz := p_from;
  v_p           record;
  v_val         double precision;
  v_txt         text;
  v_roll        double precision;
  v_diurnal     double precision;
  v_hr          int;
  v_skip_prob   double precision;
BEGIN
  IF p_from >= p_to THEN
    RAISE EXCEPTION 'from (%) must be before to (%)', p_from, p_to;
  END IF;

  -- ── Clear any previous synthetic run over this window ────────────────────
  -- Re-running should replace, not stack. Only SYNTHETIC rows are touched.
  DELETE FROM public.readings
   WHERE site_uuid = p_site_uuid AND provenance = 'SYNTHETIC'
     AND target_hour >= p_from AND target_hour < p_to;
  DELETE FROM public.telemetry_logs
   WHERE site_uuid = p_site_uuid AND provenance = 'SYNTHETIC'
     AND target_hour >= p_from AND target_hour < p_to;

  -- ── The model, built once from real history ──────────────────────────────
  CREATE TEMP TABLE IF NOT EXISTS _profile (
    parameter_name text PRIMARY KEY,
    measure        text,
    is_text        boolean,
    modal_text     text,
    mean_v         double precision,
    sd_v           double precision,
    min_v          double precision,
    max_v          double precision,
    is_temp        boolean,
    is_fuel_level  boolean,
    current_v      double precision
  ) ON COMMIT DROP;
  DELETE FROM _profile;

  INSERT INTO _profile
  SELECT p.parameter_name,
         p.measure,
         -- A parameter is 'text' when its real history is mostly words.
         (count(r.value_num) < count(r.value_text))                    AS is_text,
         mode() WITHIN GROUP (ORDER BY r.value_text)                   AS modal_text,
         avg(r.value_num) FILTER (WHERE r.value_num <> 0)              AS mean_v,
         COALESCE(stddev(r.value_num) FILTER (WHERE r.value_num <> 0), 0) AS sd_v,
         min(r.value_num) FILTER (WHERE r.value_num <> 0)              AS min_v,
         max(r.value_num) FILTER (WHERE r.value_num <> 0)              AS max_v,
         (p.measure ~ 'temp')                                          AS is_temp,
         -- Tank contents: modelled properly rather than reproducing the
         -- 99.7% zeros, which are a logging defect and not a fuel level.
         (p.measure ~ 'balance|brought_forward|tank|dipstick')          AS is_fuel_level,
         NULL::double precision
    FROM public.equipment_parameters p
    JOIN public.equipment_registry e
      ON e.equipment_id = p.equipment_id AND e.site_uuid = p_site_uuid
    LEFT JOIN public.readings r
      ON r.equipment_id = p.equipment_id
     AND r.parameter_name = p.parameter_name
     AND r.provenance = 'FIELD'
   WHERE p.is_active
     AND p.capture_mode <> 'NOT_APPLICABLE'
     AND COALESCE(e.is_active, true)
   GROUP BY p.parameter_name, p.measure
     -- No history means no basis. Skipped rather than guessed.
    HAVING count(r.*) > 0;

  -- Seed the walk at each parameter's own average.
  UPDATE _profile SET current_v = COALESCE(mean_v, 0);

  -- ── Walk the window ──────────────────────────────────────────────────────
  v_hour := date_trunc('hour', p_from);

  WHILE v_hour < p_to LOOP
    v_hr := EXTRACT(hour FROM v_hour)::int;

    -- Rounds are attempted hourly and not all of them happen. Thinner through
    -- the afternoon, matching the real distribution.
    v_skip_prob := 1.0 - (p_rounds_per_day / 24.0);
    IF v_hr BETWEEN 12 AND 16 THEN
      v_skip_prob := v_skip_prob + 0.15;
    END IF;

    IF random() >= v_skip_prob THEN

      -- ── Whose shift is it? ───────────────────────────────────────────────
      -- Held for a block of hours rather than re-picked per round.
      IF v_hour >= v_shift_until THEN
        SELECT e.id, e.full_name INTO v_tech
          FROM public.employees e
         WHERE e.site_uuid = p_site_uuid AND e.status = 'Active'
           AND e.role = 'FIELD_TECH'
         ORDER BY random() LIMIT 1;

        v_shift_until := v_hour + ((6 + floor(random() * 4))::int || ' hours')::interval;

        IF v_tech.id IS NOT NULL THEN
          INSERT INTO public.shift_sessions
            (employee_id, site_uuid, shift_type, status,
             checked_in_at, checked_out_at, provenance)
          VALUES
            (v_tech.id, p_site_uuid,
             -- Vocabulary is fixed by shift_sessions_shift_type_check and
             -- _status_check: DAY_SHIFT/NIGHT_SHIFT/CUSTOM, and CLOSED rather
             -- than COMPLETED. A closed shift must carry checked_out_at, which
             -- the checkout constraint enforces.
             CASE WHEN v_hr BETWEEN 6 AND 17 THEN 'DAY_SHIFT' ELSE 'NIGHT_SHIFT' END,
             'CLOSED', v_hour, v_shift_until, 'SYNTHETIC')
          RETURNING id INTO v_shift_id;
        END IF;
      END IF;

      -- ── Build the round ──────────────────────────────────────────────────
      v_metrics := '{}'::jsonb;

      FOR v_p IN SELECT * FROM _profile LOOP
        v_roll := random();

        -- A field left untouched. Absent from the payload entirely, which is
        -- what the form actually submits when nothing is entered.
        CONTINUE WHEN v_roll < 0.04;

        IF v_p.is_text THEN
          -- The modal real answer, with no extra 'NA' layered on top.
          --
          -- Adding one was double-counting: 6,194 of the real readings are
          -- 'NA', so for a good many parameters mode() IS 'NA' already, and a
          -- further 10% on top pushed the synthetic rate to 17.4% against a
          -- real 10%. The observed mode carries the site's real NA behaviour by
          -- itself.
          v_metrics := v_metrics || jsonb_build_object(
            v_p.parameter_name, COALESCE(v_p.modal_text, 'OK'));
          CONTINUE;
        END IF;

        -- 'Not available' — the technician was there and could not read it.
        --
        -- 5%, not 10%. Text parameters already carry their own NA through the
        -- observed mode, so the two sources add: a 10% band here produced 14.7%
        -- overall against a real 10%. These bands are tuned against the FIELD
        -- rates and re-measured after each change, not guessed.
        IF v_roll < 0.09 THEN
          v_metrics := v_metrics || jsonb_build_object(v_p.parameter_name, 'NA');
          CONTINUE;
        END IF;

        -- The blank box saved as a number. Reproduced because it is real, and
        -- because the operating limits now catch it — except on tank contents,
        -- where a zero would be a defect rather than a reading.
        -- Measured against numeric readings only, so the band is narrower than
        -- the headline rate suggests: NA and text rows are not in the
        -- denominator.
        IF v_roll < 0.14 AND NOT v_p.is_fuel_level THEN
          v_metrics := v_metrics || jsonb_build_object(v_p.parameter_name, '0');
          CONTINUE;
        END IF;

        -- ── The value itself ───────────────────────────────────────────────
        v_diurnal := 0;
        IF v_p.is_temp AND v_p.sd_v > 0 THEN
          -- Warmest around 15:00, coldest around 03:00.
          v_diurnal := sin(2 * pi() * ((v_hr - 9)::double precision / 24.0))
                       * v_p.sd_v * 0.6;
        END IF;

        v_val := COALESCE(v_p.current_v, v_p.mean_v, 0)
                 + public.rand_normal() * COALESCE(v_p.sd_v, 0) * 0.25
                 -- Pulled gently back toward the mean, so the walk does not
                 -- drift off across two months.
                 + (COALESCE(v_p.mean_v, 0) - COALESCE(v_p.current_v, 0)) * 0.15;

        UPDATE _profile SET current_v = v_val WHERE parameter_name = v_p.parameter_name;

        v_val := v_val + v_diurnal;

        -- Never outside what this instrument has actually shown.
        IF v_p.min_v IS NOT NULL THEN v_val := greatest(v_val, v_p.min_v); END IF;
        IF v_p.max_v IS NOT NULL THEN v_val := least(v_val, v_p.max_v); END IF;

        v_metrics := v_metrics || jsonb_build_object(
          v_p.parameter_name,
          to_char(round(v_val::numeric, 2), 'FM999999990.99'));
      END LOOP;

      IF v_metrics <> '{}'::jsonb THEN
        INSERT INTO public.telemetry_logs
          (site_uuid, asset_id, target_hour, submitted_at, frequency,
           technician_id, technician_name, shift_session_id, metrics, provenance)
        VALUES
          (p_site_uuid, 'facility_wide', v_hour,
           -- When it was WRITTEN UP, as against the hour it describes.
           --
           -- Usually a few minutes after the round. But roughly one round in
           -- twelve gets caught up later — from memory at the end of a shift,
           -- or after a tablet came back into signal. That matches the real
           -- data: 20 of 237 submissions were entered more than two hours
           -- late, the worst 22 hours later.
           --
           -- Without this the entry-discipline panel reads a flawless "0 of 66
           -- late", which is not what this site actually does.
           CASE WHEN random() < 0.08
                THEN v_hour + ((floor(random() * 1200) + 120)::int || ' minutes')::interval
                ELSE v_hour + ((floor(random() * 40) + 3)::int || ' minutes')::interval
           END,
           'hourly', v_tech.id, v_tech.full_name, v_shift_id, v_metrics, 'SYNTHETIC');
        v_logs := v_logs + 1;
      END IF;
    END IF;

    v_hour := v_hour + interval '1 hour';
  END LOOP;

  SELECT count(*) INTO v_readings
    FROM public.readings
   WHERE site_uuid = p_site_uuid AND provenance = 'SYNTHETIC'
     AND target_hour >= p_from AND target_hour < p_to;

  RETURN format('%s rounds written, %s readings fanned out, %s to %s',
                v_logs, v_readings, p_from::date, p_to::date);
END $$;

COMMENT ON FUNCTION public.generate_synthetic_readings(uuid, timestamptz, timestamptz, int) IS
  'Writes demonstration rounds into telemetry_logs, modelled on the site''s own '
  'observed ranges, and lets the fan-out trigger produce the readings. Every '
  'row is marked SYNTHETIC and removable with purge_synthetic_data().';

REVOKE ALL ON FUNCTION
  public.generate_synthetic_readings(uuid, timestamptz, timestamptz, int)
  FROM anon, authenticated;

COMMIT;
