-- supabase/migrations/20260722_shared_rls_policies.sql
-- SECURE UPDATE: Ensure RLS is enabled, but drop any legacy public/frictionless policies.
-- This ensures that the site-scoped policies defined in 20260722_phase1_schema_and_rls.sql
-- remain authoritative and are not overridden.

-- 1. shift_reports
ALTER TABLE IF EXISTS public.shift_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read access" ON public.shift_reports;
DROP POLICY IF EXISTS "Allow public insert access" ON public.shift_reports;
DROP POLICY IF EXISTS "Allow public update access" ON public.shift_reports;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.shift_reports;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.shift_reports;

-- 2. incidents
ALTER TABLE IF EXISTS public.incidents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read access" ON public.incidents;
DROP POLICY IF EXISTS "Allow public insert access" ON public.incidents;
DROP POLICY IF EXISTS "Allow public update access" ON public.incidents;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.incidents;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.incidents;

-- 3. telemetry_logs
ALTER TABLE IF EXISTS public.telemetry_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read access" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Allow public insert access" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Allow public update access" ON public.telemetry_logs;
