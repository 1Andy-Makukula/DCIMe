-- ═══════════════════════════════════════════════════════════════════════════
-- 20260866_late_entry_detail.sql
-- DCIMe V2.1 — naming the late entries, not just counting them.
--
-- WHAT THIS ADDS TO WHAT 20260865 ALREADY DID
-- site_ingestion_health says "7 of 65 rounds were late, worst 20 hours". That
-- is the right thing on a summary card and useless for doing anything about it.
-- Acting on it needs the register underneath: which round, which hour it was
-- supposed to describe, when it was actually typed, how long that gap was, and
-- whose name is on it.
--
-- Same rail, finer grain. The card keeps the count; this is what "more detail"
-- opens onto.
--
-- WHY THE TWO TIMESTAMPS ARE BOTH KEPT
--   target_hour   the hour the reading DESCRIBES
--   submitted_at  the moment somebody typed it in
--
-- A round logged at 06:05 for 06:00 was observed. The same round logged at
-- 22:00 for 06:00 was remembered — sixteen hours of recollection presented as
-- a measurement, on a document somebody signs. The gap between those two
-- columns is the whole finding, and it is invisible unless both are shown.
--
-- NOT A DISCIPLINARY TOOL BY ITSELF
-- A long gap has innocent explanations: a tablet out of signal, a round
-- genuinely interrupted, a shift that ran into an incident. The register gives
-- the facts and the name attached to them; it does not decide what they mean.
-- That is why it returns the reading count and the shift alongside — the
-- context somebody needs before having the conversation.
--
-- Same guard as everything else on this rail: own site only.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP FUNCTION IF EXISTS public.get_late_entries(uuid, timestamptz, timestamptz, boolean);

CREATE FUNCTION public.get_late_entries(
  p_site_uuid uuid,
  p_from      timestamptz,
  p_to        timestamptz,
  p_late_only boolean DEFAULT true
)
RETURNS TABLE (
  log_id           uuid,
  target_hour      timestamptz,
  submitted_at     timestamptz,
  lag_minutes      numeric,
  tolerance_minutes numeric,
  is_late          boolean,
  technician_id    uuid,
  technician_name  text,
  shift_session_id uuid,
  n_readings       bigint,
  frequency        text,
  provenance       text
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
  WITH tol AS (
    SELECT (s.expected_interval_minutes + s.ingestion_grace_minutes)::numeric AS m
      FROM public.sites s WHERE s.id = p_site_uuid
  )
  SELECT t.id,
         t.target_hour,
         t.submitted_at,
         round(EXTRACT(epoch FROM t.submitted_at - t.target_hour) / 60.0, 1),
         tol.m,
         (EXTRACT(epoch FROM t.submitted_at - t.target_hour) / 60.0) > tol.m,
         t.technician_id,
         t.technician_name,
         t.shift_session_id,
         -- How much was riding on that one late submission. A round covering
         -- 260 readings matters more than one covering three.
         (SELECT count(*) FROM public.readings r
           WHERE r.site_uuid = t.site_uuid
             AND r.target_hour = t.target_hour
             AND r.technician_id IS NOT DISTINCT FROM t.technician_id),
         t.frequency,
         t.provenance
    FROM public.telemetry_logs t
   CROSS JOIN tol
   WHERE t.site_uuid = p_site_uuid
     AND t.submitted_at IS NOT NULL
     AND t.submitted_at >= p_from AND t.submitted_at < p_to
     -- Typed BEFORE the hour it describes is a clock problem, not a discipline
     -- one, and would show as a negative lag.
     AND t.submitted_at >= t.target_hour
     AND (NOT p_late_only
          OR (EXTRACT(epoch FROM t.submitted_at - t.target_hour) / 60.0) > tol.m)
   ORDER BY (EXTRACT(epoch FROM t.submitted_at - t.target_hour) / 60.0) DESC;
END $$;

COMMENT ON FUNCTION public.get_late_entries(uuid, timestamptz, timestamptz, boolean) IS
  'Every submission in a window with the gap between the hour it describes and '
  'the moment it was typed, plus who typed it and how many readings rode on it. '
  'The register behind the entry-discipline count on the data-flow card.';

GRANT EXECUTE ON FUNCTION
  public.get_late_entries(uuid, timestamptz, timestamptz, boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION
  public.get_late_entries(uuid, timestamptz, timestamptz, boolean) FROM anon;


-- ── Per technician, so a pattern is visible rather than a list of incidents ──
DROP FUNCTION IF EXISTS public.get_late_entry_by_technician(uuid, timestamptz, timestamptz);

CREATE FUNCTION public.get_late_entry_by_technician(
  p_site_uuid uuid,
  p_from      timestamptz,
  p_to        timestamptz
)
RETURNS TABLE (
  technician_id   uuid,
  technician_name text,
  n_entries       bigint,
  n_late          bigint,
  late_share      numeric,
  avg_lag_minutes numeric,
  worst_lag_minutes numeric,
  last_late_at    timestamptz
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
  WITH tol AS (
    SELECT (s.expected_interval_minutes + s.ingestion_grace_minutes)::numeric AS m
      FROM public.sites s WHERE s.id = p_site_uuid
  ),
  e AS (
    SELECT t.technician_id, t.technician_name, t.submitted_at,
           EXTRACT(epoch FROM t.submitted_at - t.target_hour) / 60.0 AS lag_min,
           tol.m AS tolerance
      FROM public.telemetry_logs t CROSS JOIN tol
     WHERE t.site_uuid = p_site_uuid
       AND t.submitted_at IS NOT NULL
       AND t.submitted_at >= p_from AND t.submitted_at < p_to
       AND t.submitted_at >= t.target_hour
       AND t.technician_id IS NOT NULL
  )
  SELECT e.technician_id,
         max(e.technician_name),
         count(*)::bigint,
         count(*) FILTER (WHERE e.lag_min > e.tolerance)::bigint,
         -- Share, not count: somebody rostered twice as often will be late
         -- twice as often, and ranking on the raw number punishes availability.
         round(count(*) FILTER (WHERE e.lag_min > e.tolerance)::numeric
               / NULLIF(count(*), 0), 3),
         round(avg(e.lag_min), 1),
         round(max(e.lag_min), 1),
         max(e.submitted_at) FILTER (WHERE e.lag_min > e.tolerance)
    FROM e
   GROUP BY e.technician_id
   ORDER BY 5 DESC NULLS LAST;
END $$;

COMMENT ON FUNCTION public.get_late_entry_by_technician(uuid, timestamptz, timestamptz) IS
  'Late-entry rate per technician over a window. Ordered by SHARE rather than '
  'count, because whoever is rostered most would otherwise always look worst.';

GRANT EXECUTE ON FUNCTION
  public.get_late_entry_by_technician(uuid, timestamptz, timestamptz) TO authenticated;
REVOKE EXECUTE ON FUNCTION
  public.get_late_entry_by_technician(uuid, timestamptz, timestamptz) FROM anon;

COMMIT;


-- ── What it finds ──────────────────────────────────────────────────────────
DO $$
DECLARE r record; v_site uuid;
BEGIN
  SELECT id INTO v_site FROM public.sites WHERE site_code = 'SITE_01';
  RAISE NOTICE 'Late entries, last 30 days:';
  FOR r IN
    SELECT * FROM public.get_late_entries(v_site, now() - interval '30 days', now(), true)
     LIMIT 5
  LOOP
    RAISE NOTICE '  % logged %  (for %) — % min late, % readings',
      COALESCE(r.technician_name,'—'),
      to_char(r.submitted_at,'DD Mon HH24:MI'),
      to_char(r.target_hour,'DD Mon HH24:MI'),
      r.lag_minutes, r.n_readings;
  END LOOP;

  RAISE NOTICE 'By technician:';
  FOR r IN
    SELECT * FROM public.get_late_entry_by_technician(v_site, now() - interval '30 days', now())
     WHERE n_late > 0
  LOOP
    -- No '%%' in the format: RAISE treats it as a literal percent sign and it
    -- does NOT consume an argument, so the count no longer matches.
    RAISE NOTICE '  % — % of % late (% pct), worst % min',
      r.technician_name, r.n_late, r.n_entries,
      round(r.late_share * 100, 1), r.worst_lag_minutes;
  END LOOP;
END $$;
