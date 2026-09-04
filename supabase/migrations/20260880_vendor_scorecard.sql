-- ═══════════════════════════════════════════════════════════════════════════
-- 20260880_vendor_scorecard.sql
-- DCIMe V2 — how a vendor is actually performing, without anyone filling a form.
--
-- Every figure here was already in the database. incidents knows when a fault
-- happened and when it was closed; work_items knows what was raised against
-- what; contractor_visits knows who attended and when. None of it could be
-- grouped by vendor, because until 20260879 there was no vendor key to group
-- by — only a name a technician had typed.
--
-- WHAT IT DELIBERATELY WILL NOT DO
-- It does not invent a score out of ten. Response time is measured against the
-- hours THIS vendor's contract actually buys, and where there is no contract
-- the field comes back null rather than being compared to a house default that
-- nobody agreed to. A vendor with no attributed work returns zeros and nulls,
-- not a flattering absence of complaints.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP FUNCTION IF EXISTS public.get_vendor_scorecard(uuid, timestamptz, timestamptz);

CREATE FUNCTION public.get_vendor_scorecard(
  p_vendor_id uuid,
  p_from      timestamptz,
  p_to        timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_actor    text := auth.role();
  v_site     uuid := public.get_my_site_uuid();
  v_contract public.vendor_contracts%ROWTYPE;
  v_result   jsonb;
BEGIN
  IF p_vendor_id IS NULL THEN
    RAISE EXCEPTION 'A vendor is required';
  END IF;

  -- Vendors are a shared register, but their WORK is site data. A signed-in
  -- user sees this vendor's record against their own site only.
  IF v_actor IN ('authenticated', 'anon') AND v_site IS NULL THEN
    RAISE EXCEPTION 'No site for the signed-in user; cannot report vendor activity.';
  END IF;

  SELECT * INTO v_contract
    FROM public.vendor_contracts c
   WHERE c.vendor_id = p_vendor_id
     AND c.is_active
     AND (c.site_uuid IS NULL OR c.site_uuid = v_site)
   ORDER BY c.expires_on DESC NULLS LAST
   LIMIT 1;

  WITH scoped AS (
    SELECT i.*
      FROM public.incidents i
     WHERE i.vendor_id = p_vendor_id
       AND (v_site IS NULL OR i.site_uuid = v_site)
       AND i.occurred_at >= p_from
       AND i.occurred_at <  p_to
  ),
  closed AS (
    SELECT s.*,
           extract(epoch FROM (s.resolved_at - s.occurred_at)) / 3600.0 AS restore_hours
      FROM scoped s
     WHERE s.resolved_at IS NOT NULL
  ),
  -- A repair that did not hold: another incident raised on the same machine
  -- within 30 days of this vendor closing one there. The single most useful
  -- thing the platform can say about a contractor, and nothing counted it.
  repeats AS (
    SELECT count(*)::int AS n
      FROM closed c
     WHERE EXISTS (
       SELECT 1 FROM public.incidents nxt
        WHERE nxt.asset_id = c.asset_id
          AND nxt.id <> c.id
          AND (v_site IS NULL OR nxt.site_uuid = v_site)
          AND nxt.occurred_at > c.resolved_at
          AND nxt.occurred_at <= c.resolved_at + interval '30 days'
     )
  ),
  visits AS (
    SELECT count(*)::int AS n, max(v.occurred_at) AS last_visit
      FROM public.contractor_visits v
     WHERE v.vendor_id = p_vendor_id
       AND (v_site IS NULL OR v.site_uuid = v_site)
       AND v.occurred_at >= p_from
       AND v.occurred_at <  p_to
  ),
  work AS (
    SELECT count(*)::int AS n,
           count(*) FILTER (WHERE w.state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS'))::int AS open_n
      FROM public.work_items w
     WHERE w.vendor_id = p_vendor_id
       AND (v_site IS NULL OR w.site_uuid = v_site)
       AND w.created_at >= p_from
       AND w.created_at <  p_to
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'window_from',  p_from,
    'window_to',    p_to,

    'contract', CASE WHEN v_contract.id IS NULL THEN NULL ELSE jsonb_build_object(
      'reference',      v_contract.reference,
      'expires_on',     v_contract.expires_on,
      'days_to_expiry', CASE WHEN v_contract.expires_on IS NULL THEN NULL
                             ELSE (v_contract.expires_on - current_date) END,
      'response_hours', v_contract.response_hours,
      'restore_hours',  v_contract.restore_hours,
      'currency',       v_contract.currency,
      'callout_rate',   v_contract.callout_rate
    ) END,

    -- Compliance is reported as the SOONEST thing to lapse, because that is
    -- the date that decides whether they can be on site next month.
    'compliance', jsonb_build_object(
      'insurance_expires_on',        v_contract.insurance_expires_on,
      'workmens_comp_expires_on',    v_contract.workmens_comp_expires_on,
      'tax_clearance_expires_on',    v_contract.tax_clearance_expires_on,
      'safety_induction_expires_on', v_contract.safety_induction_expires_on,
      'soonest_expiry', LEAST(
        v_contract.insurance_expires_on,
        v_contract.workmens_comp_expires_on,
        v_contract.tax_clearance_expires_on,
        v_contract.safety_induction_expires_on
      )
    ),

    'activity', jsonb_build_object(
      'incidents',          (SELECT count(*)::int FROM scoped),
      'incidents_resolved', (SELECT count(*)::int FROM closed),
      'incidents_open',     (SELECT count(*)::int FROM scoped WHERE resolved_at IS NULL),
      'visits',             (SELECT n FROM visits),
      'last_visit',         (SELECT last_visit FROM visits),
      'work_items',         (SELECT n FROM work),
      'work_items_open',    (SELECT open_n FROM work)
    ),

    'performance', jsonb_build_object(
      'mean_restore_hours',   (SELECT round(avg(restore_hours)::numeric, 1) FROM closed),
      'worst_restore_hours',  (SELECT round(max(restore_hours)::numeric, 1) FROM closed),
      -- Only meaningful where a contract says what was bought.
      'restore_target_hours', v_contract.restore_hours,
      'met_restore_target',   CASE WHEN v_contract.restore_hours IS NULL THEN NULL ELSE
        (SELECT count(*)::int FROM closed WHERE restore_hours <= v_contract.restore_hours) END,
      'repeat_visits_30d',    (SELECT n FROM repeats),
      'assets_touched',       (SELECT count(DISTINCT asset_id)::int FROM scoped)
    )
  ) INTO v_result;

  RETURN v_result;
END $$;

COMMENT ON FUNCTION public.get_vendor_scorecard(uuid, timestamptz, timestamptz) IS
  'A vendor''s record over a window, scoped to the caller''s site. Response and '
  'restore are compared to the hours that vendor''s own contract buys, and come '
  'back null where no contract says.';

GRANT EXECUTE ON FUNCTION public.get_vendor_scorecard(uuid, timestamptz, timestamptz) TO authenticated;

COMMIT;
