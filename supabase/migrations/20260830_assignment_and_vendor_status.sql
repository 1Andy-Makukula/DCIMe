-- ═══════════════════════════════════════════════════════════════════════════
-- 20260830_assignment_and_vendor_status.sql
-- DCIMe V2 — offering work to several people, and managing the vendor register.
--
-- 1. WHO A JOB IS OFFERED TO
-- assignee_id answers "who owns this", which is the right question once someone
-- has taken it. It cannot express "any of these three, whoever is free" — so
-- dispatching to a crew meant either picking one person up front or dropping
-- the job into a pool nobody feels responsible for.
--
-- offered_to holds the shortlist. NULL means the whole site (a broadcast), an
-- array means those technicians specifically. assignee_id stays single: one
-- person accepts and owns it, which is what makes the SLA clock and the
-- accountability trail meaningful. Offering is not assigning.
--
-- 2. VENDOR STATUS
-- is_active already existed but nothing surfaced it, so a vendor could not be
-- retired. flagged_reason records a contractor you do not want dispatched
-- again without someone reading why first — a note in a spreadsheet is where
-- that knowledge normally dies.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Offering ────────────────────────────────────────────────────────────
ALTER TABLE public.work_items
  ADD COLUMN IF NOT EXISTS offered_to uuid[];

COMMENT ON COLUMN public.work_items.offered_to IS
  'Technicians this job was offered to. NULL = broadcast to the whole site. '
  'Distinct from assignee_id, which is the one person who accepted it.';

-- Answering "what is offered to me" scans this on every technician poll.
CREATE INDEX IF NOT EXISTS idx_work_items_offered
  ON public.work_items USING gin (offered_to)
  WHERE state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS');

-- ── 2. Vendor status ───────────────────────────────────────────────────────
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS flagged_reason text,
  ADD COLUMN IF NOT EXISTS flagged_at     timestamptz;

COMMENT ON COLUMN public.vendors.flagged_reason IS
  'Why this contractor needs review before being dispatched again. NULL = not '
  'flagged. The reason is required: a flag with no explanation cannot be acted on.';

COMMIT;

-- ── 3. Views ───────────────────────────────────────────────────────────────
-- Outside the transaction: CREATE OR REPLACE VIEW fails if the column list
-- changes, so each is dropped first and dependent grants are reapplied by the
-- REPLACE. Splitting them keeps a failure here from rolling back the columns.

DROP VIEW IF EXISTS public.work_queue;
CREATE VIEW public.work_queue AS
SELECT w.id, w.site_uuid, w.title, w.detail, w.kind, w.severity, w.state,
       w.origin, w.source_kind, w.source_ref,
       w.assignee_id, e.full_name AS assignee_name,
       w.offered_to,
       w.due_at, w.respond_by, w.resolve_by,
       w.acknowledged_at, w.created_at,
       s.label AS severity_label,

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

DROP VIEW IF EXISTS public.vendor_activity;
CREATE VIEW public.vendor_activity AS
SELECT ven.id            AS vendor_id,
       ven.name          AS vendor_name,
       ven.speciality,
       ven.sla_hours,
       ven.is_active,
       ven.flagged_reason,
       ven.flagged_at,
       count(DISTINCT v.id)                                   AS visits,
       count(f.id)                                            AS findings,
       count(f.id) FILTER (WHERE f.severity IN ('P1','P2'))   AS serious_findings,
       count(w.id) FILTER (WHERE w.state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS'))
                                                              AS open_work,
       max(v.created_at)                                      AS last_visit
  FROM public.vendors ven
  LEFT JOIN public.contractor_visits    v ON v.vendor_id = ven.id
  LEFT JOIN public.contractor_findings  f ON f.visit_id  = v.id
  LEFT JOIN public.work_items           w ON w.id        = f.work_item_id
 GROUP BY ven.id, ven.name, ven.speciality, ven.sla_hours,
          ven.is_active, ven.flagged_reason, ven.flagged_at;
