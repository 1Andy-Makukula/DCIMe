-- ═══════════════════════════════════════════════════════════════════════════
-- 20260855_parameter_measure.sql
-- DCIMe V2.1 — Stage 7: asking for a measure rather than a parameter.
--
-- THE PROBLEM
-- Parameter names carry the asset inside them. The three air conditioners in
-- HQ EM record humidity as three different parameters:
--
--     pac_hq_em1_humidity_actual
--     pac_hq_em2_humidity_actual
--     pac_hq_em3_humidity_actual
--
-- 503 of the 545 registered parameters are named <equipment_id>_<measure> this
-- way. get_series filters on ONE exact parameter_name, so "the average humidity
-- in HQ EM" — the question the detail screens exist to answer, and the one
-- asked for explicitly ("we need to be calculating the average for each room")
-- — cannot currently be expressed. Grouping by room while filtered to a single
-- parameter returns a single asset, which looks like an answer and is not one.
--
-- THE FIX
-- Record the measure — the parameter name with its asset prefix removed — and
-- let a caller filter by it. Then one request covers every air conditioner in
-- the building and the room grouping means what it says.
--
-- WHY A STORED COLUMN AND NOT A VIEW
-- It has to be filterable and indexable inside the rollups, which are
-- materialized. Recomputing the strip per row at query time would work and
-- would also make the column invisible to Inventory, where a person now edits
-- parameters and should be able to see what a parameter is grouped as.
--
-- THE 42 EXCEPTIONS
-- grid_main, fuel_tank_main, room_data_ambient and a few others do not embed
-- their equipment_id (grid_voltage_r, not grid_main_voltage_r). Every one of
-- them is the ONLY asset of its kind, so there is nothing to group them with
-- and measure simply equals the parameter name. No exception list needed.
--
-- starts_with(), not LIKE: in LIKE, '_' is a single-character wildcard, so
-- equipment_id || '_%' would also match names that merely resemble the prefix.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. The column ──────────────────────────────────────────────────────────
ALTER TABLE public.equipment_parameters
  ADD COLUMN IF NOT EXISTS measure text;

CREATE OR REPLACE FUNCTION public.derive_measure(p_equipment_id text, p_parameter_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_equipment_id IS NULL THEN p_parameter_name
    WHEN starts_with(p_parameter_name, p_equipment_id || '_')
      THEN substr(p_parameter_name, length(p_equipment_id) + 2)
    ELSE p_parameter_name
  END
$$;

COMMENT ON FUNCTION public.derive_measure(text, text) IS
  'The parameter name with its asset prefix stripped: what is being measured, '
  'independent of which machine measured it. Falls back to the whole name for '
  'the single-instance assets that do not embed their id.';

UPDATE public.equipment_parameters
   SET measure = public.derive_measure(equipment_id, parameter_name)
 WHERE measure IS DISTINCT FROM public.derive_measure(equipment_id, parameter_name);

ALTER TABLE public.equipment_parameters
  ALTER COLUMN measure SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_equipment_parameters_measure
  ON public.equipment_parameters (measure);

COMMENT ON COLUMN public.equipment_parameters.measure IS
  'What this parameter measures, without the asset prefix — humidity_actual '
  'rather than pac_hq_em1_humidity_actual. Maintained by trigger; the grouping '
  'key for every cross-asset average.';


-- ── 2. Keep it true ────────────────────────────────────────────────────────
-- A parameter added through Inventory must get its measure without the caller
-- knowing this column exists.
CREATE OR REPLACE FUNCTION public.set_parameter_measure()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.measure := public.derive_measure(NEW.equipment_id, NEW.parameter_name);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_parameter_measure ON public.equipment_parameters;
CREATE TRIGGER trg_set_parameter_measure
  BEFORE INSERT OR UPDATE OF equipment_id, parameter_name
  ON public.equipment_parameters
  FOR EACH ROW EXECUTE FUNCTION public.set_parameter_measure();

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. The rollups carry it too
--
-- Rebuilt rather than joined at query time: the join would run on every chart
-- request against a matview that exists precisely to avoid per-request work.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

DROP MATERIALIZED VIEW IF EXISTS public.readings_monthly CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.readings_daily CASCADE;

CREATE MATERIALIZED VIEW public.readings_daily AS
SELECT r.site_uuid,
       r.equipment_id,
       r.parameter_name,
       public.derive_measure(r.equipment_id, r.parameter_name) AS measure,
       r.room_id,
       date_trunc('day', r.target_hour) AS bucket,
       count(*)                                        AS n,
       count(r.value_num)                              AS n_numeric,
       count(*) FILTER (WHERE r.value_text = 'NA')     AS n_na,
       sum(r.value_num)                                AS sum_num,
       min(r.value_num)                                AS min_num,
       max(r.value_num)                                AS max_num,
       count(*) FILTER (WHERE public.reading_status(
         r.value_num, p.min_value, p.max_value, p.warn_min, p.warn_max) = 'warn')   AS n_warn,
       count(*) FILTER (WHERE public.reading_status(
         r.value_num, p.min_value, p.max_value, p.warn_min, p.warn_max) = 'breach') AS n_breach,
       count(DISTINCT r.technician_id)                 AS n_technicians
  FROM public.readings r
  LEFT JOIN public.equipment_parameters p
         ON p.equipment_id = r.equipment_id AND p.parameter_name = r.parameter_name
 GROUP BY r.site_uuid, r.equipment_id, r.parameter_name, r.room_id,
          date_trunc('day', r.target_hour);

CREATE UNIQUE INDEX IF NOT EXISTS uq_readings_daily
  ON public.readings_daily (site_uuid, equipment_id, parameter_name, bucket);
CREATE INDEX IF NOT EXISTS idx_readings_daily_series
  ON public.readings_daily (site_uuid, parameter_name, bucket DESC);
CREATE INDEX IF NOT EXISTS idx_readings_daily_measure
  ON public.readings_daily (site_uuid, measure, bucket DESC);
CREATE INDEX IF NOT EXISTS idx_readings_daily_room
  ON public.readings_daily (site_uuid, room_id, bucket DESC) WHERE room_id IS NOT NULL;

COMMENT ON MATERIALIZED VIEW public.readings_daily IS
  'One row per asset-parameter per day. Stores sum and count, never an average, '
  'so coarser grains re-aggregate correctly across uneven capture.';

CREATE MATERIALIZED VIEW public.readings_monthly AS
SELECT d.site_uuid,
       d.equipment_id,
       d.parameter_name,
       d.measure,
       d.room_id,
       date_trunc('month', d.bucket) AS bucket,
       sum(d.n)         AS n,
       sum(d.n_numeric) AS n_numeric,
       sum(d.n_na)      AS n_na,
       sum(d.sum_num)   AS sum_num,
       min(d.min_num)   AS min_num,
       max(d.max_num)   AS max_num,
       sum(d.n_warn)    AS n_warn,
       sum(d.n_breach)  AS n_breach,
       max(d.n_technicians) AS n_technicians
  FROM public.readings_daily d
 GROUP BY d.site_uuid, d.equipment_id, d.parameter_name, d.measure, d.room_id,
          date_trunc('month', d.bucket);

CREATE UNIQUE INDEX IF NOT EXISTS uq_readings_monthly
  ON public.readings_monthly (site_uuid, equipment_id, parameter_name, bucket);
CREATE INDEX IF NOT EXISTS idx_readings_monthly_series
  ON public.readings_monthly (site_uuid, parameter_name, bucket DESC);
CREATE INDEX IF NOT EXISTS idx_readings_monthly_measure
  ON public.readings_monthly (site_uuid, measure, bucket DESC);

COMMENT ON MATERIALIZED VIEW public.readings_monthly IS
  'One row per asset-parameter per month, derived from readings_daily. '
  'n_technicians is the busiest day''s count, not a distinct monthly total — '
  'the daily grain cannot carry identities forward.';

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. get_series learns to filter by measure
--
-- p_measure is appended LAST with a default, so every existing caller — all of
-- which pass arguments by name — keeps working untouched.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

DROP FUNCTION IF EXISTS public.get_series(uuid, timestamptz, timestamptz, text, text, text, text, uuid);

CREATE FUNCTION public.get_series(
  p_site_uuid      uuid,
  p_from           timestamptz,
  p_to             timestamptz,
  p_grain          text DEFAULT 'day',      -- hour | day | month | year
  p_group_by       text DEFAULT 'asset',    -- asset | room | site
  p_parameter_name text DEFAULT NULL,
  p_equipment_id   text DEFAULT NULL,
  p_room_id        uuid DEFAULT NULL,
  p_measure        text DEFAULT NULL
)
RETURNS TABLE (
  bucket         timestamptz,
  equipment_id   text,
  parameter_name text,
  room_id        uuid,
  room_name      text,
  n              bigint,
  n_numeric      bigint,
  n_na           bigint,
  avg_num        double precision,
  min_num        double precision,
  max_num        double precision,
  n_warn         bigint,
  n_breach       bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_grain NOT IN ('hour','day','month','year') THEN
    RAISE EXCEPTION 'Unknown grain %. Expected hour, day, month or year.', p_grain;
  END IF;
  IF p_group_by NOT IN ('asset','room','site') THEN
    RAISE EXCEPTION 'Unknown grouping %. Expected asset, room or site.', p_group_by;
  END IF;

  RETURN QUERY
  WITH src AS (
    SELECT r.site_uuid, r.equipment_id, r.parameter_name,
           public.derive_measure(r.equipment_id, r.parameter_name) AS measure,
           r.room_id,
           date_trunc('hour', r.target_hour) AS bucket,
           1::bigint AS n,
           (r.value_num IS NOT NULL)::int::bigint AS n_numeric,
           (r.value_text = 'NA')::int::bigint     AS n_na,
           r.value_num AS sum_num, r.value_num AS min_num, r.value_num AS max_num,
           (public.reading_status(r.value_num, p.min_value, p.max_value,
                                  p.warn_min, p.warn_max) = 'warn')::int::bigint   AS n_warn,
           (public.reading_status(r.value_num, p.min_value, p.max_value,
                                  p.warn_min, p.warn_max) = 'breach')::int::bigint AS n_breach
      FROM public.readings r
      LEFT JOIN public.equipment_parameters p
             ON p.equipment_id = r.equipment_id AND p.parameter_name = r.parameter_name
     WHERE p_grain = 'hour'
       AND r.site_uuid = p_site_uuid
       AND r.target_hour >= p_from AND r.target_hour < p_to

    UNION ALL
    SELECT d.site_uuid, d.equipment_id, d.parameter_name, d.measure, d.room_id, d.bucket,
           d.n, d.n_numeric, d.n_na, d.sum_num, d.min_num, d.max_num, d.n_warn, d.n_breach
      FROM public.readings_daily d
     WHERE p_grain = 'day'
       AND d.site_uuid = p_site_uuid
       AND d.bucket >= p_from AND d.bucket < p_to

    UNION ALL
    SELECT m.site_uuid, m.equipment_id, m.parameter_name, m.measure, m.room_id,
           CASE WHEN p_grain = 'year' THEN date_trunc('year', m.bucket) ELSE m.bucket END,
           m.n, m.n_numeric, m.n_na, m.sum_num, m.min_num, m.max_num, m.n_warn, m.n_breach
      FROM public.readings_monthly m
     WHERE p_grain IN ('month','year')
       AND m.site_uuid = p_site_uuid
       AND m.bucket >= p_from AND m.bucket < p_to
  ),
  filtered AS (
    SELECT * FROM src s
     WHERE (p_parameter_name IS NULL OR s.parameter_name = p_parameter_name)
       AND (p_equipment_id   IS NULL OR s.equipment_id   = p_equipment_id)
       AND (p_room_id        IS NULL OR s.room_id        = p_room_id)
       AND (p_measure        IS NULL OR s.measure        = p_measure)
  )
  SELECT f.bucket,
         CASE WHEN p_group_by = 'asset' THEN f.equipment_id   END,
         CASE WHEN p_group_by = 'asset' THEN f.parameter_name END,
         CASE WHEN p_group_by = 'room'  THEN f.room_id        END,
         CASE WHEN p_group_by = 'room'  THEN rm.room_name     END,
         sum(f.n)::bigint, sum(f.n_numeric)::bigint, sum(f.n_na)::bigint,
         CASE WHEN sum(f.n_numeric) > 0
              THEN sum(f.sum_num) / sum(f.n_numeric) END,
         min(f.min_num), max(f.max_num),
         sum(f.n_warn)::bigint, sum(f.n_breach)::bigint
    FROM filtered f
    LEFT JOIN public.rooms rm ON rm.id = f.room_id
   GROUP BY f.bucket,
            CASE WHEN p_group_by = 'asset' THEN f.equipment_id   END,
            CASE WHEN p_group_by = 'asset' THEN f.parameter_name END,
            CASE WHEN p_group_by = 'room'  THEN f.room_id        END,
            CASE WHEN p_group_by = 'room'  THEN rm.room_name     END
   ORDER BY 1, 2, 3, 5;
END $$;

COMMENT ON FUNCTION public.get_series(uuid,timestamptz,timestamptz,text,text,text,text,uuid,text) IS
  'One series over a window, at hour, day, month or year grain, grouped by '
  'asset, room or site. Filter by p_parameter_name for one asset''s reading, or '
  'by p_measure to span every asset that records the same thing. The single '
  'entry point for every chart and every printed figure.';

GRANT EXECUTE ON FUNCTION
  public.get_series(uuid,timestamptz,timestamptz,text,text,text,text,uuid,text)
  TO authenticated;

COMMIT;


-- ── 5. Rebuild + self-check ────────────────────────────────────────────────
DO $$
DECLARE
  v_msg     text;
  v_unnamed bigint;
  v_shared  bigint;
BEGIN
  REFRESH MATERIALIZED VIEW public.readings_daily;
  REFRESH MATERIALIZED VIEW public.readings_monthly;
  SELECT public.refresh_reading_rollups() INTO v_msg;
  RAISE NOTICE 'rollups: %', v_msg;

  SELECT count(*) INTO v_unnamed
    FROM public.equipment_parameters WHERE measure IS NULL OR measure = '';
  IF v_unnamed > 0 THEN
    RAISE EXCEPTION 'measure came out empty for % parameters', v_unnamed;
  END IF;

  SELECT count(*) INTO v_shared FROM (
    SELECT measure FROM public.equipment_parameters
     WHERE capture_mode = 'CAPTURED'
     GROUP BY measure HAVING count(DISTINCT equipment_id) > 1
  ) s;
  RAISE NOTICE '% measures are recorded by more than one asset', v_shared;
END $$;
