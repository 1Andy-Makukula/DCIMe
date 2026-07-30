-- ============================================================
-- DCIMe — Part 1 (cont.): tighten employees read access (§1.7)
-- and make site assignment mandatory (§1.12).
--
-- Run AFTER 20260728_close_security_holes.sql (it defines the
-- status-aware get_my_role() / get_my_site_uuid() helpers used here).
--
-- Data safety: rewrites one SELECT policy, creates one read-only
-- view, backfills NULL employees.site_uuid to the first site, then
-- sets the column NOT NULL. No rows are deleted.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- SECTION 1 — Stop leaking personal data to the whole site (§1.7)
--
-- Previously any authenticated technician could read the full
-- personnel roster for their site — including phone numbers and
-- email addresses — because the SELECT policy allowed
-- site_uuid = get_my_site_uuid(). Now: you can read your own row,
-- and active admins can read rows (needed for Personnel Management).
-- Everyone else gets nothing from the base table.
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Employees: read access" ON public.employees;

CREATE POLICY "Employees: read access"
  ON public.employees FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      auth_id = auth.uid()
      OR public.get_my_role() = 'ADMIN'
    )
  );

-- Non-admin-safe directory: names, badges and roles ONLY, scoped to
-- the caller's own site, and only for Active accounts. Views run as
-- their owner (postgres), which bypasses RLS — that is intentional
-- here so the field app can show a "who's on site" list without the
-- base-table policy above leaking phone/email columns. The view
-- simply never projects those columns.
CREATE OR REPLACE VIEW public.employee_directory AS
SELECT
  id,
  full_name,
  employee_id,
  role,
  site_uuid
FROM public.employees
WHERE status = 'Active'
  AND site_uuid = public.get_my_site_uuid();

GRANT SELECT ON public.employee_directory TO authenticated;


-- ════════════════════════════════════════════════════════════
-- SECTION 2 — Site assignment is mandatory (§1.12)
--
-- An employee with a NULL site_uuid passes no site-scoped policy and
-- is locked out of everything with no explainable error. Backfill any
-- existing orphans to the first site (matches the telemetry_logs
-- backfill strategy in 20260723_security_hardening.sql), then forbid
-- NULL going forward. The admin_create_employee() RPC already rejects
-- NULL/foreign sites, so new rows are covered too.
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_default_site_uuid uuid;
BEGIN
  SELECT id INTO v_default_site_uuid FROM public.sites ORDER BY created_at LIMIT 1;

  IF v_default_site_uuid IS NOT NULL THEN
    UPDATE public.employees
       SET site_uuid = v_default_site_uuid
     WHERE site_uuid IS NULL;
  END IF;
END $$;

ALTER TABLE public.employees ALTER COLUMN site_uuid SET NOT NULL;


-- ════════════════════════════════════════════════════════════
-- SECTION 3 — POST-FLIGHT VERIFICATION (read-only, run after)
-- ════════════════════════════════════════════════════════════
-- 3a. employees policies should be exactly: read access (self/admin),
--     self-update (non-privileged fields only), admin update within
--     own site. No INSERT policy.
-- SELECT policyname, cmd FROM pg_policies
--  WHERE schemaname='public' AND tablename='employees' ORDER BY cmd;
--
-- 3b. Directory view returns names/roles only, for your site:
-- SELECT * FROM public.employee_directory;
--
-- 3c. No orphan employees remain:
-- SELECT count(*) FROM public.employees WHERE site_uuid IS NULL;
