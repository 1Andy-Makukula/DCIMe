-- ═══════════════════════════════════════════════════════════════════════════
-- 20260858_measure_volumes.sql
-- DCIMe V2.1 — Stage 7: opening a screen onto something worth looking at.
--
-- WHAT WAS WRONG
-- The category screen picks its default measure from the registry: chartable
-- first, then genuinely captured, then whichever the most assets record. On
-- Generators that lands on batt_voltage — five assets, and FOUR readings in the
-- entire history — while the category as a whole holds 6,524. The screen would
-- open on an empty chart and look broken.
--
-- The registry knows what COULD be recorded. It has no idea what actually was.
-- Only the readings know that, and the picker could not see them.
--
-- WHAT THIS ADDS
-- One call returning, per measure, how much was actually captured in the window
-- being viewed — so the default is the measure with data in front of the person
-- right now, and the picker can show counts instead of making them guess which
-- entries are populated.
--
-- Counted from readings rather than the daily rollup so a window shorter than a
-- day still answers correctly.
--
-- Same guard as get_series: definer's rights, and a caller may only ask about
-- their own site.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP FUNCTION IF EXISTS public.get_measure_volumes(uuid, timestamptz, timestamptz, text[]);

CREATE FUNCTION public.get_measure_volumes(
  p_site_uuid  uuid,
  p_from       timestamptz,
  p_to         timestamptz,
  p_categories text[] DEFAULT NULL
)
RETURNS TABLE (
  measure     text,
  n           bigint,
  n_numeric   bigint,
  n_zero      bigint,
  assets      bigint,
  rooms       bigint,
  last_seen   timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor text := auth.role();
BEGIN
  IF v_actor IN ('authenticated', 'anon') THEN
    IF p_site_uuid IS NULL OR p_site_uuid IS DISTINCT FROM public.get_my_site_uuid() THEN
      RAISE EXCEPTION 'Not permitted to read readings for site %', p_site_uuid
        USING HINT = 'You can only read the site you are assigned to.';
    END IF;
  END IF;

  RETURN QUERY
  SELECT public.derive_measure(r.equipment_id, r.parameter_name) AS measure,
         count(*)::bigint                          AS n,
         count(r.value_num)::bigint                AS n_numeric,
         count(*) FILTER (WHERE r.value_num = 0)::bigint AS n_zero,
         count(DISTINCT r.equipment_id)::bigint    AS assets,
         count(DISTINCT r.room_id)::bigint         AS rooms,
         max(r.target_hour)                        AS last_seen
    FROM public.readings r
    JOIN public.equipment_registry er ON er.equipment_id = r.equipment_id
   WHERE r.site_uuid = p_site_uuid
     AND r.target_hour >= p_from AND r.target_hour < p_to
     AND (p_categories IS NULL OR er.category = ANY(p_categories))
   GROUP BY 1;
END $$;

COMMENT ON FUNCTION public.get_measure_volumes(uuid, timestamptz, timestamptz, text[]) IS
  'How much was actually captured per measure in a window. The registry says '
  'what could be recorded; this says what was — so a screen can open on a '
  'measure that has data rather than one that merely exists.';

GRANT EXECUTE ON FUNCTION
  public.get_measure_volumes(uuid, timestamptz, timestamptz, text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION
  public.get_measure_volumes(uuid, timestamptz, timestamptz, text[]) FROM anon;

COMMIT;


-- ── Self-check: what would Generators now open onto? ───────────────────────
DO $$
DECLARE r record; v_site uuid;
BEGIN
  SELECT id INTO v_site FROM public.sites ORDER BY created_at LIMIT 1;
  RAISE NOTICE 'Top generator measures by captured volume:';
  FOR r IN
    SELECT v.measure, v.n_numeric, v.assets
      FROM public.get_measure_volumes(v_site, now() - interval '60 days', now(),
                                      ARRAY['GENERATOR','FUEL_LOGISTICS']) v
     WHERE v.n_numeric > 0
     ORDER BY v.n_numeric DESC LIMIT 5
  LOOP
    RAISE NOTICE '  % — % numeric readings across % assets', r.measure, r.n_numeric, r.assets;
  END LOOP;
END $$;
