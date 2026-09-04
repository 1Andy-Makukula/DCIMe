-- ═══════════════════════════════════════════════════════════════════════════
-- 20260881_period_review.sql
-- DCIMe V2 — one account of a week or a month, instead of pieces of stories.
--
-- The platform already held every fact this needs. readings_daily and
-- readings_monthly are populated and refreshed hourly by the dcime_rollups
-- cron. There are RPCs for technician activity, late entries, SLA performance
-- and capacity. domain/narrative.ts already writes prose from the same rows a
-- chart is drawn from.
--
-- What was missing was a SPINE — one document with a fixed order that the same
-- period always fills in the same way. The Executive Summary was a snapshot,
-- Shift Reports a list, Technician Analytics a table: three true things that
-- never became one account of the month.
--
-- WHY IT IS ONE FUNCTION RETURNING ONE DOCUMENT
-- A month rendered section by section from the browser is thirty round trips
-- and six chances for two sections to disagree about the window. This reads
-- the rollups once and returns the whole thing, so every figure in the report
-- was computed against the same boundaries.
--
-- WHAT IT WILL NOT DO
-- It does not explain WHY anything moved. It has readings, not causes.
-- Sections report what happened, how far outside, for how long and who was on
-- shift, and leave the cause to the person who can walk in and look.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP FUNCTION IF EXISTS public.get_period_review(uuid, timestamptz, timestamptz);

CREATE FUNCTION public.get_period_review(
  p_site_uuid uuid,
  p_from      timestamptz,
  p_to        timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_actor  text := auth.role();
  v_hours  numeric := GREATEST(1, extract(epoch FROM (p_to - p_from)) / 3600.0);
  v_result jsonb;
BEGIN
  IF v_actor IN ('authenticated', 'anon') THEN
    IF p_site_uuid IS NULL OR p_site_uuid IS DISTINCT FROM public.get_my_site_uuid() THEN
      RAISE EXCEPTION 'Not permitted to read another site'
        USING HINT = 'You can only read the site you are assigned to.';
    END IF;
  END IF;

  WITH
  -- ── 1. Was the site walked ───────────────────────────────────────────────
  rounds AS (
    SELECT count(*)::int                              AS logged,
           count(DISTINCT t.technician_name)::int     AS technicians,
           min(t.target_hour)                         AS first_hour,
           max(t.target_hour)                         AS last_hour
      FROM public.telemetry_logs t
     WHERE t.site_uuid = p_site_uuid
       AND t.asset_id = 'facility_wide'
       AND t.target_hour >= p_from
       AND t.target_hour <  p_to
  ),
  -- ── 2. What happened ─────────────────────────────────────────────────────
  inc AS (
    SELECT count(*)::int                                                AS opened,
           count(*) FILTER (WHERE i.resolved_at IS NOT NULL)::int        AS closed,
           count(*) FILTER (WHERE i.resolved_at IS NULL)::int            AS still_open,
           count(*) FILTER (WHERE lower(i.severity) IN ('high','critical'))::int AS serious,
           round(avg(extract(epoch FROM (i.resolved_at - i.occurred_at)) / 3600.0)
                 FILTER (WHERE i.resolved_at IS NOT NULL)::numeric, 1)   AS mttr_hours
      FROM public.incidents i
     WHERE i.site_uuid = p_site_uuid
       AND i.occurred_at >= p_from
       AND i.occurred_at <  p_to
  ),
  -- ── 3. What the plant did, per system ────────────────────────────────────
  -- Every asset in the category, not a representative one. Grouped by the
  -- registry category so a system that gained a machine mid-period simply has
  -- more rows behind the same line.
  plant AS (
    SELECT er.category                              AS category,
           d.measure                                AS measure,
           count(DISTINCT d.equipment_id)::int      AS assets,
           sum(d.n_numeric)::bigint                 AS readings,
           min(d.min_num)                           AS min_num,
           CASE WHEN sum(d.n_numeric) > 0
                THEN sum(d.sum_num) / sum(d.n_numeric) END AS avg_num,
           max(d.max_num)                           AS max_num,
           sum(d.n_warn)::bigint                    AS warns,
           sum(d.n_breach)::bigint                  AS breaches
      FROM public.readings_daily d
      JOIN public.equipment_registry er
        ON  er.equipment_id = d.equipment_id
        AND er.site_uuid    = d.site_uuid
        AND er.is_active IS NOT FALSE
     WHERE d.site_uuid = p_site_uuid
       AND d.bucket >= p_from
       AND d.bucket <  p_to
     GROUP BY er.category, d.measure
  ),
  -- ── 4. Exceptions ────────────────────────────────────────────────────────
  -- Ranked by how LONG a machine sat outside its limits rather than by how far
  -- it went: a long mild breach is usually the more serious operational fact,
  -- and a peak-ordered list buries it under momentary spikes.
  exceptions AS (
    SELECT er.name              AS asset_name,
           d.equipment_id,
           d.measure,
           sum(d.n_breach)::int AS breach_readings,
           sum(d.n_warn)::int   AS warn_readings,
           min(d.min_num)       AS min_num,
           max(d.max_num)       AS max_num,
           min(d.bucket)        AS first_seen,
           max(d.bucket)        AS last_seen
      FROM public.readings_daily d
      JOIN public.equipment_registry er
        ON  er.equipment_id = d.equipment_id
        AND er.site_uuid    = d.site_uuid
     WHERE d.site_uuid = p_site_uuid
       AND d.bucket >= p_from
       AND d.bucket <  p_to
       AND d.n_breach > 0
     GROUP BY er.name, d.equipment_id, d.measure
     ORDER BY sum(d.n_breach) DESC
     LIMIT 25
  ),
  -- ── 5. Who did the work ──────────────────────────────────────────────────
  techs AS (
    SELECT t.technician_name                        AS name,
           count(*)::int                            AS rounds,
           count(DISTINCT t.target_hour::date)::int AS days
      FROM public.telemetry_logs t
     WHERE t.site_uuid = p_site_uuid
       AND t.asset_id = 'facility_wide'
       AND t.target_hour >= p_from
       AND t.target_hour <  p_to
       AND t.technician_name IS NOT NULL
     GROUP BY t.technician_name
     ORDER BY count(*) DESC
  ),
  vendor_work AS (
    SELECT v.name                    AS vendor,
           count(*)::int             AS incidents
      FROM public.incidents i
      JOIN public.vendors v ON v.id = i.vendor_id
     WHERE i.site_uuid = p_site_uuid
       AND i.occurred_at >= p_from
       AND i.occurred_at <  p_to
     GROUP BY v.name
     ORDER BY count(*) DESC
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'window_from',  p_from,
    'window_to',    p_to,
    'window_hours', round(v_hours, 1),

    'coverage', (
      SELECT jsonb_build_object(
        'rounds_logged',   r.logged,
        -- One facility round an hour is the cadence the site is walked on, so
        -- the window's hours ARE the expectation. Stated rather than assumed,
        -- because a reader has to know what the percentage is a share of.
        'rounds_expected', round(v_hours)::int,
        'coverage_pct',    round(LEAST(100, r.logged / v_hours * 100)::numeric, 1),
        'hours_unlogged',  GREATEST(0, round(v_hours)::int - r.logged),
        'technicians',     r.technicians,
        'first_hour',      r.first_hour,
        'last_hour',       r.last_hour
      ) FROM rounds r
    ),

    'incidents', (SELECT to_jsonb(i) FROM inc i),

    'plant', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.category, p.breaches DESC, p.measure)
        FROM plant p
    ), '[]'::jsonb),

    'exceptions', COALESCE((
      SELECT jsonb_agg(to_jsonb(e) ORDER BY e.breach_readings DESC) FROM exceptions e
    ), '[]'::jsonb),

    'technicians', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.rounds DESC) FROM techs t
    ), '[]'::jsonb),

    'vendors', COALESCE((
      SELECT jsonb_agg(to_jsonb(w) ORDER BY w.incidents DESC) FROM vendor_work w
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END $$;

COMMENT ON FUNCTION public.get_period_review(uuid, timestamptz, timestamptz) IS
  'One account of a period, read from readings_daily and the incident record in '
  'a single call so every figure shares the same window boundaries.';

GRANT EXECUTE ON FUNCTION public.get_period_review(uuid, timestamptz, timestamptz) TO authenticated;

COMMIT;
