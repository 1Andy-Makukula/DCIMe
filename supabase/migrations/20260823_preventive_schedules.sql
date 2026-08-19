-- ═══════════════════════════════════════════════════════════════════════════
-- 20260823_preventive_schedules.sql
-- DCIMe V2 — planned maintenance raises itself
--
-- The audit's G-03: no PM calendar, no service intervals, no run-hour triggers
-- — "despite collecting cumulative_hrs hourly". Every generator here reports
-- its cumulative run hours on every round, and nothing has ever read them.
--
-- So a 250-hour service depends on somebody remembering. It is the clearest
-- case in the whole system of data captured but never governed.
--
-- RUN HOURS, NOT THE CALENDAR. A generator that ran 400 hours in a month needs
-- servicing sooner than one that ran 12, and a monthly reminder is wrong in
-- both directions — early enough to waste a visit, late enough to miss a
-- failure. Calendar intervals are supported too, for things that genuinely age
-- with time rather than use.
--
-- Depends on: 20260820_work_items.sql
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. SCHEDULES
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.maintenance_schedules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_uuid     uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,

  -- Attach to one machine, or to every instance of a template. A "250-hour
  -- generator service" is a property of the model, not of one unit, and
  -- writing it per machine guarantees the fleet drifts out of step.
  equipment_id  text REFERENCES public.equipment_registry(equipment_id) ON DELETE CASCADE,
  template_id   text REFERENCES public.equipment_templates(template_id) ON DELETE CASCADE,

  task          text NOT NULL,
  detail        text,
  severity      text NOT NULL DEFAULT 'P3' REFERENCES public.sla_targets(severity),

  -- ── The trigger ────────────────────────────────────────────────────────
  --   RUN_HOURS : fires when the meter passes last_done + interval_hours
  --   CALENDAR  : fires when interval_days have elapsed
  basis         text NOT NULL,
  interval_hours integer,
  interval_days  integer,
  -- The metric carrying the running total, e.g. 'cumulative_hrs'. Suffixed onto
  -- the equipment's metric prefix, so it survives equipment being renamed.
  hours_metric  text,

  -- ── Last completion ────────────────────────────────────────────────────
  last_done_at    timestamptz,
  last_done_hours double precision,

  -- Raise the job before it is due, so it can be planned rather than scrambled.
  lead_hours    integer NOT NULL DEFAULT 24,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sched_basis_check CHECK (basis IN ('RUN_HOURS','CALENDAR')),
  -- Exactly one target: both would double-raise, neither is unattached.
  CONSTRAINT sched_target_check CHECK (num_nonnulls(equipment_id, template_id) = 1),
  -- A basis with no interval is a schedule that can never fire.
  CONSTRAINT sched_interval_check CHECK (
    (basis = 'RUN_HOURS' AND interval_hours IS NOT NULL AND hours_metric IS NOT NULL)
    OR (basis = 'CALENDAR' AND interval_days IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_schedules_site
  ON public.maintenance_schedules (site_uuid) WHERE is_active;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. WHAT IS DUE
--
--    Resolves template schedules onto every matching machine, reads each one's
--    latest meter, and reports how much life is left.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.maintenance_due AS
WITH expanded AS (
  -- One row per (schedule, machine): a template schedule fans out across the
  -- fleet, an equipment schedule stays as one.
  SELECT s.*, e.equipment_id AS target_equipment, e.name AS equipment_name,
         COALESCE(e.metric_prefix, e.equipment_id) AS prefix
    FROM public.maintenance_schedules s
    JOIN public.equipment_registry e
      ON (s.equipment_id = e.equipment_id
          OR (s.template_id IS NOT NULL AND e.template_id = s.template_id
              AND e.site_uuid = s.site_uuid))
   WHERE s.is_active AND e.is_active
),
metered AS (
  SELECT x.*,
         (SELECT (t.metrics ->> (x.prefix || '_' || x.hours_metric))::double precision
            FROM public.telemetry_logs t
           WHERE t.site_uuid = x.site_uuid
             AND t.asset_id = x.target_equipment
             AND t.metrics ? (x.prefix || '_' || x.hours_metric)
             -- Latest by the hour it describes, so a backdated entry cannot
             -- masquerade as the current meter reading.
           ORDER BY t.target_hour DESC LIMIT 1) AS current_hours
    FROM expanded x
   WHERE x.basis = 'RUN_HOURS'
  UNION ALL
  SELECT x.*, NULL::double precision FROM expanded x WHERE x.basis = 'CALENDAR'
)
SELECT m.id AS schedule_id, m.site_uuid, m.target_equipment, m.equipment_name,
       m.task, m.detail, m.severity, m.basis, m.lead_hours,
       m.current_hours,
       m.last_done_hours, m.last_done_at,

       CASE WHEN m.basis = 'RUN_HOURS'
            -- Never serviced: treat the meter itself as elapsed life.
            THEN COALESCE(m.last_done_hours, 0) + m.interval_hours
       END AS due_at_hours,

       CASE WHEN m.basis = 'RUN_HOURS' AND m.current_hours IS NOT NULL
            THEN (COALESCE(m.last_done_hours, 0) + m.interval_hours) - m.current_hours
       END AS hours_remaining,

       CASE WHEN m.basis = 'CALENDAR'
            THEN COALESCE(m.last_done_at, m.created_at) + make_interval(days => m.interval_days)
       END AS due_date,

       CASE
         WHEN m.basis = 'RUN_HOURS' AND m.current_hours IS NULL THEN 'no-meter'
         WHEN m.basis = 'RUN_HOURS'
              AND m.current_hours >= COALESCE(m.last_done_hours,0) + m.interval_hours THEN 'due'
         WHEN m.basis = 'RUN_HOURS'
              AND m.current_hours >= COALESCE(m.last_done_hours,0) + m.interval_hours - m.lead_hours THEN 'due-soon'
         WHEN m.basis = 'CALENDAR'
              AND now() >= COALESCE(m.last_done_at, m.created_at) + make_interval(days => m.interval_days) THEN 'due'
         WHEN m.basis = 'CALENDAR'
              AND now() >= COALESCE(m.last_done_at, m.created_at) + make_interval(days => m.interval_days)
                          - make_interval(hours => m.lead_hours) THEN 'due-soon'
         ELSE 'ok'
       END AS status
  FROM metered m;

COMMENT ON VIEW public.maintenance_due IS
  'Every schedule resolved onto its machine with remaining life. status is '
  'ok | due-soon | due | no-meter. no-meter means the schedule is blind, which '
  'is a data problem, not a healthy machine.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. RAISING PLANNED WORK
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.raise_due_maintenance(p_site_uuid uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d       record;
  v_count int := 0;
  v_id    uuid;
BEGIN
  FOR d IN
    SELECT * FROM public.maintenance_due
     WHERE status IN ('due','due-soon')
       AND (p_site_uuid IS NULL OR site_uuid = p_site_uuid)
  LOOP
    -- Keyed on schedule + machine, so a fleet-wide schedule raises one job per
    -- generator rather than one job for all of them.
    v_id := public.raise_work_item(
      p_site_uuid   => d.site_uuid,
      p_title       => d.task || ' — ' || d.equipment_name,
      p_severity    => d.severity,
      p_kind        => 'PREVENTIVE',
      p_detail      => COALESCE(d.detail || E'\n\n', '')
                       || CASE
                            WHEN d.basis = 'RUN_HOURS' THEN
                              'Meter reads ' || round(d.current_hours::numeric, 1)
                              || ' hours; service due at ' || round(d.due_at_hours::numeric, 1) || '.'
                            ELSE
                              'Scheduled every ' || d.lead_hours || 'h lead, due ' || d.due_date::date || '.'
                          END,
      p_origin      => 'SYSTEM',
      p_source_kind => 'SCHEDULE',
      p_source_ref  => d.schedule_id::text || '.' || d.target_equipment
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. COMPLETION RESETS THE CLOCK
--
--    Without this the schedule fires forever: the job is closed, the meter is
--    still past the threshold, and the next evaluation raises it again. The
--    completion has to move the baseline, which is the whole point of recording
--    that a service happened.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.complete_maintenance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_sched uuid;
  v_equip text;
  v_hours double precision;
BEGIN
  IF NEW.state <> 'RESOLVED' OR OLD.state = 'RESOLVED' THEN RETURN NEW; END IF;
  IF NEW.source_kind <> 'SCHEDULE' OR NEW.source_ref IS NULL THEN RETURN NEW; END IF;

  v_sched := split_part(NEW.source_ref, '.', 1)::uuid;
  v_equip := split_part(NEW.source_ref, '.', 2);

  SELECT d.current_hours INTO v_hours
    FROM public.maintenance_due d
   WHERE d.schedule_id = v_sched AND d.target_equipment = v_equip;

  UPDATE public.maintenance_schedules
     SET last_done_at    = now(),
         -- Baselined against the meter AT COMPLETION, not the threshold that
         -- triggered it. A service done 40 hours late must not silently shorten
         -- the next interval by 40 hours.
         last_done_hours = COALESCE(v_hours, last_done_hours)
   WHERE id = v_sched;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_complete_maintenance ON public.work_items;
CREATE TRIGGER trg_complete_maintenance
  AFTER UPDATE OF state ON public.work_items
  FOR EACH ROW EXECUTE FUNCTION public.complete_maintenance();


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. RLS
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.maintenance_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Schedules: site-scoped read" ON public.maintenance_schedules;
CREATE POLICY "Schedules: site-scoped read"
  ON public.maintenance_schedules FOR SELECT
  USING (auth.role() = 'authenticated' AND site_uuid = public.get_my_site_uuid());

DROP POLICY IF EXISTS "Schedules: admin write" ON public.maintenance_schedules;
CREATE POLICY "Schedules: admin write"
  ON public.maintenance_schedules FOR ALL
  USING (public.get_my_role() = 'ADMIN' AND site_uuid = public.get_my_site_uuid())
  WITH CHECK (public.get_my_role() = 'ADMIN' AND site_uuid = public.get_my_site_uuid());

GRANT EXECUTE ON FUNCTION public.raise_due_maintenance(uuid) TO authenticated;

COMMIT;
