-- ═══════════════════════════════════════════════════════════════════════════
-- 20260856_count_zeros.sql
-- DCIMe V2.1 — Stage 7: making an exact zero countable.
--
-- WHAT WAS FOUND
-- Exact zeros are not rare, and they are not evenly spread:
--
--     FUEL_LOGISTICS    707 of   709 numeric readings   99.7%
--     GENERATOR         372 of   752                    49.5%
--     ENVIRONMENT       631 of  2758                    22.9%
--     AIRCON           1784 of 23225                     7.7%
--     MAINS, UPS, RECTIFIER                    0          0.0%
--
-- Excluding them moves the site return-air average from 18.80 to 19.46 °C.
--
-- WHY THEY ARE NOT SIMPLY STRIPPED
-- Some zeros are true. A generator that did not run burned zero litres and
-- turned for zero hours; that is a fact, and discarding it would overstate
-- every generator average by pretending the quiet days never happened. Others
-- are plainly false: a 0.0 °C return-air temperature in a data hall is a blank
-- box that got saved as a number.
--
-- Nothing in this schema can tell those two apart — but an operating limit can.
-- A return-air parameter with min_value = 10 makes its own zeros breaches
-- automatically, and reading_status() already flags them. That is the real fix,
-- and it is blocked on the operating limits being set (1 of 187 parameters has
-- them today).
--
-- So this migration does the one honest thing available: it COUNTS them, and
-- lets every screen say "17 of these 231 readings were exactly zero" instead of
-- quietly folding them into an average. Visible beats clever.
--
-- Idempotent: safe to re-run.
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
       count(*) FILTER (WHERE r.value_num = 0)         AS n_zero,
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
  'so coarser grains re-aggregate correctly across uneven capture. n_zero is '
  'reported separately because an exact zero is often a blank box, not a value.';

CREATE MATERIALIZED VIEW public.readings_monthly AS
SELECT d.site_uuid, d.equipment_id, d.parameter_name, d.measure, d.room_id,
       date_trunc('month', d.bucket) AS bucket,
       sum(d.n)         AS n,
       sum(d.n_numeric) AS n_numeric,
       sum(d.n_na)      AS n_na,
       sum(d.n_zero)    AS n_zero,
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
  'One row per asset-parameter per month, derived from readings_daily.';

COMMIT;


BEGIN;

DROP FUNCTION IF EXISTS public.get_series(uuid, timestamptz, timestamptz, text, text, text, text, uuid, text);

CREATE FUNCTION public.get_series(
  p_site_uuid      uuid,
  p_from           timestamptz,
  p_to             timestamptz,
  p_grain          text DEFAULT 'day',
  p_group_by       text DEFAULT 'asset',
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
  n_zero         bigint,
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
           (r.value_num = 0)::int::bigint         AS n_zero,
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
           d.n, d.n_numeric, d.n_na, d.n_zero, d.sum_num, d.min_num, d.max_num,
           d.n_warn, d.n_breach
      FROM public.readings_daily d
     WHERE p_grain = 'day'
       AND d.site_uuid = p_site_uuid
       AND d.bucket >= p_from AND d.bucket < p_to

    UNION ALL
    SELECT m.site_uuid, m.equipment_id, m.parameter_name, m.measure, m.room_id,
           CASE WHEN p_grain = 'year' THEN date_trunc('year', m.bucket) ELSE m.bucket END,
           m.n, m.n_numeric, m.n_na, m.n_zero, m.sum_num, m.min_num, m.max_num,
           m.n_warn, m.n_breach
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
         sum(f.n_zero)::bigint,
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
  'by p_measure to span every asset that records the same thing. n_zero counts '
  'exact zeros so a screen can report them rather than average them in silence.';

GRANT EXECUTE ON FUNCTION
  public.get_series(uuid,timestamptz,timestamptz,text,text,text,text,uuid,text)
  TO authenticated;

COMMIT;


DO $$
DECLARE v_msg text;
BEGIN
  REFRESH MATERIALIZED VIEW public.readings_daily;
  REFRESH MATERIALIZED VIEW public.readings_monthly;
  SELECT public.refresh_reading_rollups() INTO v_msg;
  RAISE NOTICE 'rollups: %', v_msg;
END $$;
