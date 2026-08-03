-- ============================================================
-- DCIMe — Explicit Shift Sessions
-- Run in Supabase Dashboard → SQL Editor
-- Safe: CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS throughout
--
-- WHY THIS EXISTS
-- Shift was previously inferred from the wall clock (new Date().getHours()).
-- That is ambiguous at the boundaries: a log written at 18:05 could be a late
-- Day Shift entry or an early Night Shift one, and nothing in the data says
-- which. Binding each record to an explicit session the technician opened
-- removes the guesswork.
--
-- ROLLOUT DECISIONS (agreed before writing this):
--   • Check-in is a SOFT prompt. shift_session_id is NULLABLE everywhere, so
--     a technician who skips check-in can still log telemetry.
--   • Existing history is NOT backfilled. Rows predating this migration keep
--     shift_session_id NULL and stay queryable by timestamp, exactly as today.
--     No shift boundaries are invented for data that never recorded them.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Helper: the caller's own employees.id ───────────────────
-- Mirrors get_my_site_uuid()/get_my_role(): SECURITY DEFINER so policies can
-- use it without recursing through RLS, and gated on status='Active' so a
-- revoked employee cannot open or continue a shift.
CREATE OR REPLACE FUNCTION public.get_my_employee_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.employees WHERE auth_id = auth.uid() AND status = 'Active' LIMIT 1;
$$;

-- ── shift_sessions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shift_sessions (
  id              uuid        NOT NULL DEFAULT uuid_generate_v4(),
  employee_id     uuid        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  site_uuid       uuid        NOT NULL REFERENCES public.sites(id)     ON DELETE CASCADE,

  shift_type      text        NOT NULL
                  CHECK (shift_type IN ('DAY_SHIFT', 'NIGHT_SHIFT', 'CUSTOM')),

  status          text        NOT NULL DEFAULT 'ACTIVE'
                  CHECK (status IN ('ACTIVE', 'CLOSED', 'HANDOVER_COMPLETED')),

  checked_in_at   timestamptz NOT NULL DEFAULT now(),
  checked_out_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT shift_sessions_pkey PRIMARY KEY (id),

  -- A closed session must record when it closed, and an open one must not.
  CONSTRAINT shift_sessions_checkout_ck CHECK (
    (status = 'ACTIVE'  AND checked_out_at IS NULL) OR
    (status <> 'ACTIVE' AND checked_out_at IS NOT NULL)
  )
);

-- One open shift per technician. Without this, a double tap on "check in" or a
-- second device opens a parallel session and the on-shift count double-counts.
CREATE UNIQUE INDEX IF NOT EXISTS shift_sessions_one_active_per_employee
  ON public.shift_sessions (employee_id)
  WHERE status = 'ACTIVE';

-- Drives the "Currently On-Shift" counter and per-site session lookups.
CREATE INDEX IF NOT EXISTS shift_sessions_site_status_idx
  ON public.shift_sessions (site_uuid, status);

-- ── Attach transactional tables to a session ────────────────
-- NULLABLE by design (soft rollout) and ON DELETE SET NULL, never CASCADE:
-- removing a shift session must never delete the telemetry logged during it.
ALTER TABLE public.telemetry_logs
  ADD COLUMN IF NOT EXISTS shift_session_id uuid
  REFERENCES public.shift_sessions(id) ON DELETE SET NULL;

ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS shift_session_id uuid
  REFERENCES public.shift_sessions(id) ON DELETE SET NULL;

ALTER TABLE public.shift_reports
  ADD COLUMN IF NOT EXISTS shift_session_id uuid
  REFERENCES public.shift_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS telemetry_logs_shift_session_idx
  ON public.telemetry_logs (shift_session_id) WHERE shift_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS incidents_shift_session_idx
  ON public.incidents (shift_session_id) WHERE shift_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS shift_reports_shift_session_idx
  ON public.shift_reports (shift_session_id) WHERE shift_session_id IS NOT NULL;

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.shift_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shift sessions: site-scoped read"  ON public.shift_sessions;
DROP POLICY IF EXISTS "Shift sessions: check in as self"  ON public.shift_sessions;
DROP POLICY IF EXISTS "Shift sessions: close own session" ON public.shift_sessions;

-- Everyone at the site can read sessions: admins need this for the on-shift
-- roster, and the incoming shift needs to see who they are taking over from.
CREATE POLICY "Shift sessions: site-scoped read"
  ON public.shift_sessions FOR SELECT
  USING (site_uuid = public.get_my_site_uuid());

-- You may only check yourself in, and only at your own site.
CREATE POLICY "Shift sessions: check in as self"
  ON public.shift_sessions FOR INSERT
  WITH CHECK (
    employee_id = public.get_my_employee_id()
    AND site_uuid = public.get_my_site_uuid()
  );

-- You may only close your own session, and the row must stay yours.
CREATE POLICY "Shift sessions: close own session"
  ON public.shift_sessions FOR UPDATE
  USING      (employee_id = public.get_my_employee_id())
  WITH CHECK (employee_id = public.get_my_employee_id());

-- No DELETE policy: a completed shift is an audit record. Closing sets
-- status='CLOSED', it does not remove the row.
