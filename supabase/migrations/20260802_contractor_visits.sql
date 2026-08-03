-- ============================================================
-- DCIMe — Contractor Visits Logbook
-- Run in Supabase Dashboard → SQL Editor
-- Safe: CREATE TABLE IF NOT EXISTS + idempotent policy drops
--
-- WHY THIS TABLE EXISTS
-- Logging a contractor site visit used to INSERT an incident row with
-- status = 'RESOLVED'. That produced false reporting: a fault appeared
-- to have been fixed simply because a contractor was physically on site,
-- and routine inspections polluted the fault ledger.
--
-- Inspections and repairs are different events. A repair closes a fault
-- ticket (incidents.status OPEN -> RESOLVED, unchanged by this migration).
-- An inspection is an observation and must never alter ticket status —
-- so it gets its own table rather than a fake incident.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.contractor_visits (
  id             uuid        NOT NULL DEFAULT uuid_generate_v4(),
  site_uuid      uuid        NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  visit_number   text        NOT NULL,

  -- Why the contractor came, in the technician's own words.
  -- Deliberately freeform: contractors perform an open-ended range of work and
  -- any fixed enum would force real visits into the wrong bucket.
  purpose        text        NOT NULL,

  -- What the visit was aimed at.
  --   SITE   -> whole-site walk-through, target_ref is NULL
  --   ASSET  -> target_ref holds equipment_registry.equipment_id
  --   TICKET -> target_ref holds incidents.id (inspected, NOT resolved)
  target_type    text        NOT NULL
                 CHECK (target_type IN ('SITE', 'ASSET', 'TICKET')),
  target_ref     text,

  contractor     text        NOT NULL,
  notes          text        NOT NULL DEFAULT '',
  photo_url      text,

  logged_by_name text        NOT NULL DEFAULT '',
  logged_by_id   text        NOT NULL DEFAULT '',

  occurred_at    timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT contractor_visits_pkey PRIMARY KEY (id),

  -- An asset or ticket visit is meaningless without naming its target;
  -- a whole-site visit must not carry a dangling one.
  CONSTRAINT contractor_visits_target_ref_ck CHECK (
    (target_type =  'SITE' AND target_ref IS NULL) OR
    (target_type <> 'SITE' AND target_ref IS NOT NULL)
  )
);

-- History is read newest-first, always filtered by site.
CREATE INDEX IF NOT EXISTS contractor_visits_site_occurred_idx
  ON public.contractor_visits (site_uuid, occurred_at DESC);

-- Lets a fault ticket's timeline pull its inspection log cheaply.
CREATE INDEX IF NOT EXISTS contractor_visits_target_ref_idx
  ON public.contractor_visits (target_ref)
  WHERE target_ref IS NOT NULL;

-- ── RLS ─────────────────────────────────────────────────────
-- Site-scoped through get_my_site_uuid(), matching every other
-- operational table. That helper already gates on status='Active',
-- so a revoked employee loses access here too with no extra work.
ALTER TABLE public.contractor_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Contractor visits: site-scoped read"   ON public.contractor_visits;
DROP POLICY IF EXISTS "Contractor visits: site-scoped insert" ON public.contractor_visits;

CREATE POLICY "Contractor visits: site-scoped read"
  ON public.contractor_visits FOR SELECT
  USING (site_uuid = public.get_my_site_uuid());

CREATE POLICY "Contractor visits: site-scoped insert"
  ON public.contractor_visits FOR INSERT
  WITH CHECK (site_uuid = public.get_my_site_uuid());

-- Deliberately no UPDATE or DELETE policy. A visit log is an audit
-- record of what was observed at a point in time; corrections belong in
-- a new entry, not a rewrite of the old one.
