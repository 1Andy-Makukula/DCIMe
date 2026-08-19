-- ═══════════════════════════════════════════════════════════════════════════
-- 20260820_work_items.sql
-- DCIMe V2 — the work item spine
--
-- WHY ONE TABLE INSTEAD OF FIVE FEATURES
-- The V1 audit found the same hole five times over: no assignee (G-01), no SLA
-- (G-02), no PM calendar (G-03), no work order (G-04), no change process
-- (G-05). Those are not five gaps. They are one missing primitive —
--
--     something to do, with an OWNER, a DUE TIME and a STATE MACHINE.
--
-- Build it once and the threshold alarm, the maintenance schedule, the SLA
-- clock, the contractor findings loop and planned work all become rows in the
-- same table rather than four disconnected features that never agree.
--
-- This is also what turns DCIMe from a system of RECORD into a system of
-- ENGAGEMENT: V1 faithfully records what a human tells it, but never tells a
-- human what to do next and never holds anyone to a deadline.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. SLA TARGETS
--    V1 has severity but nothing maps it to a response. Severity that implies
--    no obligation is decoration; this table is what gives it teeth.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.sla_targets (
  severity        text PRIMARY KEY,
  label           text NOT NULL,
  respond_minutes integer NOT NULL,
  resolve_minutes integer NOT NULL,
  description     text,

  CONSTRAINT sla_targets_severity_check CHECK (severity IN ('P1','P2','P3','P4')),
  CONSTRAINT sla_targets_order_check    CHECK (resolve_minutes >= respond_minutes)
);

INSERT INTO public.sla_targets (severity, label, respond_minutes, resolve_minutes, description)
VALUES
  ('P1','Critical',   15,   240, 'Service affecting or imminent. Redundancy lost or load at risk.'),
  ('P2','High',       60,  1440, 'Degraded but holding. A second failure would be service affecting.'),
  ('P3','Medium',    240,  4320, 'Needs attention within the working week.'),
  ('P4','Low',      1440, 20160, 'Housekeeping, cosmetic, or opportunistic.')
ON CONFLICT (severity) DO UPDATE
  SET label = EXCLUDED.label,
      respond_minutes = EXCLUDED.respond_minutes,
      resolve_minutes = EXCLUDED.resolve_minutes,
      description = EXCLUDED.description;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. WORK ITEMS
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.work_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_uuid   uuid        NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,

  title       text        NOT NULL,
  detail      text,
  kind        text        NOT NULL,
  severity    text        NOT NULL REFERENCES public.sla_targets(severity),

  -- ── The three things V1 never had ──────────────────────────────────────
  -- NULL assignee is a real state: unassigned work belongs to the queue, and
  -- pretending otherwise hides it. What must never happen is work with no
  -- assignee AND no due time — that is a note, not a job.
  assignee_id uuid        REFERENCES public.employees(id) ON DELETE SET NULL,
  due_at      timestamptz,
  state       text        NOT NULL DEFAULT 'OPEN',

  -- ── Where it came from ─────────────────────────────────────────────────
  -- A technician must be able to see WHY a job appeared, and an auditor must
  -- be able to tell machine-raised work from hand-typed work.
  origin      text        NOT NULL DEFAULT 'SYSTEM',
  source_kind text,
  source_ref  text,

  -- ── The SLA clock ──────────────────────────────────────────────────────
  respond_by      timestamptz,
  resolve_by      timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  resolved_at     timestamptz,
  resolved_by     uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  resolution_note text,

  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid,
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT work_items_kind_check CHECK (
    kind IN ('FAULT','INSPECTION','PREVENTIVE','FINDING','CHANGE')),

  -- OPEN -> ACKNOWLEDGED -> IN_PROGRESS -> RESOLVED -> CLOSED, or CANCELLED.
  CONSTRAINT work_items_state_check CHECK (
    state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS','RESOLVED','CLOSED','CANCELLED')),

  CONSTRAINT work_items_origin_check CHECK (
    origin IN ('SYSTEM','TECHNICIAN','CONTRACTOR','ADMIN')),

  -- Resolved work must say what happened. A ticket closed with no note is the
  -- commonest way an operations history becomes worthless.
  CONSTRAINT work_items_resolution_check CHECK (
    state NOT IN ('RESOLVED','CLOSED') OR resolution_note IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_work_items_queue
  ON public.work_items (site_uuid, state, due_at)
  WHERE state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS');

CREATE INDEX IF NOT EXISTS idx_work_items_assignee
  ON public.work_items (assignee_id, state)
  WHERE state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS');

-- ── Idempotency for machine-raised work ───────────────────────────────────
-- Threshold evaluation runs continuously. Without this, one hot room raises a
-- fresh ticket every cycle and the queue becomes unusable within a day — the
-- classic way automated alerting gets switched off and never switched back on.
--
-- Partial, so the same source CAN raise a new item once the previous one is
-- closed. A fault that recurs next month is genuinely new work.
CREATE UNIQUE INDEX IF NOT EXISTS uq_work_items_open_source
  ON public.work_items (site_uuid, source_kind, source_ref)
  WHERE source_kind IS NOT NULL
    AND state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS');


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. STATE MACHINE
--    Enforced in a trigger rather than trusted to callers: three different code
--    paths already close incidents in V1, each with its own rules, and the
--    ledger is inconsistent as a result (audit C-04).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.work_items_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
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
    IF NEW.state = 'ACKNOWLEDGED' AND NEW.acknowledged_at IS NULL THEN
      NEW.acknowledged_at := now();
    END IF;
    IF NEW.state = 'RESOLVED' AND NEW.resolved_at IS NULL THEN
      NEW.resolved_at := now();
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_work_items_guard ON public.work_items;
CREATE TRIGGER trg_work_items_guard
  BEFORE INSERT OR UPDATE ON public.work_items
  FOR EACH ROW EXECUTE FUNCTION public.work_items_guard();


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. RAISING WORK
--    The single entry point for every producer. Returns the existing item when
--    one is already open for the same source, so a caller can fire freely
--    without checking first.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.raise_work_item(
  p_site_uuid   uuid,
  p_title       text,
  p_severity    text,
  p_kind        text    DEFAULT 'FAULT',
  p_detail      text    DEFAULT NULL,
  p_origin      text    DEFAULT 'SYSTEM',
  p_source_kind text    DEFAULT NULL,
  p_source_ref  text    DEFAULT NULL,
  p_assignee    uuid    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER   -- callable from a scheduled job with no user session
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_source_kind IS NOT NULL THEN
    SELECT id INTO v_id FROM public.work_items
     WHERE site_uuid = p_site_uuid
       AND source_kind = p_source_kind
       AND source_ref IS NOT DISTINCT FROM p_source_ref
       AND state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS')
     LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN v_id;   -- already raised and still open
    END IF;
  END IF;

  INSERT INTO public.work_items
    (site_uuid, title, detail, kind, severity, origin,
     source_kind, source_ref, assignee_id)
  VALUES
    (p_site_uuid, p_title, p_detail, p_kind, p_severity, p_origin,
     p_source_kind, p_source_ref, p_assignee)
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.raise_work_item IS
  'The single entry point for creating work. Idempotent per (site, source_kind, '
  'source_ref) while an item is still open, so producers can fire on every cycle.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. THE QUEUE
--    What a technician opens. Ordered by what is most overdue, because a list
--    ordered by creation date teaches people to work on the wrong thing.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.work_queue AS
SELECT w.id, w.site_uuid, w.title, w.detail, w.kind, w.severity, w.state,
       w.origin, w.source_kind, w.source_ref,
       w.assignee_id, e.full_name AS assignee_name,
       w.due_at, w.respond_by, w.resolve_by,
       w.acknowledged_at, w.created_at,
       s.label AS severity_label,

       -- Minutes past the resolution target. Negative means time remaining.
       EXTRACT(EPOCH FROM (now() - w.resolve_by)) / 60      AS overdue_minutes,
       (now() > w.resolve_by)                               AS is_breached,
       -- Response is a separate obligation: unacknowledged work is nobody's,
       -- and measuring it separately is what makes MTTA possible.
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
  'Work with its SLA position resolved. Order by is_breached DESC, resolve_by ASC '
  'for a queue that puts the most overdue work first.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. RLS
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.work_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SLA targets: authenticated read" ON public.sla_targets;
CREATE POLICY "SLA targets: authenticated read"
  ON public.sla_targets FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "SLA targets: admin write" ON public.sla_targets;
CREATE POLICY "SLA targets: admin write"
  ON public.sla_targets FOR ALL
  USING (public.get_my_role() = 'ADMIN')
  WITH CHECK (public.get_my_role() = 'ADMIN');

-- Everyone at the site sees the whole queue. Work you cannot see is work you
-- cannot pick up, and hiding unassigned items is how a queue silently stalls.
DROP POLICY IF EXISTS "Work items: site-scoped read" ON public.work_items;
CREATE POLICY "Work items: site-scoped read"
  ON public.work_items FOR SELECT
  USING (auth.role() = 'authenticated' AND site_uuid = public.get_my_site_uuid());

DROP POLICY IF EXISTS "Work items: site-scoped insert" ON public.work_items;
CREATE POLICY "Work items: site-scoped insert"
  ON public.work_items FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND site_uuid = public.get_my_site_uuid());

DROP POLICY IF EXISTS "Work items: site-scoped update" ON public.work_items;
CREATE POLICY "Work items: site-scoped update"
  ON public.work_items FOR UPDATE
  USING (auth.role() = 'authenticated' AND site_uuid = public.get_my_site_uuid())
  WITH CHECK (site_uuid = public.get_my_site_uuid());

GRANT EXECUTE ON FUNCTION public.raise_work_item(uuid,text,text,text,text,text,text,text,uuid)
  TO authenticated;

COMMIT;
