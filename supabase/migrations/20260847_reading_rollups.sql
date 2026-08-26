-- ═══════════════════════════════════════════════════════════════════════════
-- 20260847_reading_rollups.sql
-- DCIMe V2.1 — Stage 3: aggregation moves into the database.
--
-- WHAT IT REPLACES
-- Every statistic on every screen is currently computed in the browser from raw
-- rows: useExecutiveSummary selects (target_hour, metrics) and averages in JS,
-- useDashboardData selects '*' capped at MAX_ROWS_PER_FETCH = 3000. A year of
-- hourly readings for one site is roughly a million rows, so the monthly and
-- yearly views cannot be built that way — they would silently truncate and
-- report a confident wrong number.
--
-- SUM AND COUNT, NOT AVERAGE
-- Each rollup stores sum_num and n_numeric rather than an average, so a higher
-- grain can be derived correctly. The average of daily averages is NOT the
-- monthly average unless every day has the same number of readings, and capture
-- here is irregular — between 1 and 17 readings a day. Monthly avg is
-- sum(sum_num) / sum(n_numeric), which is right whatever the gaps look like.
--
-- 'NA' IS COUNTED, NOT AVERAGED
-- A technician answering 'not available' is a fact about the round. n_na keeps
-- it visible without letting it near the arithmetic.
--
-- BREACH COUNTS MOVE WITH THE BAND
-- n_warn and n_breach are computed against the limits AS AT THE LAST REFRESH.
-- Retuning a parameter changes them on the next refresh, which is right for an
-- aggregate view and wrong for a signed record — that is why work_items stamps
-- its own breach_value/min/max instead of reading them back from here.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Daily ───────────────────────────────────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS public.readings_monthly CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.readings_daily CASCADE;

CREATE MATERIALIZED VIEW public.readings_daily AS
SELECT r.site_uuid,
       r.equipment_id,
       r.parameter_name,
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

-- REFRESH CONCURRENTLY needs a unique index, and without CONCURRENTLY a refresh
-- takes an exclusive lock — which would blank the dashboard for whoever is
-- looking at it while the scheduled job runs.
CREATE UNIQUE INDEX IF NOT EXISTS uq_readings_daily
  ON public.readings_daily (site_uuid, equipment_id, parameter_name, bucket);
CREATE INDEX IF NOT EXISTS idx_readings_daily_series
  ON public.readings_daily (site_uuid, parameter_name, bucket DESC);
CREATE INDEX IF NOT EXISTS idx_readings_daily_room
  ON public.readings_daily (site_uuid, room_id, bucket DESC) WHERE room_id IS NOT NULL;

COMMENT ON MATERIALIZED VIEW public.readings_daily IS
  'One row per asset-parameter per day. Stores sum and count, never an average, '
  'so coarser grains re-aggregate correctly across uneven capture.';


-- ── 2. Monthly ─────────────────────────────────────────────────────────────
-- Built from the daily rollup rather than from raw readings: same answer, a
-- thirtieth of the work, and it cannot disagree with the grain below it.
CREATE MATERIALIZED VIEW public.readings_monthly AS
SELECT d.site_uuid,
       d.equipment_id,
       d.parameter_name,
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
 GROUP BY d.site_uuid, d.equipment_id, d.parameter_name, d.room_id,
          date_trunc('month', d.bucket);

CREATE UNIQUE INDEX IF NOT EXISTS uq_readings_monthly
  ON public.readings_monthly (site_uuid, equipment_id, parameter_name, bucket);
CREATE INDEX IF NOT EXISTS idx_readings_monthly_series
  ON public.readings_monthly (site_uuid, parameter_name, bucket DESC);

COMMENT ON MATERIALIZED VIEW public.readings_monthly IS
  'One row per asset-parameter per month, derived from readings_daily. '
  'n_technicians is the busiest day''s count, not a distinct monthly total — '
  'the daily grain cannot carry identities forward.';

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. REFRESH
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

CREATE OR REPLACE FUNCTION public.refresh_reading_rollups()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz := clock_timestamp();
  v_daily bigint;
  v_month bigint;
BEGIN
  -- Order matters: monthly reads daily.
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.readings_daily;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.readings_monthly;

  SELECT count(*) INTO v_daily FROM public.readings_daily;
  SELECT count(*) INTO v_month FROM public.readings_monthly;

  RETURN format('%s daily, %s monthly, in %s',
                v_daily, v_month,
                justify_interval(clock_timestamp() - v_start));
END $$;

COMMENT ON FUNCTION public.refresh_reading_rollups() IS
  'Rebuilds both rollups, daily first. CONCURRENTLY throughout so a dashboard '
  'being read while this runs does not go blank.';

GRANT EXECUTE ON FUNCTION public.refresh_reading_rollups() TO authenticated;

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. ONE WAY TO ASK FOR A SERIES
--
-- Every chart, table and printed figure goes through this. The grain chooses
-- the source, so asking for a year of monthly data reads twelve rows per
-- parameter rather than eight thousand.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

-- Argument order matters here: p_equipment_id (text) precedes p_room_id
-- (uuid). A transposed signature makes the DROP a silent no-op and the
-- CREATE below collide instead of replacing.
DROP FUNCTION IF EXISTS public.get_series(uuid, timestamptz, timestamptz, text, text, text, text, uuid);

CREATE FUNCTION public.get_series(
  p_site_uuid      uuid,
  p_from           timestamptz,
  p_to             timestamptz,
  p_grain          text DEFAULT 'day',      -- hour | day | month | year
  p_group_by       text DEFAULT 'asset',    -- asset | room | site
  p_parameter_name text DEFAULT NULL,
  p_equipment_id   text DEFAULT NULL,
  p_room_id        uuid DEFAULT NULL
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
    -- Hour comes from the readings themselves; there is no rollup below the
    -- grain the data is captured at.
    SELECT r.site_uuid, r.equipment_id, r.parameter_name, r.room_id,
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
    SELECT d.site_uuid, d.equipment_id, d.parameter_name, d.room_id, d.bucket,
           d.n, d.n_numeric, d.n_na, d.sum_num, d.min_num, d.max_num, d.n_warn, d.n_breach
      FROM public.readings_daily d
     WHERE p_grain = 'day'
       AND d.site_uuid = p_site_uuid
       AND d.bucket >= p_from AND d.bucket < p_to

    UNION ALL
    -- Year re-buckets the monthly rollup rather than having a third view: twelve
    -- rows per parameter is nothing to group, and one fewer thing to refresh.
    SELECT m.site_uuid, m.equipment_id, m.parameter_name, m.room_id,
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
  )
  SELECT f.bucket,
         CASE WHEN p_group_by = 'asset' THEN f.equipment_id   END,
         CASE WHEN p_group_by = 'asset' THEN f.parameter_name END,
         CASE WHEN p_group_by = 'room'  THEN f.room_id        END,
         CASE WHEN p_group_by = 'room'  THEN rm.room_name     END,
         -- sum() over bigint returns numeric in Postgres; the declared return
         -- type is bigint, and the mismatch is only caught at execution.
         sum(f.n)::bigint, sum(f.n_numeric)::bigint, sum(f.n_na)::bigint,
         -- The whole reason sum and count are stored separately: this is the
         -- true mean over the window, not a mean of means.
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

COMMENT ON FUNCTION public.get_series(uuid,timestamptz,timestamptz,text,text,text,text,uuid) IS
  'One series over a window, at hour, day, month or year grain, grouped by '
  'asset, room or site. The single entry point for every chart and every '
  'printed figure — nothing computes an average client-side.';

GRANT EXECUTE ON FUNCTION public.get_series(uuid,timestamptz,timestamptz,text,text,text,text,uuid) TO authenticated;

COMMIT;


-- ── 5. First build + self-check ────────────────────────────────────────────
DO $$
DECLARE v_msg text;
BEGIN
  -- CONCURRENTLY cannot populate a view that has never been filled, so the very
  -- first build is a plain refresh.
  REFRESH MATERIALIZED VIEW public.readings_daily;
  REFRESH MATERIALIZED VIEW public.readings_monthly;
  SELECT public.refresh_reading_rollups() INTO v_msg;
  RAISE NOTICE 'rollups: %', v_msg;
END $$;
