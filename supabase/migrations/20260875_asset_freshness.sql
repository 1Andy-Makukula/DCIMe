-- ═══════════════════════════════════════════════════════════════════════════
-- 20260875_asset_freshness.sql
-- DCIMe V2.2 — how old is this number, and was the round complete.
--
-- WHY THIS EXISTS
-- Every admin screen shows figures with no indication of when they were taken.
-- ThermalAnalytics reads whatever telemetry row happens to be most recent and
-- renders it identically whether it landed four minutes ago or four hours ago,
-- so a technician mid-round and one who has missed three produce the same
-- screen. A reader assumes current and is never told otherwise.
--
-- WHY NOT get_series()
-- The obvious move — call get_series(group_by => 'asset') and take the newest
-- bucket — does not work. That function returns one row per BUCKET PER
-- PARAMETER: 886 rows for 137 asset-months on this site, and over 1,000 for a
-- 48-hour hourly window, which is where PostgREST's row cap truncates.
-- Freshness computed from a truncated result reports healthy assets as stale,
-- which is worse than reporting nothing. This returns ONE ROW PER ASSET.
--
-- FRESHNESS AND COVERAGE ARE DIFFERENT FAILURES
-- An asset can be read on time and still be half-recorded. Both look identical
-- downstream: a figure appears, and nothing says the rest of the round is
-- missing. So this reports the timestamp AND how much of the round arrived.
--
-- WHY COVERAGE IS MEASURED FROM BEHAVIOUR, NOT FROM capture_mode
-- The obvious denominator — count the parameters marked CAPTURED — is wrong on
-- this data, and quietly so. Emerson Aircon 1 carries thirteen registered
-- parameters, exactly ONE of them marked CAPTURED, and yet five are recorded
-- every single round: the four marked CONSTANT are being read by technicians
-- despite the flag saying they are fixed nameplate figures. Using capture_mode
-- would have rendered "5 of 1" on every air conditioner on site.
--
-- So the denominator is what the asset ACTUALLY records in a normal round —
-- the median distinct count over the last 30 days — restricted to parameters
-- the registry agrees belong to it. The registry decides which parameters are
-- in scope; the asset's own history decides how many of them a full round has.
--
-- Two traps that restriction avoids:
--   · 'remark' is recorded against most assets and registered against none of
--     them. Counted, it made every aircon read as permanently one short.
--   · NOT_APPLICABLE parameters are registered so the Excel templates stay
--     complete and are never read. Counted, they would invent a permanent gap.
--
-- Median rather than max: one unusually thorough round must not make every
-- ordinary round look deficient.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- "The newest reading for this asset", and "how many in the last day" — both
-- are (site, asset) prefix scans ending in a target_hour ordering. The primary
-- key leads with site_uuid, equipment_id but puts parameter_name before
-- target_hour, so it cannot serve the ordering without a sort.
CREATE INDEX IF NOT EXISTS idx_readings_asset_recency
  ON public.readings (site_uuid, equipment_id, target_hour DESC);

DROP FUNCTION IF EXISTS public.get_asset_freshness(uuid);

CREATE FUNCTION public.get_asset_freshness(p_site_uuid uuid DEFAULT NULL)
RETURNS TABLE (
  equipment_id       text,
  name               text,
  category           text,
  room_id            uuid,
  room_name          text,
  -- Not named `condition`: that is reserved in PL/pgSQL and an output
  -- parameter carrying it makes the body ambiguous in ways that only surface
  -- at runtime.
  asset_condition    text,
  last_reading       timestamptz,
  last_technician    text,
  readings_24h       bigint,
  /** How many readings a normal round collects for this asset. NULL when it
      has not been read in the last 30 days — unknown, which is not zero. */
  typical_round      int,
  /** How many arrived in the most recent round. Compare with typical_round. */
  covered_last_round int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site  uuid := COALESCE(p_site_uuid, public.get_my_site_uuid());
  v_actor text := auth.role();
BEGIN
  IF v_site IS NULL THEN
    RAISE EXCEPTION 'No site to report on'
      USING HINT = 'Pass p_site_uuid, or sign in as a user assigned to a site.';
  END IF;

  -- SECURITY DEFINER bypasses RLS, so the site scope is enforced here. The
  -- service role and migrations (auth.role() is neither of these) stay able to
  -- read any site; a signed-in user is held to their own.
  IF v_actor IN ('authenticated','anon')
     AND v_site IS DISTINCT FROM public.get_my_site_uuid() THEN
    RAISE EXCEPTION 'Not permitted to read another site'
      USING HINT = 'You can only read the site you are assigned to.';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    -- Readings the registry agrees are part of this asset's round.
    SELECT rd.equipment_id, rd.target_hour, rd.parameter_name
      FROM public.readings rd
      JOIN public.equipment_parameters p
        ON  p.equipment_id   = rd.equipment_id
        AND p.parameter_name = rd.parameter_name
        AND p.is_active IS NOT FALSE
        AND p.capture_mode <> 'NOT_APPLICABLE'
     WHERE rd.site_uuid = v_site
       AND rd.target_hour >= now() - interval '30 days'
  ),
  per_round AS (
    SELECT s.equipment_id, s.target_hour,
           count(DISTINCT s.parameter_name) AS k
      FROM scoped s
     GROUP BY 1, 2
  ),
  typical AS (
    SELECT pr.equipment_id,
           percentile_disc(0.5) WITHIN GROUP (ORDER BY pr.k) AS k
      FROM per_round pr
     GROUP BY 1
  ),
  newest AS (
    SELECT DISTINCT ON (pr.equipment_id) pr.equipment_id, pr.k
      FROM per_round pr
     ORDER BY pr.equipment_id, pr.target_hour DESC
  )
  SELECT
    c.equipment_id,
    c.name,
    c.category,
    c.room_id,
    rm.room_name,
    c.condition,
    recent.target_hour,
    recent.technician_name,
    COALESCE(day.n, 0),
    t.k::int,
    n.k::int
  FROM public.equipment_condition c
  LEFT JOIN public.rooms rm ON rm.id = c.room_id
  LEFT JOIN typical t ON t.equipment_id = c.equipment_id
  LEFT JOIN newest  n ON n.equipment_id = c.equipment_id

  -- The true newest reading and who took it — deliberately NOT restricted to
  -- the 30-day window or to registered parameters. "When was this last touched
  -- at all" is the freshness question, and an asset last read 40 days ago must
  -- report that date rather than reading as never.
  LEFT JOIN LATERAL (
    SELECT rd.target_hour, rd.technician_name
      FROM public.readings rd
     WHERE rd.site_uuid    = v_site
       AND rd.equipment_id = c.equipment_id
     ORDER BY rd.target_hour DESC
     LIMIT 1
  ) recent ON true

  LEFT JOIN LATERAL (
    SELECT count(*) AS n
      FROM public.readings rd
     WHERE rd.site_uuid    = v_site
       AND rd.equipment_id = c.equipment_id
       AND rd.target_hour >= now() - interval '24 hours'
  ) day ON true

  WHERE c.site_uuid = v_site
    AND c.is_active
  ORDER BY rm.sort_order NULLS LAST, rm.room_name, c.name;
END $$;

COMMENT ON FUNCTION public.get_asset_freshness(uuid) IS
  'One row per active asset: when it was last read, by whom, how many readings '
  'in the last 24h, and how much of a normal round the most recent entry '
  'covered. Answers "is this current" and "is this complete" — the two claims '
  'every admin screen currently makes without evidence. Coverage is measured '
  'against the asset''s own 30-day median, not capture_mode, which is '
  'mislabelled on this data.';

GRANT EXECUTE ON FUNCTION public.get_asset_freshness(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_asset_freshness(uuid) FROM anon;

COMMIT;

-- ── Proof it answers the question ──────────────────────────────────────────
DO $$
DECLARE r record; total int := 0; partial int := 0; cold int := 0;
BEGIN
  FOR r IN
    SELECT * FROM public.get_asset_freshness(
      (SELECT id FROM public.sites ORDER BY created_at LIMIT 1))
  LOOP
    total := total + 1;
    IF r.covered_last_round IS NOT NULL AND r.typical_round IS NOT NULL
       AND r.covered_last_round < r.typical_round THEN
      partial := partial + 1;
      RAISE NOTICE 'PARTIAL  % / % — % (%)',
        r.covered_last_round, r.typical_round, r.name, COALESCE(r.room_name,'—');
    END IF;
    IF r.last_reading IS NULL OR r.last_reading < now() - interval '8 hours' THEN
      cold := cold + 1;
    END IF;
  END LOOP;
  RAISE NOTICE '── % active assets: % partial last round, % not read in 8h',
    total, partial, cold;
END $$;
