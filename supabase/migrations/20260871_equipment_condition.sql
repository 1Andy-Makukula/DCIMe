-- ═══════════════════════════════════════════════════════════════════════════
-- 20260871_equipment_condition.sql
-- DCIMe V2.1 — flagging what state a machine is actually in.
--
-- TWO DIFFERENT QUESTIONS, ONE TABLE
-- equipment_status_logs existed with ONLINE / DEGRADED / OFFLINE and had never
-- been written to. Those three answer "is it working right now", which anybody
-- on shift can see and should be able to record.
--
-- They do NOT answer "is this asset part of the estate" — commissioned or
-- decommissioned. That is a different fact with different consequences: a
-- decommissioned asset drops out of every analytic, every form and every
-- report, and it is not a technician's call to make.
--
-- So both live here, separated by who may write them:
--
--     ONLINE          working normally              technician or admin
--     DEGRADED        faulty, but still running     technician or admin
--     OFFLINE         not working                   technician or admin
--     COMMISSIONED    brought into the estate       ADMIN ONLY
--     DECOMMISSIONED  taken out of the estate       ADMIN ONLY
--
-- Extending the existing three rather than inventing a parallel vocabulary:
-- "faulty" is DEGRADED and "not working" is OFFLINE, and a second set of words
-- for the same states would mean two columns to check and two to keep in step.
--
-- ONE SOURCE OF TRUTH FOR is_active
-- equipment_registry.is_active already decides whether an asset appears
-- anywhere. Rather than adding a second flag that could disagree with it, the
-- two admin states DRIVE it: logging DECOMMISSIONED sets is_active = false,
-- COMMISSIONED sets it true. The log becomes the history of how the flag got
-- to where it is, which is exactly what was missing — Data Room's four assets
-- are inactive today and nothing records who did that, or when, or why.
--
-- Also drops compliance_reports: zero rows, no function writes it, no screen
-- reads it, and the reporting it was meant for is served by report_signoffs.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP TABLE IF EXISTS public.compliance_reports;

-- ── The wider vocabulary ───────────────────────────────────────────────────
ALTER TABLE public.equipment_status_logs
  DROP CONSTRAINT IF EXISTS equipment_status_logs_status_state_check;

ALTER TABLE public.equipment_status_logs
  ADD CONSTRAINT equipment_status_logs_status_state_check
  CHECK (status_state IN ('ONLINE','DEGRADED','OFFLINE','COMMISSIONED','DECOMMISSIONED'));

-- Who is allowed to say it, and the effect of saying it.
CREATE OR REPLACE FUNCTION public.equipment_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public.get_my_role();
BEGIN
  -- Stamped server-side. A client that sets changed_by itself is claiming
  -- somebody else made the call.
  NEW.changed_by := COALESCE(auth.uid(), NEW.changed_by);

  IF NEW.status_state IN ('COMMISSIONED','DECOMMISSIONED') THEN
    -- v_role is NULL for the service role and for migrations, which must stay
    -- able to seed. Only a signed-in non-admin is refused.
    IF v_role IS NOT NULL AND v_role <> 'ADMIN' THEN
      RAISE EXCEPTION 'Only an administrator may commission or decommission equipment'
        USING HINT = 'Flag it as DEGRADED or OFFLINE and ask an administrator to change its status.';
    END IF;

    UPDATE public.equipment_registry
       SET is_active = (NEW.status_state = 'COMMISSIONED')
     WHERE equipment_id = NEW.equipment_id;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_equipment_status_guard ON public.equipment_status_logs;
CREATE TRIGGER trg_equipment_status_guard
  BEFORE INSERT ON public.equipment_status_logs
  FOR EACH ROW EXECUTE FUNCTION public.equipment_status_guard();

COMMENT ON TABLE public.equipment_status_logs IS
  'Condition history per asset. ONLINE/DEGRADED/OFFLINE are what anybody on '
  'shift can see and record. COMMISSIONED/DECOMMISSIONED are admin-only and '
  'drive equipment_registry.is_active, so the flag and its history cannot part '
  'company.';

COMMIT;


-- ── Reading it back ────────────────────────────────────────────────────────
BEGIN;

CREATE OR REPLACE VIEW public.equipment_condition
WITH (security_invoker = true) AS
SELECT e.equipment_id,
       e.site_uuid,
       e.name,
       e.category,
       e.room_id,
       e.is_active,
       l.status_state       AS last_flagged_state,
       l.technician_comment AS last_comment,
       l.created_at         AS last_flagged_at,
       emp.full_name        AS last_flagged_by,
       -- What to show when nobody has ever flagged it: an asset that is active
       -- and unflagged is presumed working, which is the same assumption every
       -- screen already makes.
       COALESCE(l.status_state,
                CASE WHEN e.is_active THEN 'ONLINE' ELSE 'DECOMMISSIONED' END) AS condition
  FROM public.equipment_registry e
  LEFT JOIN LATERAL (
    SELECT s.status_state, s.technician_comment, s.created_at, s.changed_by
      FROM public.equipment_status_logs s
     WHERE s.equipment_id = e.equipment_id
     ORDER BY s.created_at DESC
     LIMIT 1
  ) l ON true
  LEFT JOIN public.employees emp ON emp.auth_id = l.changed_by;

COMMENT ON VIEW public.equipment_condition IS
  'Current condition of every asset with who last flagged it. Unflagged active '
  'assets read ONLINE by presumption, which is what the rest of the app assumes.';

GRANT SELECT ON public.equipment_condition TO authenticated;

COMMIT;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT condition, count(*) n FROM public.equipment_condition GROUP BY 1 ORDER BY 2 DESC
  LOOP RAISE NOTICE '% -> % assets', r.condition, r.n; END LOOP;
END $$;
