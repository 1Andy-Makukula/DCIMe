-- ============================================================
-- DCIMe "Going Live" Migration
-- Run this in Supabase Dashboard → SQL Editor
-- Safe: uses CREATE TABLE IF NOT EXISTS — won't touch existing tables
-- ============================================================

-- ── Enable uuid extension (idempotent) ─────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── incidents ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.incidents (
  id                 uuid        NOT NULL DEFAULT uuid_generate_v4(),
  ticket_number      text        NOT NULL,
  status             text        NOT NULL DEFAULT 'OPEN'
                     CHECK (status IN ('OPEN', 'RESOLVED')),
  site_name          text        NOT NULL DEFAULT 'NTC ZM 0874',
  asset_id           text        NOT NULL,
  severity           text        NOT NULL
                     CHECK (severity IN ('low', 'medium', 'critical')),
  notes              text        NOT NULL DEFAULT '',
  photo_url          text,
  comments           jsonb       NOT NULL DEFAULT '[]',
  raised_by_name     text        NOT NULL DEFAULT '',
  raised_by_id       text        NOT NULL DEFAULT '',
  occurred_at        timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  resolved_at        timestamptz,
  resolved_by_name   text,
  resolved_by_id     text,
  receipt_number     text,
  impact             text,
  contractor_engaged text,
  resolution_details text,
  CONSTRAINT incidents_pkey PRIMARY KEY (id)
);

ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read incidents" ON public.incidents;
DROP POLICY IF EXISTS "Authenticated users can insert incidents" ON public.incidents;
DROP POLICY IF EXISTS "Authenticated users can update incidents" ON public.incidents;

CREATE POLICY "Authenticated users can read incidents"
  ON public.incidents FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can insert incidents"
  ON public.incidents FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can update incidents"
  ON public.incidents FOR UPDATE USING (auth.role() = 'authenticated');

-- ── shift_reports ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shift_reports (
  log_id                  uuid        NOT NULL DEFAULT uuid_generate_v4(),
  timestamp               timestamptz NOT NULL DEFAULT now(),
  logged_by               text,
  active_power_source     text        NOT NULL DEFAULT 'Mains Active',
  site_id                 text        NOT NULL DEFAULT 'NTC ZM 0874',
  notes                   text        NOT NULL DEFAULT '',
  certified               boolean     NOT NULL DEFAULT false,
  technician_name         text        NOT NULL DEFAULT '',
  technician_id           text        NOT NULL DEFAULT '',
  signature_id            text        NOT NULL DEFAULT '',
  shift_duration          text        NOT NULL DEFAULT '',
  routine_logs_completed  integer     NOT NULL DEFAULT 0,
  incidents_filed         integer     NOT NULL DEFAULT 0,
  CONSTRAINT shift_reports_pkey PRIMARY KEY (log_id)
);

ALTER TABLE public.shift_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read shift_reports" ON public.shift_reports;
DROP POLICY IF EXISTS "Authenticated users can insert shift_reports" ON public.shift_reports;

CREATE POLICY "Authenticated users can read shift_reports"
  ON public.shift_reports FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can insert shift_reports"
  ON public.shift_reports FOR INSERT WITH CHECK (auth.role() = 'authenticated');
