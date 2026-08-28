-- ════════════════════════════════════════════════════════════════════════════
-- 20260870_weekly_grain.sql
-- DCIMe V2.1 - the week, which the requirements ask for in three places.
--
-- Grains were hour, day, month, year. Every list of "average / max / min by
-- month, week, day, hour" therefore had a hole in the middle, and a week is the
-- period a shift pattern actually runs on.
--
-- HOW IT IS BUILT
-- By regrouping readings_daily under date_trunc('week', ...) - exactly the
-- trick 'year' already uses over readings_monthly. No new materialized view,
-- nothing extra for the cron to refresh.
--
-- That works because the rollups store SUM and COUNT rather than an average.
-- Summing sums and summing counts across seven days gives the true weighted
-- mean for the week. Had the rollups stored averages, this would have had to
-- average the daily averages - which silently overweights a quiet Sunday
-- against a busy Monday and is wrong by an amount nobody can see.
--
-- Weeks start Monday: date_trunc('week') is ISO-8601.
--
-- Reproduced from the live definition with two edits, so nothing else in the
-- function can drift.
--
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.get_series(p_site_uuid uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_grain text DEFAULT 'day'::text, p_group_by text DEFAULT 'asset'::text, p_parameter_name text DEFAULT NULL::text, p_equipment_id text DEFAULT NULL::text, p_room_id uuid DEFAULT NULL::uuid, p_measure text DEFAULT NULL::text)
 RETURNS TABLE(bucket timestamp with time zone, equipment_id text, parameter_name text, room_id uuid, room_name text, n bigint, n_numeric bigint, n_na bigint, n_zero bigint, avg_num double precision, min_num double precision, max_num double precision, n_warn bigint, n_breach bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor text := auth.role();
BEGIN
  -- Anything arriving over the API is checked. A direct database connection —
  -- psql, the pg_cron refresh, a migration — has no JWT and no auth.role(),
  -- and is trusted by virtue of holding database credentials at all.
  IF v_actor IN ('authenticated', 'anon') THEN
    IF p_site_uuid IS NULL OR p_site_uuid IS DISTINCT FROM public.get_my_site_uuid() THEN
      RAISE EXCEPTION 'Not permitted to read readings for site %', p_site_uuid
        USING HINT = 'You can only read the site you are assigned to.';
    END IF;
  END IF;

  IF p_grain NOT IN ('hour','day','week','month','year') THEN
    RAISE EXCEPTION 'Unknown grain %. Expected hour, day, week, month or year.', p_grain;
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
    SELECT d.site_uuid, d.equipment_id, d.parameter_name, d.measure, d.room_id,
           -- A week is the daily rollup regrouped, the same way a year is the
           -- monthly one. No new matview: sums and counts add across days, so
           -- the weekly average stays a true weighted mean rather than an
           -- average of daily averages.
           CASE WHEN p_grain = 'week' THEN date_trunc('week', d.bucket) ELSE d.bucket END,
           d.n, d.n_numeric, d.n_na, d.n_zero, d.sum_num, d.min_num, d.max_num,
           d.n_warn, d.n_breach
      FROM public.readings_daily d
     WHERE p_grain IN ('day','week')
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
END $function$;

COMMIT;

DO $$
DECLARE v_site uuid; r record;
BEGIN
  SELECT id INTO v_site FROM public.sites WHERE site_code = 'SITE_01';
  FOR r IN
    SELECT g AS grain,
           (SELECT count(*) FROM public.get_series(
              v_site, now() - interval '90 days', now(), g, 'room', NULL, NULL, NULL,
              'return_temp_actual')) AS rows
      FROM unnest(ARRAY['hour','day','week','month','year']) g
  LOOP
    RAISE NOTICE 'grain % -> % rows', r.grain, r.rows;
  END LOOP;
END $$;
