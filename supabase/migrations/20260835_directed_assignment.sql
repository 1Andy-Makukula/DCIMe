-- ═══════════════════════════════════════════════════════════════════════════
-- 20260835_directed_assignment.sql
-- DCIMe V2 — assignment as a command, not an offer.
--
-- WHAT CHANGED AND WHY
-- 20260830 introduced offered_to on the premise that dispatch is an invitation:
-- an admin proposes, a technician accepts, and ownership begins at acceptance.
-- That is not how a shift runs. An admin directs work; the people it was given
-- to acknowledge receipt; whoever does it says so. There is no negotiation step
-- to model, and modelling one left jobs sitting unaccepted with nobody at fault.
--
-- So offered_to becomes assigned_to, and three things follow from it:
--
--   1. NULL stops meaning "anyone". A command aimed at nobody in particular is
--      a command nobody owns. "Everyone on shift" is resolved to the actual
--      on-shift roster at the moment of assignment and stored as real uuids —
--      because the question asked afterwards is always "who was told", and a
--      dynamic answer changes at every shift rotation. Rows predating this
--      migration keep NULL, which still reads as site-wide.
--
--   2. Acknowledgement becomes per person. A command issued to four people has
--      four separate answers, and the one who never answered is the point.
--      work_items.acknowledged_at keeps recording the FIRST acknowledgement,
--      which is what respond_by measures, so every existing SLA view and breach
--      calculation carries on untouched.
--
--   3. Ownership emerges when somebody STARTS, not when work is handed out.
--      assignee_id stays NULL until then and answers "who is on it".
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. offered_to → assigned_to ────────────────────────────────────────────
-- Renamed rather than added-and-copied: the column is days old, and leaving a
-- column named "offered" holding "commanded" is how the next person reads the
-- flow backwards. Postgres rewrites the dependent view definition itself.
DO $$
BEGIN
  IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'work_items'
           AND column_name = 'offered_to')
     AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'work_items'
           AND column_name = 'assigned_to')
  THEN
    ALTER TABLE public.work_items RENAME COLUMN offered_to TO assigned_to;
  END IF;
END $$;

-- Covers a database that never received 20260830.
ALTER TABLE public.work_items
  ADD COLUMN IF NOT EXISTS assigned_to uuid[];

COMMENT ON COLUMN public.work_items.assigned_to IS
  'The people this job was given to. NULL only on rows predating directed '
  'assignment, where it still reads as site-wide. Distinct from assignee_id, '
  'which is whoever actually started the work.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class
              WHERE relname = 'idx_work_items_offered'
                AND relnamespace = 'public'::regnamespace) THEN
    IF EXISTS (SELECT 1 FROM pg_class
                WHERE relname = 'idx_work_items_assigned'
                  AND relnamespace = 'public'::regnamespace) THEN
      DROP INDEX public.idx_work_items_offered;
    ELSE
      ALTER INDEX public.idx_work_items_offered RENAME TO idx_work_items_assigned;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_work_items_assigned
  ON public.work_items USING gin (assigned_to)
  WHERE state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS');

-- ── 2. How the target was chosen ───────────────────────────────────────────
-- Recorded because the three routes are not equivalent afterwards. ON_SHIFT
-- and ALL_ACTIVE can produce an identical uuid list on a quiet night, and only
-- this column says whether the admin aimed at the roster or was told the
-- roster was empty and went wide anyway.
ALTER TABLE public.work_items
  ADD COLUMN IF NOT EXISTS assigned_scope text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'work_items_assigned_scope_ck') THEN
    ALTER TABLE public.work_items
      ADD CONSTRAINT work_items_assigned_scope_ck
      CHECK (assigned_scope IS NULL OR assigned_scope IN
             ('INDIVIDUAL','GROUP','ON_SHIFT','ALL_ACTIVE'));
  END IF;
END $$;

COMMENT ON COLUMN public.work_items.assigned_scope IS
  'INDIVIDUAL | GROUP | ON_SHIFT | ALL_ACTIVE. ALL_ACTIVE means nobody was '
  'checked in and the job was widened to the whole active roster rather than '
  'being sent to an empty shift.';

-- ── 3. Acknowledgement, per person ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.work_item_acks (
  work_item_id    uuid        NOT NULL REFERENCES public.work_items(id) ON DELETE CASCADE,
  employee_id     uuid        NOT NULL REFERENCES public.employees(id)  ON DELETE CASCADE,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  -- Composite PK makes a second acknowledgement a no-op rather than a
  -- duplicate: a technician tapping twice on a bad connection is not an event.
  PRIMARY KEY (work_item_id, employee_id)
);

COMMENT ON TABLE public.work_item_acks IS
  'One row per person who confirmed receipt of a job. work_items.acknowledged_at '
  'holds the first of these for SLA purposes; this table holds all of them, '
  'because who has NOT answered is the operationally useful half.';

ALTER TABLE public.work_item_acks ENABLE ROW LEVEL SECURITY;

-- Readable by the whole site: an admin needs the count, and a technician needs
-- to see a colleague already answered before duplicating the trip.
DROP POLICY IF EXISTS "Work item acks: site-scoped read" ON public.work_item_acks;
CREATE POLICY "Work item acks: site-scoped read"
  ON public.work_item_acks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.work_items w
     WHERE w.id = work_item_id
       AND w.site_uuid = public.get_my_site_uuid()));

-- No INSERT/UPDATE/DELETE policy by design. Acknowledgements are written only
-- through acknowledge_work_item(), which stamps the caller's own identity —
-- an acknowledgement you can write on someone else's behalf records nothing.

-- The first acknowledgement is what respond_by is measured against, so it is
-- mirrored onto the parent row where every existing view already reads it.
CREATE OR REPLACE FUNCTION public.stamp_first_ack()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.work_items w
     SET acknowledged_at = COALESCE(w.acknowledged_at, NEW.acknowledged_at),
         acknowledged_by = COALESCE(w.acknowledged_by, NEW.employee_id),
         -- Only OPEN moves. A job already IN_PROGRESS must not be dragged
         -- backwards because a second person confirmed receipt.
         state           = CASE WHEN w.state = 'OPEN' THEN 'ACKNOWLEDGED' ELSE w.state END
   WHERE w.id = NEW.work_item_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_stamp_first_ack ON public.work_item_acks;
CREATE TRIGGER trg_stamp_first_ack
  AFTER INSERT ON public.work_item_acks
  FOR EACH ROW EXECUTE FUNCTION public.stamp_first_ack();

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. WHO MAY REDIRECT WORK
--
-- "Work items: site-scoped update" (20260820a) grants UPDATE on every column
-- to every authenticated user at the site, and the guard never looked at
-- assignee_id. Any technician could therefore hand their job to a colleague,
-- or take one that had been given to somebody else, and nothing recorded it.
-- That was survivable while assignment was advisory. It is not survivable now
-- that being assigned a job is the instruction to go and do it.
--
-- Enforced here rather than in the policy because the rule is about the
-- TRANSITION — what the column was before versus after — which a WITH CHECK
-- expression cannot see.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

CREATE OR REPLACE FUNCTION public.work_items_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
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
      WHEN 'OPEN'         THEN NEW.state IN ('ACKNOWLEDGED','IN_PROGRESS','CANCELLED')
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
END $$;

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. THE TWO TECHNICIAN ACTIONS
--
-- Written as functions rather than left to the client because each touches two
-- tables and must be all-or-nothing, and because the acting identity has to be
-- resolved server-side. A client that sends its own employee_id is a client
-- that can send somebody else's.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

CREATE OR REPLACE FUNCTION public.acknowledge_work_item(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me   uuid := public.get_my_employee_id();
  v_site uuid;
  v_to   uuid[];
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'No active employee record for the signed-in user.';
  END IF;

  SELECT site_uuid, assigned_to INTO v_site, v_to
    FROM public.work_items WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That job no longer exists.';
  END IF;
  IF v_site IS DISTINCT FROM public.get_my_site_uuid() THEN
    RAISE EXCEPTION 'That job belongs to another site.';
  END IF;
  -- A NULL assigned_to is a row predating directed assignment, and still
  -- reads as site-wide rather than as "nobody".
  IF v_to IS NOT NULL AND NOT (v_me = ANY (v_to)) THEN
    RAISE EXCEPTION 'That job was not assigned to you.';
  END IF;

  INSERT INTO public.work_item_acks (work_item_id, employee_id)
  VALUES (p_id, v_me)
  ON CONFLICT (work_item_id, employee_id) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.start_work_item(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    uuid := public.get_my_employee_id();
  v_owner uuid;
  v_state text;
BEGIN
  -- Reuses the identity, site and membership checks, and records the receipt
  -- that starting implies.
  PERFORM public.acknowledge_work_item(p_id);

  -- FOR UPDATE, because the whole point of assigning to several people is that
  -- several people are looking at it. Without the lock, two technicians reading
  -- a NULL assignee in the same moment would both start the same job and the
  -- second write would silently take it off the first.
  SELECT assignee_id, state INTO v_owner, v_state
    FROM public.work_items WHERE id = p_id FOR UPDATE;

  IF v_owner IS NOT NULL AND v_owner IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'Somebody else is already working on that job.';
  END IF;
  IF v_state NOT IN ('OPEN','ACKNOWLEDGED') THEN
    RAISE EXCEPTION 'That job is already %.', lower(replace(v_state, '_', ' '));
  END IF;

  UPDATE public.work_items
     SET assignee_id = v_me,
         state       = 'IN_PROGRESS'
   WHERE id = p_id;
END $$;

GRANT EXECUTE ON FUNCTION public.acknowledge_work_item(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_work_item(uuid)       TO authenticated;

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. VIEWS
--
-- Outside a transaction: CREATE OR REPLACE VIEW fails when the column list
-- changes, so the view is dropped first. Kept apart from the schema changes
-- above so a failure here cannot roll those back.
-- ═══════════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS public.work_queue;
CREATE VIEW public.work_queue AS
SELECT w.id, w.site_uuid, w.title, w.detail, w.kind, w.severity, w.state,
       w.origin, w.source_kind, w.source_ref,
       w.assignee_id, e.full_name AS assignee_name,
       w.assigned_to, w.assigned_scope,
       w.due_at, w.respond_by, w.resolve_by,
       w.acknowledged_at, w.created_at,
       s.label AS severity_label,

       -- array_length returns NULL for an empty array, never 0.
       COALESCE(array_length(w.assigned_to, 1), 0)            AS assigned_count,
       -- Counts only acknowledgements from CURRENT recipients. A job that was
       -- redirected keeps the old rows as history, but counting them would
       -- report a job as fully answered on the strength of a confirmation
       -- from somebody who is no longer being asked.
       (SELECT count(*) FROM public.work_item_acks a
         WHERE a.work_item_id = w.id
           AND (w.assigned_to IS NULL
                OR a.employee_id = ANY (w.assigned_to)))      AS ack_count,

       -- Per-caller, because get_my_employee_id() resolves against the JWT of
       -- whoever is selecting. It saves the technician's queue a second query
       -- to decide whether the button in front of them still applies.
       EXISTS (SELECT 1 FROM public.work_item_acks a
                WHERE a.work_item_id = w.id
                  AND a.employee_id  = public.get_my_employee_id())
                                                              AS i_acknowledged,

       EXTRACT(EPOCH FROM (now() - w.resolve_by)) / 60      AS overdue_minutes,
       (now() > w.resolve_by)                               AS is_breached,
       (w.acknowledged_at IS NULL AND now() > w.respond_by) AS response_breached,

       CASE
         WHEN w.state IN ('RESOLVED','CLOSED','CANCELLED') THEN 'done'
         WHEN now() > w.resolve_by                          THEN 'breached'
         WHEN now() > w.resolve_by - interval '1 hour'      THEN 'due-soon'
         ELSE 'on-track'
       END AS sla_status
  FROM public.work_items w
  JOIN public.sla_targets s ON s.severity = w.severity
  LEFT JOIN public.employees e ON e.id = w.assignee_id;

COMMENT ON VIEW public.work_queue IS
  'Work items with their SLA position resolved, plus acknowledgement counts. '
  'i_acknowledged is relative to the caller.';
