-- supabase/migrations/20260722_shared_rls_policies.sql
-- Grant shared read and write RLS policies for all authenticated technician and admin accounts

-- 1. shift_reports
ALTER TABLE IF EXISTS public.shift_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access" ON public.shift_reports;
DROP POLICY IF EXISTS "Allow public insert access" ON public.shift_reports;
DROP POLICY IF EXISTS "Allow public update access" ON public.shift_reports;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.shift_reports;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.shift_reports;

CREATE POLICY "Allow public read access" ON public.shift_reports FOR SELECT USING (true);
CREATE POLICY "Allow public insert access" ON public.shift_reports FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access" ON public.shift_reports FOR UPDATE USING (true);

-- 2. incidents
ALTER TABLE IF EXISTS public.incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access" ON public.incidents;
DROP POLICY IF EXISTS "Allow public insert access" ON public.incidents;
DROP POLICY IF EXISTS "Allow public update access" ON public.incidents;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.incidents;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.incidents;

CREATE POLICY "Allow public read access" ON public.incidents FOR SELECT USING (true);
CREATE POLICY "Allow public insert access" ON public.incidents FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access" ON public.incidents FOR UPDATE USING (true);

-- 3. telemetry_logs
ALTER TABLE IF EXISTS public.telemetry_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Allow public insert access" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Allow public update access" ON public.telemetry_logs;

CREATE POLICY "Allow public read access" ON public.telemetry_logs FOR SELECT USING (true);
CREATE POLICY "Allow public insert access" ON public.telemetry_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access" ON public.telemetry_logs FOR UPDATE USING (true);
