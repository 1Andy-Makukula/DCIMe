-- ============================================================
-- DCIMe Schema Reconciliation Migration
-- Run this in Supabase Dashboard → SQL Editor or via CLI
-- Safe: uses idempotent ALTER TABLE commands
-- ============================================================

-- ── 1. Reconcile employees Table ─────────────────────────────
-- Add missing columns safely
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS employee_id text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS site_id text DEFAULT 'NTC ZM 0874';

-- Ensure existing rows comply (safety fallback for nulls)
UPDATE public.employees SET email = id::text || '@dcime.local' WHERE email IS NULL;
UPDATE public.employees SET employee_id = 'EMP-' || upper(substring(id::text from 1 for 4)) WHERE employee_id IS NULL;
UPDATE public.employees SET site_id = 'NTC ZM 0874' WHERE site_id IS NULL;

-- Enforce NOT NULL constraints
ALTER TABLE public.employees ALTER COLUMN email SET NOT NULL;
ALTER TABLE public.employees ALTER COLUMN employee_id SET NOT NULL;
ALTER TABLE public.employees ALTER COLUMN site_id SET NOT NULL;

-- Enforce UNIQUE constraints
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_email_key') THEN
        ALTER TABLE public.employees ADD CONSTRAINT employees_email_key UNIQUE (email);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_employee_id_key') THEN
        ALTER TABLE public.employees ADD CONSTRAINT employees_employee_id_key UNIQUE (employee_id);
    END IF;
END $$;

-- Enforce CHECK constraint on role
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE public.employees ADD CONSTRAINT employees_role_check CHECK (role = ANY (ARRAY['ADMIN'::text, 'FIELD_TECH'::text]));


-- ── 2. Reconcile equipment_registry Table ────────────────────
-- Enforce CHECK constraint on category
ALTER TABLE public.equipment_registry DROP CONSTRAINT IF EXISTS equipment_registry_category_check;
ALTER TABLE public.equipment_registry ADD CONSTRAINT equipment_registry_category_check CHECK (category = ANY (ARRAY['UPS'::text, 'GENERATOR'::text, 'MAINS'::text, 'RECTIFIER'::text, 'AIRCON'::text]));


-- ── 3. Reconcile shift_reports Table ─────────────────────────
-- Update default value
ALTER TABLE public.shift_reports ALTER COLUMN active_power_source SET DEFAULT 'MAINS';

-- Clean up any non-compliant rows before adding constraint
UPDATE public.shift_reports SET active_power_source = 'MAINS' WHERE active_power_source NOT IN ('MAINS', 'GENERATOR', 'BLACKOUT') OR active_power_source IS NULL;

-- Enforce CHECK constraint on active_power_source
ALTER TABLE public.shift_reports DROP CONSTRAINT IF EXISTS shift_reports_active_power_source_check;
ALTER TABLE public.shift_reports ADD CONSTRAINT shift_reports_active_power_source_check CHECK (active_power_source = ANY (ARRAY['MAINS'::text, 'GENERATOR'::text, 'BLACKOUT'::text]));


-- ── 4. Reconcile incidents Table ─────────────────────────────
-- Add comments JSONB column with default '[]'::jsonb
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS comments jsonb NOT NULL DEFAULT '[]'::jsonb;


-- ── 5. Reconcile and Open RLS Policies ───────────────────────
-- Allow SELECT, INSERT, and UPDATE on employees for frictionless registration and login flows
DROP POLICY IF EXISTS "Allow public selects" ON public.employees;
CREATE POLICY "Allow public selects" ON public.employees FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public inserts" ON public.employees;
CREATE POLICY "Allow public inserts" ON public.employees FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public updates" ON public.employees;
CREATE POLICY "Allow public updates" ON public.employees FOR UPDATE USING (true) WITH CHECK (true);

-- Allow SELECT, INSERT, and UPDATE on equipment_registry
DROP POLICY IF EXISTS "Allow public selects on equipment" ON public.equipment_registry;
CREATE POLICY "Allow public selects on equipment" ON public.equipment_registry FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public inserts on equipment" ON public.equipment_registry;
CREATE POLICY "Allow public inserts on equipment" ON public.equipment_registry FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public updates on equipment" ON public.equipment_registry;
CREATE POLICY "Allow public updates on equipment" ON public.equipment_registry FOR UPDATE USING (true) WITH CHECK (true);

-- Allow SELECT, INSERT, and UPDATE on incidents
DROP POLICY IF EXISTS "Allow public selects on incidents" ON public.incidents;
CREATE POLICY "Allow public selects on incidents" ON public.incidents FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public inserts on incidents" ON public.incidents;
CREATE POLICY "Allow public inserts on incidents" ON public.incidents FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public updates on incidents" ON public.incidents;
CREATE POLICY "Allow public updates on incidents" ON public.incidents FOR UPDATE USING (true) WITH CHECK (true);

-- Allow SELECT, INSERT, and UPDATE on shift_reports
DROP POLICY IF EXISTS "Allow public selects on shift_reports" ON public.shift_reports;
CREATE POLICY "Allow public selects on shift_reports" ON public.shift_reports FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public inserts on shift_reports" ON public.shift_reports;
CREATE POLICY "Allow public inserts on shift_reports" ON public.shift_reports FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public updates on shift_reports" ON public.shift_reports;
CREATE POLICY "Allow public updates on shift_reports" ON public.shift_reports FOR UPDATE USING (true) WITH CHECK (true);
