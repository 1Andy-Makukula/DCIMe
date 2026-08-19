-- ═══════════════════════════════════════════════════════════════════════════
-- 20260821_sla_rollup.sql
-- DCIMe V2 — Technical -> Admin
--
-- The second missing link from the V2 document: a technician's work becomes
-- management's numbers. V1 has incidents and it has an executive dashboard, but
-- nothing between them — nobody's fault ever became anybody's cost (audit G-02).
--
-- Everything here reads the work item spine. No new source of truth: if the
-- queue and the boardroom ever disagree, one of them is lying, and the surest
-- way to prevent that is to give them one table.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
-- It does not invent a currency figure. Cost needs vendor rates, labour rates
-- and parts, none of which exist yet (audit A-06). Reporting engineer-hours and
-- letting a manager apply their own rate is honest; inventing "$4,200" is not.
--
-- Depends on: 20260820_work_items.sql
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. SLA PERFORMANCE
--
--    MTTA and MTTR are reported SEPARATELY because they fail for different
--    reasons and have different fixes. Slow acknowledgement is a staffing or
--    notification problem; slow resolution is a skills, parts or access
--    problem. A single blended "response time" hides which one you have.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_sla_performance(
  p_site_uuid uuid    DEFAULT NULL,
  p_since     timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH scope AS (
    SELECT w.*
      FROM public.work_items w
     WHERE (p_site_uuid IS NULL OR w.site_uuid = p_site_uuid)
       AND w.created_at >= COALESCE(p_since, now() - interval '30 days')
  ),
  closed AS (
    SELECT * FROM scope WHERE state IN ('RESOLVED','CLOSED')
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'window_from',  COALESCE(p_since, now() - interval '30 days'),

    'open_total',    (SELECT count(*) FROM scope WHERE state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS')),
    'unassigned',    (SELECT count(*) FROM scope WHERE assignee_id IS NULL
                                              AND state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS')),
    -- Unacknowledged work is nobody's. Counted separately because it is the
    -- number that says whether anyone is actually watching the queue.
    'unacknowledged',(SELECT count(*) FROM scope WHERE acknowledged_at IS NULL
                                              AND state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS')),

    'breached_now',  (SELECT count(*) FROM scope
                       WHERE state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS')
                         AND now() > resolve_by),

    'by_severity', COALESCE((
      SELECT jsonb_object_agg(sev, cnt) FROM (
        SELECT severity AS sev, count(*) AS cnt FROM scope
         WHERE state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS')
         GROUP BY severity) x), '{}'::jsonb),

    -- Minutes to first acknowledgement.
    'mtta_minutes', (SELECT round(avg(EXTRACT(EPOCH FROM (acknowledged_at - created_at))/60)::numeric, 1)
                       FROM scope WHERE acknowledged_at IS NOT NULL),
    -- Minutes to resolution.
    'mttr_minutes', (SELECT round(avg(EXTRACT(EPOCH FROM (resolved_at - created_at))/60)::numeric, 1)
                       FROM closed WHERE resolved_at IS NOT NULL),

    'resolved_in_window', (SELECT count(*) FROM closed),
    'met_target',         (SELECT count(*) FROM closed WHERE resolved_at <= resolve_by),
    'compliance_pct', COALESCE((
      SELECT round(100.0 * count(*) FILTER (WHERE resolved_at <= resolve_by)
                   / NULLIF(count(*), 0), 1) FROM closed), NULL),

    -- Engineer-hours, not currency. See the header.
    'engineer_hours', COALESCE((
      SELECT round(sum(EXTRACT(EPOCH FROM (resolved_at - COALESCE(acknowledged_at, created_at)))/3600)::numeric, 1)
        FROM closed WHERE resolved_at IS NOT NULL), 0),

    'origin_mix', COALESCE((
      SELECT jsonb_object_agg(o, c) FROM (
        SELECT origin AS o, count(*) AS c FROM scope GROUP BY origin) y), '{}'::jsonb)
  );
$$;

COMMENT ON FUNCTION public.get_sla_performance(uuid, timestamptz) IS
  'Management view of the work queue. Reads work_items only, so the queue and '
  'the boardroom cannot disagree.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. WHAT IS BREACHING, AND WHY
--
--    A count tells a manager there is a problem. This tells them which one, so
--    the dashboard produces a decision rather than a feeling.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_sla_breaches(p_site_uuid uuid DEFAULT NULL)
RETURNS TABLE (
  out_id            uuid,
  out_title         text,
  out_severity      text,
  out_state         text,
  out_assignee      text,
  out_overdue_hours numeric,
  out_origin        text,
  out_kind          text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT w.id, w.title, w.severity, w.state,
         COALESCE(e.full_name, 'Unassigned'),
         round((EXTRACT(EPOCH FROM (now() - w.resolve_by)) / 3600)::numeric, 1),
         w.origin, w.kind
    FROM public.work_items w
    LEFT JOIN public.employees e ON e.id = w.assignee_id
   WHERE (p_site_uuid IS NULL OR w.site_uuid = p_site_uuid)
     AND w.state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS')
     AND now() > w.resolve_by
   -- Worst breach first: a manager reading three rows should be reading the
   -- three that matter.
   ORDER BY (now() - w.resolve_by) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_sla_performance(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sla_breaches(uuid) TO authenticated;

COMMIT;
