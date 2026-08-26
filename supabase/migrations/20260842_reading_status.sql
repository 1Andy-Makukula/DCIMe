-- ═══════════════════════════════════════════════════════════════════════════
-- 20260842_reading_status.sql
-- DCIMe V2.1 — Stage 2: green, amber, red — from one place.
--
-- THE STATE THIS ARRIVES INTO
-- The threshold machinery has been complete and inert. evaluate_thresholds()
-- raises work for a breach, severity_from_excursion() grades how far outside a
-- reading sits, and the alarm path is wired end to end — but exactly ONE of the
-- 187 captured parameters has a limit configured, so it finds nothing, every
-- time. Nothing is broken; nothing has been told what "wrong" means.
--
-- So this migration ships the MECHANISM and deliberately seeds no limits.
-- Inventing engineering thresholds for a live data centre from a repository is
-- not a judgement call to make on somebody's behalf, and deriving them from the
-- readings themselves would let a room that has been too hot for a month define
-- what normal looks like.
--
-- What it does instead is make the evidence available. parameter_observed_range
-- reports what each reading has actually done — its spread, its middle 90%, how
-- often it was answered 'NA' — so an administrator setting a band in Stage 5 is
-- choosing against the record rather than guessing.
--
-- WHY A WARN BAND AND NOT JUST MIN/MAX
-- A reading is currently either inside its limits or outside them, so the red /
-- amber / green the detailed views need cannot be derived and every screen has
-- invented its own — ThermalAnalytics hardcodes "humidity 40-60 is nominal" and
-- a chart axis of 15-30°C, neither from the registry. warn_min and warn_max sit
-- INSIDE the hard band and mean "still acceptable, heading the wrong way".
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. The warning band ────────────────────────────────────────────────────
ALTER TABLE public.equipment_parameters
  ADD COLUMN IF NOT EXISTS warn_min double precision,
  ADD COLUMN IF NOT EXISTS warn_max double precision;

COMMENT ON COLUMN public.equipment_parameters.warn_min IS
  'Lower edge of the acceptable band. Sits at or above min_value: below this is '
  'amber, below min_value is red. NULL means no early warning on the low side.';
COMMENT ON COLUMN public.equipment_parameters.warn_max IS
  'Upper edge of the acceptable band. Sits at or below max_value.';

-- A warning band outside its own hard band would report amber for a reading
-- that is already a breach, which is worse than having no warning at all.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'equipment_parameters_warn_band_check') THEN
    ALTER TABLE public.equipment_parameters
      ADD CONSTRAINT equipment_parameters_warn_band_check CHECK (
        (warn_min IS NULL OR min_value IS NULL OR warn_min >= min_value) AND
        (warn_max IS NULL OR max_value IS NULL OR warn_max <= max_value) AND
        (warn_min IS NULL OR warn_max IS NULL OR warn_min <= warn_max)
      );
  END IF;
END $$;


-- ── 2. One answer to "is this reading all right" ───────────────────────────
CREATE OR REPLACE FUNCTION public.reading_status(
  p_value    double precision,
  p_min      double precision,
  p_max      double precision,
  p_warn_min double precision,
  p_warn_max double precision
) RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    -- No reading, or nothing to judge it against. 'unknown' rather than 'ok',
    -- because a parameter with no limits has not been checked — and showing it
    -- green would say it had.
    WHEN p_value IS NULL THEN NULL
    WHEN p_min IS NULL AND p_max IS NULL
     AND p_warn_min IS NULL AND p_warn_max IS NULL THEN 'unknown'
    WHEN (p_max IS NOT NULL AND p_value > p_max)
      OR (p_min IS NOT NULL AND p_value < p_min) THEN 'breach'
    WHEN (p_warn_max IS NOT NULL AND p_value > p_warn_max)
      OR (p_warn_min IS NOT NULL AND p_value < p_warn_min) THEN 'warn'
    ELSE 'ok'
  END
$$;

COMMENT ON FUNCTION public.reading_status(double precision,double precision,double precision,double precision,double precision) IS
  'breach | warn | ok | unknown | NULL. The single source of red, amber and '
  'green — no screen decides this for itself. ''unknown'' means the parameter '
  'has no band configured, which is not the same as being within one.';


-- ── 3. What a breach was measured against, at the time ─────────────────────
-- Without this, widening a band tomorrow silently rewrites how many breaches
-- happened last month. A signed record cannot move under its own history.
ALTER TABLE public.work_items
  ADD COLUMN IF NOT EXISTS breach_value double precision,
  ADD COLUMN IF NOT EXISTS breach_min   double precision,
  ADD COLUMN IF NOT EXISTS breach_max   double precision;

COMMENT ON COLUMN public.work_items.breach_value IS
  'The reading that raised this job, and the band it was judged against, copied '
  'at the moment it was raised. Retuning the parameter later cannot change what '
  'this job says happened.';

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. EVIDENCE FOR SETTING A BAND
--
-- Not a recommendation — a record. p05/p95 bound the middle 90% of what has
-- actually been read, which is where a sensible band usually starts, but a
-- parameter that has been out of range all month will have an out-of-range
-- p95 and the person setting the limit needs to see that rather than inherit it.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.parameter_observed_range AS
SELECT r.site_uuid,
       r.equipment_id,
       e.name          AS equipment_name,
       e.category,
       rm.room_name,
       r.parameter_name,
       p.display_label,
       p.unit,
       count(*)                                   AS readings,
       count(r.value_num)                         AS numeric_readings,
       count(*) FILTER (WHERE r.value_text = 'NA') AS answered_na,
       min(r.value_num)                           AS observed_min,
       max(r.value_num)                           AS observed_max,
       round(avg(r.value_num)::numeric, 3)        AS observed_avg,
       percentile_cont(0.05) WITHIN GROUP (ORDER BY r.value_num) AS p05,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY r.value_num) AS p95,
       p.min_value, p.warn_min, p.warn_max, p.max_value,
       min(r.target_hour) AS first_seen,
       max(r.target_hour) AS last_seen
  FROM public.readings r
  JOIN public.equipment_registry e ON e.equipment_id = r.equipment_id
  LEFT JOIN public.rooms rm ON rm.id = r.room_id
  LEFT JOIN public.equipment_parameters p
         ON p.equipment_id = r.equipment_id AND p.parameter_name = r.parameter_name
 WHERE r.value_num IS NOT NULL
 GROUP BY r.site_uuid, r.equipment_id, e.name, e.category, rm.room_name,
          r.parameter_name, p.display_label, p.unit,
          p.min_value, p.warn_min, p.warn_max, p.max_value;

COMMENT ON VIEW public.parameter_observed_range IS
  'What each reading has actually done, beside whatever band it is currently '
  'judged against. Evidence for setting a limit, not a suggested one.';


-- ── 5. Self-check ──────────────────────────────────────────────────────────
DO $$
DECLARE v_with_band int; v_total int; v_unknown bigint; v_series int;
BEGIN
  SELECT count(*) FILTER (WHERE min_value IS NOT NULL OR max_value IS NOT NULL),
         count(*)
    INTO v_with_band, v_total
    FROM public.equipment_parameters WHERE is_active AND capture_mode = 'CAPTURED';

  SELECT count(*) INTO v_series FROM public.parameter_observed_range;

  SELECT count(*) INTO v_unknown
    FROM public.readings r
    LEFT JOIN public.equipment_parameters p
           ON p.equipment_id = r.equipment_id AND p.parameter_name = r.parameter_name
   WHERE r.value_num IS NOT NULL
     AND public.reading_status(r.value_num, p.min_value, p.max_value, p.warn_min, p.warn_max) = 'unknown';

  RAISE NOTICE 'limits configured on % of % captured parameters', v_with_band, v_total;
  RAISE NOTICE 'observed-range rows available as evidence: %', v_series;
  RAISE NOTICE 'readings that cannot be judged (no band): %', v_unknown;
  IF v_with_band < 5 THEN
    RAISE NOTICE 'NOTE: with almost no bands set, evaluate_thresholds() will keep finding nothing.';
    RAISE NOTICE '      Red/amber/green stays "unknown" until limits are entered in Stage 5.';
  END IF;
END $$;
