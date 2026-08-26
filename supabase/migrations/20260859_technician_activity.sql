-- ═══════════════════════════════════════════════════════════════════════════
-- 20260859_technician_activity.sql
-- DCIMe V2.1 — Stage 8: what each technician actually recorded.
--
-- WHY THIS AND NOT THE WORK-ORDER ANALYTICS THAT WERE PLANNED
-- Stage 8 was scoped as technician, vendor and incident analytics. Checked
-- against production first:
--
--     work_items              0 rows
--     work_item_acks          0 rows
--     contractor_visits       0 rows
--     contractor_findings     0 rows
--     maintenance_schedules   0 rows
--     vendors                 1 row
--     incidents              12 rows
--     shift_sessions          8 rows
--     readings           61,774 rows across 9 technicians
--
-- A vendor dashboard over zero contractor visits is an empty screen with a
-- title on it. The readings are the one rich seam, and they carry the technician
-- on every row, so that is what gets built.
--
-- WHAT IT MAKES VISIBLE
-- Not a league table. Reading counts mostly measure who was rostered, and
-- ranking people by them would reward being scheduled often. What IS worth
-- seeing is consistency: the share of readings answered 'NA' and the share
-- entered as exactly zero vary far more between people than between equipment.
--
-- Zeros as a share of NUMERIC readings — the same denominator the screen uses,
-- since a reading answered 'NA' never had a number to be zero:
--
--     ALEX        4,202 numeric   13.4% zeros
--     WAMANYIKWA    503 numeric   11.9%
--     CHOMBA      6,122 numeric   11.3%
--     ANDERSON    7,160 numeric   10.0%
--     WILLARD     8,267 numeric    7.7%
--     BRIGHTON    3,813 numeric    3.6%
--     JOE           645 numeric    2.6%
--
-- Site average 9.0%. Same rooms, same instruments, same rounds — and a five-fold
-- spread in how often a box comes back as zero. That is a habit, not a building,
-- which makes it a training question rather than a maintenance one; and it is
-- invisible until somebody groups the readings by who took them.
--
-- Note which way the interesting signal runs. BRIGHTON and JOE sit at a third of
-- the site average, which is the evidence that the higher rates are avoidable
-- rather than inherent to the round.
--
-- Same guard as get_series: definer's rights, own site only.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP FUNCTION IF EXISTS public.get_technician_activity(uuid, timestamptz, timestamptz);

CREATE FUNCTION public.get_technician_activity(
  p_site_uuid uuid,
  p_from      timestamptz,
  p_to        timestamptz
)
RETURNS TABLE (
  technician_id   uuid,
  technician_name text,
  n_readings      bigint,
  n_numeric       bigint,
  n_na            bigint,
  n_zero          bigint,
  n_breach        bigint,
  n_days          bigint,
  n_assets        bigint,
  n_rooms         bigint,
  n_shifts        bigint,
  first_seen      timestamptz,
  last_seen       timestamptz
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
  SELECT r.technician_id,
         -- The name is stamped on the reading rather than joined, so a person
         -- leaving does not erase who took last month's rounds.
         max(r.technician_name)                              AS technician_name,
         count(*)::bigint                                    AS n_readings,
         count(r.value_num)::bigint                          AS n_numeric,
         count(*) FILTER (WHERE r.value_text = 'NA')::bigint AS n_na,
         count(*) FILTER (WHERE r.value_num = 0)::bigint     AS n_zero,
         count(*) FILTER (WHERE public.reading_status(
           r.value_num, p.min_value, p.max_value,
           p.warn_min, p.warn_max) = 'breach')::bigint       AS n_breach,
         count(DISTINCT r.target_hour::date)::bigint         AS n_days,
         count(DISTINCT r.equipment_id)::bigint              AS n_assets,
         count(DISTINCT r.room_id)::bigint                   AS n_rooms,
         count(DISTINCT r.shift_session_id)::bigint          AS n_shifts,
         min(r.target_hour)                                  AS first_seen,
         max(r.target_hour)                                  AS last_seen
    FROM public.readings r
    LEFT JOIN public.equipment_parameters p
           ON p.equipment_id = r.equipment_id
          AND p.parameter_name = r.parameter_name
   WHERE r.site_uuid = p_site_uuid
     AND r.target_hour >= p_from AND r.target_hour < p_to
     AND r.technician_id IS NOT NULL
   GROUP BY r.technician_id;
END $$;

COMMENT ON FUNCTION public.get_technician_activity(uuid, timestamptz, timestamptz) IS
  'Per technician, what was recorded in a window: volume, coverage, and the '
  'share answered NA or entered as zero. Not a ranking — reading counts mostly '
  'measure who was rostered. The consistency columns are the point.';

GRANT EXECUTE ON FUNCTION
  public.get_technician_activity(uuid, timestamptz, timestamptz) TO authenticated;
REVOKE EXECUTE ON FUNCTION
  public.get_technician_activity(uuid, timestamptz, timestamptz) FROM anon;

COMMIT;


-- ── Self-check ─────────────────────────────────────────────────────────────
DO $$
DECLARE r record; v_site uuid;
BEGIN
  SELECT id INTO v_site FROM public.sites ORDER BY created_at LIMIT 1;
  RAISE NOTICE 'Technician activity, all time:';
  FOR r IN
    SELECT t.technician_name, t.n_readings, t.n_zero, t.n_days
      FROM public.get_technician_activity(v_site, '2000-01-01'::timestamptz, now()) t
     ORDER BY t.n_readings DESC LIMIT 5
  LOOP
    RAISE NOTICE '  % — % readings over % days, % zeros',
      r.technician_name, r.n_readings, r.n_days, r.n_zero;
  END LOOP;
END $$;
