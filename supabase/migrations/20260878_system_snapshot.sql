-- ═══════════════════════════════════════════════════════════════════════════
-- 20260878_system_snapshot.sql
-- DCIMe V2 — every system's current position, in one round trip.
--
-- The Overview showed a thermal bar chart and nothing else about the plant.
-- UPS, rectifiers, generators and the utility feed — the four systems an
-- operator is actually answerable for — had no presence on the landing screen
-- at all, and the space under the thermal card sat empty.
--
-- Answering that per category on the client would mean four copies of the
-- category-detail machinery (registry parameters, measure volumes, series) on
-- the one screen that has to open fast. This returns the whole grid — every
-- category, every measure it captured in the window — as about fifty rows.
--
-- WHICH MEASURE IS THE HEADLINE IS NOT DECIDED HERE
-- Picking by reading count would make AIRCON's headline `humidity_actual`
-- (330 readings) over `return_temp_actual` (288), which is not what anyone
-- means by "how is the cooling doing". That judgement lives in
-- domain/categories.ts next to the labels, and the client selects the row it
-- wants from what this returns.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP FUNCTION IF EXISTS public.get_system_snapshot(uuid, timestamptz);

CREATE FUNCTION public.get_system_snapshot(
  p_site_uuid uuid,
  p_since     timestamptz
)
RETURNS TABLE (
  category           text,
  measure            text,
  unit               text,
  assets_registered  bigint,
  assets_reporting   bigint,
  n_numeric          bigint,
  min_num            double precision,
  avg_num            double precision,
  max_num            double precision,
  n_breach           bigint,
  n_warn             bigint,
  last_reading       timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_actor text := auth.role();
BEGIN
  -- SECURITY DEFINER bypasses RLS, so the site scope is enforced here — the
  -- same guard get_measure_volumes and get_technician_activity use.
  IF v_actor IN ('authenticated', 'anon') THEN
    IF p_site_uuid IS NULL OR p_site_uuid IS DISTINCT FROM public.get_my_site_uuid() THEN
      RAISE EXCEPTION 'Not permitted to read readings for site %', p_site_uuid
        USING HINT = 'You can only read the site you are assigned to.';
    END IF;
  END IF;

  RETURN QUERY
  WITH registered AS (
    -- The denominator is the registry, not the readings: a system where half
    -- the machines stopped reporting must not look complete.
    SELECT er.category AS cat, count(*)::bigint AS n_assets
      FROM public.equipment_registry er
     WHERE er.site_uuid = p_site_uuid
       AND er.is_active IS NOT FALSE
     GROUP BY er.category
  ),
  scoped AS (
    SELECT er.category                                            AS cat,
           public.derive_measure(r.equipment_id, r.parameter_name) AS meas,
           r.equipment_id,
           r.value_num,
           r.target_hour,
           p.unit,
           public.reading_status(r.value_num, p.min_value, p.max_value,
                                 p.warn_min, p.warn_max)          AS status
      FROM public.readings r
      JOIN public.equipment_registry er
        ON  er.equipment_id = r.equipment_id
        AND er.site_uuid    = r.site_uuid
        AND er.is_active IS NOT FALSE
      LEFT JOIN public.equipment_parameters p
        ON  p.equipment_id   = r.equipment_id
        AND p.parameter_name = r.parameter_name
     WHERE r.site_uuid = p_site_uuid
       AND r.target_hour >= p_since
       AND r.value_num IS NOT NULL
  )
  SELECT s.cat,
         s.meas,
         -- Assets can disagree about the unit string; the commonest wins, so a
         -- single mislabelled parameter cannot rename the whole measure.
         (SELECT u.unit FROM scoped u
           WHERE u.cat = s.cat AND u.meas = s.meas AND u.unit IS NOT NULL
           GROUP BY u.unit ORDER BY count(*) DESC LIMIT 1)         AS unit,
         COALESCE(reg.n_assets, 0)                                 AS assets_registered,
         count(DISTINCT s.equipment_id)::bigint                    AS assets_reporting,
         count(s.value_num)::bigint                                AS n_numeric,
         min(s.value_num)                                          AS min_num,
         avg(s.value_num)                                          AS avg_num,
         max(s.value_num)                                          AS max_num,
         count(*) FILTER (WHERE s.status = 'breach')::bigint       AS n_breach,
         count(*) FILTER (WHERE s.status = 'warn')::bigint         AS n_warn,
         max(s.target_hour)                                        AS last_reading
    FROM scoped s
    LEFT JOIN registered reg ON reg.cat = s.cat
   GROUP BY s.cat, s.meas, reg.n_assets;
END $$;

COMMENT ON FUNCTION public.get_system_snapshot(uuid, timestamptz) IS
  'One row per registry category and measure captured since p_since, with the '
  'registry asset count as the denominator. Which measure heads a system is a '
  'presentation decision and lives in domain/categories.ts.';

GRANT EXECUTE ON FUNCTION public.get_system_snapshot(uuid, timestamptz) TO authenticated;

COMMIT;
