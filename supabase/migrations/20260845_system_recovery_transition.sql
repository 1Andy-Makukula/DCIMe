-- ========================================================================
-- 20260845_system_recovery_transition.sql
-- DCIMe V2.1 - Stage 2: a self-clearing alarm can close itself.
--
-- resolve_recovered_thresholds() closes a threshold job when the reading that
-- raised it returns to range, moving it OPEN -> RESOLVED. The state machine
-- does not allow that transition, so the call fails outright.
--
-- Nobody had seen it because evaluate_thresholds() could never raise a job in
-- the first place (see 20260844) - so there was never an OPEN threshold job
-- for recovery to close, and the second fault stayed hidden behind the first.
--
-- The transition is opened for SYSTEM-origin work only. A job a person raised
-- still cannot jump straight to RESOLVED: that rule is what stops work being
-- marked done by someone who never picked it up.
--
-- The function below is the LIVE definition, read out of the database and
-- patched, so the state machine it carries cannot have been altered in
-- retyping.
--
-- Idempotent: safe to re-run.
-- ========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.work_items_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$

DECLARE

  v_ok    boolean;

  v_me    uuid;

  v_admin boolean;

BEGIN

  -- A NULL auth.uid() is a scheduled job or a database trigger raising work

  -- with no user session. raise_work_item() is SECURITY DEFINER and called

  -- exactly that way by the threshold and preventive paths, so those must pass

  -- unhindered — there is no person there to hold to a rule.

  v_admin := auth.uid() IS NULL OR public.get_my_role() = 'ADMIN';

  v_me    := public.get_my_employee_id();



  IF TG_OP = 'INSERT' THEN

    IF NEW.assigned_to IS NOT NULL AND NOT v_admin THEN

      RAISE EXCEPTION 'Only an administrator can assign work to somebody.';

    END IF;



    -- SLA clocks are derived, never supplied. A caller that sets its own

    -- deadline can quietly grant itself a week.

    SELECT now() + make_interval(mins => s.respond_minutes),

           now() + make_interval(mins => s.resolve_minutes)

      INTO NEW.respond_by, NEW.resolve_by

      FROM public.sla_targets s WHERE s.severity = NEW.severity;



    IF NEW.due_at IS NULL THEN NEW.due_at := NEW.resolve_by; END IF;

    RETURN NEW;

  END IF;



  NEW.updated_at := now();



  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NOT v_admin THEN

    RAISE EXCEPTION 'Only an administrator can change who a job is assigned to.';

  END IF;



  -- Ownership is taken, never handed sideways. A technician may pick up work

  -- nobody has started; moving it off somebody who already has it is an

  -- administrator's decision, because it overrides a person mid-task.

  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id AND NOT v_admin THEN

    IF OLD.assignee_id IS NOT NULL THEN

      RAISE EXCEPTION 'That job already belongs to somebody else.';

    END IF;

    IF v_me IS NULL OR NEW.assignee_id IS DISTINCT FROM v_me THEN

      RAISE EXCEPTION 'You can only take a job for yourself.';

    END IF;

    IF NEW.assigned_to IS NOT NULL AND NOT (v_me = ANY (NEW.assigned_to)) THEN

      RAISE EXCEPTION 'That job was not assigned to you.';

    END IF;

  END IF;



  IF NEW.state IS DISTINCT FROM OLD.state THEN

    v_ok := CASE OLD.state

      -- OPEN -> RESOLVED is allowed ONLY for work the system raised itself.
      -- A threshold job whose reading has come back into range has nothing
      -- left to inspect, and resolve_recovered_thresholds() closes it with a
      -- note saying so. A person's job still cannot skip acknowledgement:
      -- that discipline exists so nobody can mark work done without ever
      -- having picked it up.
      WHEN 'OPEN'         THEN NEW.state IN ('ACKNOWLEDGED','IN_PROGRESS','CANCELLED')
                            OR (NEW.state = 'RESOLVED' AND OLD.origin = 'SYSTEM')

      WHEN 'ACKNOWLEDGED' THEN NEW.state IN ('IN_PROGRESS','RESOLVED','CANCELLED')

      WHEN 'IN_PROGRESS'  THEN NEW.state IN ('RESOLVED','CANCELLED')

      WHEN 'RESOLVED'     THEN NEW.state IN ('CLOSED','IN_PROGRESS')  -- reopen if it recurs

      WHEN 'CLOSED'       THEN false                                  -- terminal

      WHEN 'CANCELLED'    THEN false

      ELSE false

    END;

    IF NOT v_ok THEN

      RAISE EXCEPTION 'Invalid work item transition: % -> %', OLD.state, NEW.state;

    END IF;



    -- Timestamps are stamped by the machine, so "acknowledged" always means a

    -- person actually did, at a time that can be measured against the SLA.

    --

    -- IN_PROGRESS counts as acknowledgement now: somebody physically starting

    -- the job has self-evidently received it, and leaving acknowledged_at NULL

    -- would report a response breach against work already under way. That was

    -- always reachable — OPEN -> IN_PROGRESS has been a legal jump from the

    -- start — it simply never mattered until starting became the ordinary path.

    IF NEW.state IN ('ACKNOWLEDGED','IN_PROGRESS') AND NEW.acknowledged_at IS NULL THEN

      NEW.acknowledged_at := now();

      NEW.acknowledged_by := COALESCE(NEW.acknowledged_by, v_me);

    END IF;

    IF NEW.state = 'RESOLVED' AND NEW.resolved_at IS NULL THEN

      NEW.resolved_at := now();

    END IF;

  END IF;



  RETURN NEW;

END $function$

;

COMMIT;
