-- ═══════════════════════════════════════════════════════════════════════════
-- 20260857_rollups_enforce_site.sql
-- DCIMe V2.1 — Stage 7: closing the way round row-level security.
--
-- WHAT WAS FOUND
-- readings has RLS, and its policy is exactly right:
--
--     site_uuid = get_my_site_uuid()
--
-- The rollups built on top of it have no such protection. A materialized view
-- cannot carry RLS at all, and both had been left with Supabase's default
-- grants:
--
--     readings_daily    anon=arwdDxtm  authenticated=arwdDxtm
--     readings_monthly  anon=arwdDxtm  authenticated=arwdDxtm
--
-- PostgREST publishes materialized views as readable endpoints. So every
-- reading for every site — daily and monthly, with technician counts — was
-- reachable by anyone holding the public anon key, while the table underneath
-- was correctly locked down. The aggregate laundered the very restriction the
-- base table enforces.
--
-- This is NOT the same as the blanket grants on the 40 ordinary tables. Those
-- are Supabase's standard posture and RLS makes them safe; they are left
-- exactly as they are. A materialized view has no RLS to fall back on, which is
-- what makes these two different.
--
-- THE FIX
-- Take the grants away, and let the one function that legitimately needs them
-- keep reading — as SECURITY DEFINER, with the site check written into it. The
-- guard has to be explicit precisely BECAUSE definer's rights turn off the RLS
-- that was doing the work before.
--
-- Every employee, admins included, belongs to exactly one site, so
-- get_my_site_uuid() is the whole rule. anon has no employee row, so the
-- function returns NULL, every comparison fails, and anonymous callers are shut
-- out completely rather than merely narrowed.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Take back the rollups ───────────────────────────────────────────────
REVOKE ALL ON public.readings_daily   FROM anon, authenticated;
REVOKE ALL ON public.readings_monthly FROM anon, authenticated;

-- service_role is the trusted server-side key and keeps its access; nothing
-- reaches it from a browser.
GRANT SELECT ON public.readings_daily   TO service_role;
GRANT SELECT ON public.readings_monthly TO service_role;

COMMENT ON MATERIALIZED VIEW public.readings_daily IS
  'One row per asset-parameter per day. Stores sum and count, never an average. '
  'NOT readable directly by anon or authenticated — a matview cannot enforce '
  'row-level security, so reach it through get_series(), which checks the site.';

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. get_series becomes the guarded door
-- ═══════════════════════════════════════════════════════════════════════════
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
-- DEFINER so it can read the rollups the caller no longer can. Everything the
-- caller is allowed to see is decided by the guard immediately below.
SECURITY DEFINER
SET search_path = public
AS $$
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
  'by p_measure to span every asset that records the same thing. SECURITY '
  'DEFINER so it can read the rollups, which callers cannot; it refuses any '
  'site other than the caller''s own.';

GRANT EXECUTE ON FUNCTION
  public.get_series(uuid,timestamptz,timestamptz,text,text,text,text,uuid,text)
  TO authenticated;

-- anon is not given execute. There is no anonymous view of operational data.
REVOKE EXECUTE ON FUNCTION
  public.get_series(uuid,timestamptz,timestamptz,text,text,text,text,uuid,text)
  FROM anon;

COMMIT;


-- ── 3. Self-check ──────────────────────────────────────────────────────────
DO $$
DECLARE
  v_daily_anon boolean;
  v_auth_ok    boolean;
BEGIN
  v_daily_anon := has_table_privilege('anon', 'public.readings_daily', 'SELECT');
  IF v_daily_anon THEN
    RAISE EXCEPTION 'anon can still read readings_daily';
  END IF;

  v_auth_ok := has_function_privilege('authenticated',
    'public.get_series(uuid,timestamptz,timestamptz,text,text,text,text,uuid,text)', 'EXECUTE');
  IF NOT v_auth_ok THEN
    RAISE EXCEPTION 'authenticated lost execute on get_series';
  END IF;

  RAISE NOTICE 'rollups are private; get_series is the guarded way in';
END $$;
