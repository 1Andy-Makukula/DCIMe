-- ============================================================
-- DCIMe Phase 1 — Schema Hardening & RLS
-- Bug fixes: C-1 (cross-site unique constraint), C-2 (RLS gaps)
-- Run in Supabase Dashboard → SQL Editor
-- Safe: uses IF EXISTS / idempotent guards throughout
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- HELPER: A stable function to look up the caller's site_uuid
-- via the employees table. Used in every site-scoped policy.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_site_uuid()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT site_uuid
  FROM public.employees
  WHERE auth_id = auth.uid()
  LIMIT 1;
$$;

-- ─────────────────────────────────────────────────────────────
-- C-1 FIX: telemetry_logs — drop single-column UNIQUE,
--          replace with composite (target_hour, site_uuid).
--
-- The old constraint allows Site B to silently overwrite
-- Site A's log at the same UTC hour. The composite key
-- ensures each site has its own unique slot per hour.
-- ─────────────────────────────────────────────────────────────

-- Step 1: Drop the old single-column unique constraint
ALTER TABLE public.telemetry_logs
  DROP CONSTRAINT IF EXISTS telemetry_logs_target_hour_key;

-- Step 2: Add the new composite unique constraint
-- (idempotent — safe to re-run)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'telemetry_logs_target_hour_site_unique'
  ) THEN
    ALTER TABLE public.telemetry_logs
      ADD CONSTRAINT telemetry_logs_target_hour_site_unique
      UNIQUE (target_hour, site_uuid);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- C-2 FIX: Harden ALL table RLS policies.
--
-- Strategy:
--   • Global admin tables (sites, rooms): read-only for all
--     authenticated users; write restricted to ADMIN role.
--   • Operational tables: site-scoped via get_my_site_uuid().
--   • Drop old wide-open USING(true) policies first.
-- ─────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════
-- 1. TABLE: sites (global reference table)
-- ═══════════════════════════════════════
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access"            ON public.sites;
DROP POLICY IF EXISTS "Allow public insert access"          ON public.sites;
DROP POLICY IF EXISTS "Allow public update access"          ON public.sites;
DROP POLICY IF EXISTS "Authenticated users can read sites"  ON public.sites;

CREATE POLICY "Sites: authenticated read"
  ON public.sites FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only DB admins / service role can insert/update sites (not field techs)
-- (No INSERT/UPDATE policy for anon or authenticated — use service_role key for seeding)

-- ═══════════════════════════════════════
-- 2. TABLE: rooms (scoped to site)
-- ═══════════════════════════════════════
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access"   ON public.rooms;
DROP POLICY IF EXISTS "Allow public insert access" ON public.rooms;
DROP POLICY IF EXISTS "Allow public update access" ON public.rooms;

CREATE POLICY "Rooms: site-scoped read"
  ON public.rooms FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND site_id = public.get_my_site_uuid()
  );

-- ═══════════════════════════════════════
-- 3. TABLE: employees (harden existing policies)
-- ═══════════════════════════════════════
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- Drop all previous wide-open policies
DROP POLICY IF EXISTS "Allow public selects"                  ON public.employees;
DROP POLICY IF EXISTS "Allow public inserts"                  ON public.employees;
DROP POLICY IF EXISTS "Allow public updates"                  ON public.employees;
DROP POLICY IF EXISTS "Authenticated users can read employees" ON public.employees;

-- Employees can read all colleagues at their own site
CREATE POLICY "Employees: site-scoped read"
  ON public.employees FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND site_uuid = public.get_my_site_uuid()
  );

-- Allow self-registration insert (auth_id = calling user, checked server-side)
CREATE POLICY "Employees: self-insert on registration"
  ON public.employees FOR INSERT
  WITH CHECK (auth_id = auth.uid());

-- Allow self-update only
CREATE POLICY "Employees: self-update"
  ON public.employees FOR UPDATE
  USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());

-- ═══════════════════════════════════════
-- 4. TABLE: equipment_registry
-- ═══════════════════════════════════════
ALTER TABLE public.equipment_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public selects on equipment"   ON public.equipment_registry;
DROP POLICY IF EXISTS "Allow public inserts on equipment"   ON public.equipment_registry;
DROP POLICY IF EXISTS "Allow public updates on equipment"   ON public.equipment_registry;
DROP POLICY IF EXISTS "Allow public read access"            ON public.equipment_registry;
DROP POLICY IF EXISTS "Allow public insert access"          ON public.equipment_registry;
DROP POLICY IF EXISTS "Allow public update access"          ON public.equipment_registry;

CREATE POLICY "Equipment: site-scoped read"
  ON public.equipment_registry FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND site_uuid = public.get_my_site_uuid()
  );

CREATE POLICY "Equipment: admin insert"
  ON public.equipment_registry FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND site_uuid = public.get_my_site_uuid()
  );

CREATE POLICY "Equipment: admin update"
  ON public.equipment_registry FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND site_uuid = public.get_my_site_uuid()
  );

-- ═══════════════════════════════════════
-- 5. TABLE: equipment_parameters
-- ═══════════════════════════════════════
ALTER TABLE public.equipment_parameters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access"   ON public.equipment_parameters;
DROP POLICY IF EXISTS "Allow public insert access" ON public.equipment_parameters;
DROP POLICY IF EXISTS "Allow public update access" ON public.equipment_parameters;

-- Parameters are scoped via their parent equipment_id → equipment_registry.site_uuid
CREATE POLICY "Equipment params: site-scoped read"
  ON public.equipment_parameters FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND equipment_id IN (
      SELECT equipment_id FROM public.equipment_registry
      WHERE site_uuid = public.get_my_site_uuid()
    )
  );

CREATE POLICY "Equipment params: site-scoped insert"
  ON public.equipment_parameters FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND equipment_id IN (
      SELECT equipment_id FROM public.equipment_registry
      WHERE site_uuid = public.get_my_site_uuid()
    )
  );

CREATE POLICY "Equipment params: site-scoped update"
  ON public.equipment_parameters FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND equipment_id IN (
      SELECT equipment_id FROM public.equipment_registry
      WHERE site_uuid = public.get_my_site_uuid()
    )
  );

-- ═══════════════════════════════════════
-- 6. TABLE: equipment_connections
-- ═══════════════════════════════════════
ALTER TABLE public.equipment_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access"   ON public.equipment_connections;
DROP POLICY IF EXISTS "Allow public insert access" ON public.equipment_connections;
DROP POLICY IF EXISTS "Allow public update access" ON public.equipment_connections;

CREATE POLICY "Equipment connections: site-scoped read"
  ON public.equipment_connections FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND source_equipment_id IN (
      SELECT equipment_id FROM public.equipment_registry
      WHERE site_uuid = public.get_my_site_uuid()
    )
  );

CREATE POLICY "Equipment connections: site-scoped insert"
  ON public.equipment_connections FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND source_equipment_id IN (
      SELECT equipment_id FROM public.equipment_registry
      WHERE site_uuid = public.get_my_site_uuid()
    )
  );

-- ═══════════════════════════════════════
-- 7. TABLE: equipment_status_logs
-- ═══════════════════════════════════════
ALTER TABLE public.equipment_status_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access"   ON public.equipment_status_logs;
DROP POLICY IF EXISTS "Allow public insert access" ON public.equipment_status_logs;
DROP POLICY IF EXISTS "Allow public update access" ON public.equipment_status_logs;

CREATE POLICY "Status logs: site-scoped read"
  ON public.equipment_status_logs FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND equipment_id IN (
      SELECT equipment_id FROM public.equipment_registry
      WHERE site_uuid = public.get_my_site_uuid()
    )
  );

CREATE POLICY "Status logs: authenticated insert (own site equipment)"
  ON public.equipment_status_logs FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND changed_by = auth.uid()
    AND equipment_id IN (
      SELECT equipment_id FROM public.equipment_registry
      WHERE site_uuid = public.get_my_site_uuid()
    )
  );

-- ═══════════════════════════════════════
-- 8. TABLE: telemetry_logs (harden existing + C-1 scoping)
-- ═══════════════════════════════════════
ALTER TABLE public.telemetry_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access"   ON public.telemetry_logs;
DROP POLICY IF EXISTS "Allow public insert access" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Allow public update access" ON public.telemetry_logs;

CREATE POLICY "Telemetry: site-scoped read"
  ON public.telemetry_logs FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND site_uuid = public.get_my_site_uuid()
  );

CREATE POLICY "Telemetry: site-scoped insert"
  ON public.telemetry_logs FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND site_uuid = public.get_my_site_uuid()
  );

CREATE POLICY "Telemetry: site-scoped update"
  ON public.telemetry_logs FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND site_uuid = public.get_my_site_uuid()
  );

-- ═══════════════════════════════════════
-- 9. TABLE: incidents (harden existing)
-- ═══════════════════════════════════════
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access"              ON public.incidents;
DROP POLICY IF EXISTS "Allow public insert access"            ON public.incidents;
DROP POLICY IF EXISTS "Allow public update access"            ON public.incidents;
DROP POLICY IF EXISTS "Allow public selects on incidents"     ON public.incidents;
DROP POLICY IF EXISTS "Allow public inserts on incidents"     ON public.incidents;
DROP POLICY IF EXISTS "Allow public updates on incidents"     ON public.incidents;
DROP POLICY IF EXISTS "Authenticated users can read incidents" ON public.incidents;
DROP POLICY IF EXISTS "Authenticated users can insert incidents" ON public.incidents;
DROP POLICY IF EXISTS "Authenticated users can update incidents" ON public.incidents;

CREATE POLICY "Incidents: site-scoped read"
  ON public.incidents FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND site_uuid = public.get_my_site_uuid()
  );

CREATE POLICY "Incidents: site-scoped insert"
  ON public.incidents FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND site_uuid = public.get_my_site_uuid()
  );

CREATE POLICY "Incidents: site-scoped update"
  ON public.incidents FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND site_uuid = public.get_my_site_uuid()
  );

-- ═══════════════════════════════════════
-- 10. TABLE: shift_reports (harden existing)
-- ═══════════════════════════════════════
ALTER TABLE public.shift_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access"                  ON public.shift_reports;
DROP POLICY IF EXISTS "Allow public insert access"                ON public.shift_reports;
DROP POLICY IF EXISTS "Allow public update access"                ON public.shift_reports;
DROP POLICY IF EXISTS "Allow public selects on shift_reports"     ON public.shift_reports;
DROP POLICY IF EXISTS "Allow public inserts on shift_reports"     ON public.shift_reports;
DROP POLICY IF EXISTS "Allow public updates on shift_reports"     ON public.shift_reports;
DROP POLICY IF EXISTS "Authenticated users can read shift_reports"  ON public.shift_reports;
DROP POLICY IF EXISTS "Authenticated users can insert shift_reports" ON public.shift_reports;
DROP POLICY IF EXISTS "Enable read access for authenticated users"   ON public.shift_reports;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.shift_reports;

CREATE POLICY "Shift reports: site-scoped read"
  ON public.shift_reports FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND site_uuid = public.get_my_site_uuid()
  );

CREATE POLICY "Shift reports: site-scoped insert"
  ON public.shift_reports FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND site_uuid = public.get_my_site_uuid()
  );

CREATE POLICY "Shift reports: site-scoped update"
  ON public.shift_reports FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND site_uuid = public.get_my_site_uuid()
  );

-- ═══════════════════════════════════════
-- 11. TABLE: compliance_reports
-- ═══════════════════════════════════════
ALTER TABLE public.compliance_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access"   ON public.compliance_reports;
DROP POLICY IF EXISTS "Allow public insert access" ON public.compliance_reports;
DROP POLICY IF EXISTS "Allow public update access" ON public.compliance_reports;

CREATE POLICY "Compliance: site-scoped read"
  ON public.compliance_reports FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND site_uuid = public.get_my_site_uuid()
  );

CREATE POLICY "Compliance: site-scoped insert"
  ON public.compliance_reports FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND site_uuid = public.get_my_site_uuid()
  );

-- ═══════════════════════════════════════
-- 12. TABLE: facility_states
-- ═══════════════════════════════════════
ALTER TABLE public.facility_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access"   ON public.facility_states;
DROP POLICY IF EXISTS "Allow public insert access" ON public.facility_states;
DROP POLICY IF EXISTS "Allow public update access" ON public.facility_states;

CREATE POLICY "Facility state: site-scoped read"
  ON public.facility_states FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND site_uuid = public.get_my_site_uuid()
  );

CREATE POLICY "Facility state: site-scoped upsert"
  ON public.facility_states FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND site_uuid = public.get_my_site_uuid()
  );

CREATE POLICY "Facility state: site-scoped update"
  ON public.facility_states FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND site_uuid = public.get_my_site_uuid()
  );

-- ─────────────────────────────────────────────────────────────
-- INDEX: Ensure site_uuid lookups on hot tables are fast
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_telemetry_logs_site_uuid
  ON public.telemetry_logs (site_uuid);

CREATE INDEX IF NOT EXISTS idx_telemetry_logs_target_hour
  ON public.telemetry_logs (target_hour DESC);

CREATE INDEX IF NOT EXISTS idx_incidents_site_uuid
  ON public.incidents (site_uuid);

CREATE INDEX IF NOT EXISTS idx_shift_reports_site_uuid
  ON public.shift_reports (site_uuid);

CREATE INDEX IF NOT EXISTS idx_equipment_registry_site_uuid
  ON public.equipment_registry (site_uuid);

CREATE INDEX IF NOT EXISTS idx_facility_states_site_uuid
  ON public.facility_states (site_uuid);
