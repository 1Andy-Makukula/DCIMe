-- supabase/migrations/20260723_security_hardening.sql
-- SECURE UPDATE: Hardening RLS policies, defining search path parameters, and securing unique constraints.

-- 1. Explicit search_path on get_my_site_uuid() to prevent privilege escalation
CREATE OR REPLACE FUNCTION public.get_my_site_uuid()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT site_uuid FROM public.employees WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- 2. Clean nulls and enforce NOT NULL on telemetry_logs.site_uuid for composite upsert integrity
-- Dynamically resolve site_uuid from metrics JSON site_id/site_uuid
UPDATE public.telemetry_logs t
SET site_uuid = s.id
FROM public.sites s
WHERE (
  t.metrics->>'site_id' = s.site_code 
  OR t.metrics->>'site_uuid' = s.id::text
) AND t.site_uuid IS NULL;

-- Dynamically resolve from technician's assigned site
UPDATE public.telemetry_logs t
SET site_uuid = e.site_uuid
FROM public.employees e
WHERE t.technician_id = e.id 
  AND t.site_uuid IS NULL;

-- Safety fallback: default to first site only for any remaining unresolved rows to satisfy NOT NULL
DO $$
DECLARE
  v_default_site_uuid uuid;
BEGIN
  SELECT id INTO v_default_site_uuid FROM public.sites LIMIT 1;
  
  IF v_default_site_uuid IS NOT NULL THEN
    UPDATE public.telemetry_logs
    SET site_uuid = v_default_site_uuid
    WHERE site_uuid IS NULL;
  END IF;
END $$;

ALTER TABLE public.telemetry_logs ALTER COLUMN site_uuid SET NOT NULL;

-- 3. Double-ended site verification on equipment_connections insert
DROP POLICY IF EXISTS "Equipment connections: site-scoped insert" ON public.equipment_connections;

CREATE POLICY "Equipment connections: site-scoped insert"
  ON public.equipment_connections FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND source_equipment_id IN (
      SELECT equipment_id FROM public.equipment_registry
      WHERE site_uuid = public.get_my_site_uuid()
    )
    AND target_equipment_id IN (
      SELECT equipment_id FROM public.equipment_registry
      WHERE site_uuid = public.get_my_site_uuid()
    )
  );

-- 4. Restrict equipment insert/update to actual ADMIN accounts
DROP POLICY IF EXISTS "Equipment: admin insert" ON public.equipment_registry;
DROP POLICY IF EXISTS "Equipment: admin update" ON public.equipment_registry;

CREATE POLICY "Equipment: admin insert"
  ON public.equipment_registry FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND site_uuid = public.get_my_site_uuid()
    AND EXISTS (
      SELECT 1 FROM public.employees
      WHERE auth_id = auth.uid()
      AND role = 'ADMIN'
    )
  );

CREATE POLICY "Equipment: admin update"
  ON public.equipment_registry FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND site_uuid = public.get_my_site_uuid()
    AND EXISTS (
      SELECT 1 FROM public.employees
      WHERE auth_id = auth.uid()
      AND role = 'ADMIN'
    )
  );
