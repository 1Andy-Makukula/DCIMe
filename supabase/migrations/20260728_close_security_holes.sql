-- ============================================================
-- DCIMe — Part 1: Close wide-open RLS policies, fix the employees
-- privilege-escalation hole, make "Revoke Access" real, and add
-- secure provisioning + atomic incident comments.
--
-- Run in Supabase Dashboard -> SQL Editor.
--
-- READ THE PRE-FLIGHT SECTION FIRST. Section 0 is read-only and
-- tells you whether Section 2 will hide equipment from the field app.
--
-- Data safety: adds one column (employees.status, defaults 'Active'),
-- creates 2 functions, and swaps policies. No rows are modified or
-- deleted.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- SECTION 0 — PRE-FLIGHT (read-only; run this BY ITSELF first)
--
-- Right now `equipment_registry` has a permissive "Allow full access
-- for authenticated users" policy that lets every row through. Once
-- that's dropped, only rows whose site_uuid matches the caller's site
-- are visible. equipment_registry.site_uuid is NULLABLE, so any row
-- with a NULL site_uuid will VANISH from the field app.
--
-- Both counts below must be 0 before you run Section 2.
-- If they aren't, backfill site_uuid first (Section 0b).
-- ════════════════════════════════════════════════════════════
-- SELECT count(*) AS equipment_missing_site FROM public.equipment_registry WHERE site_uuid IS NULL;
-- SELECT count(*) AS employees_missing_site FROM public.employees        WHERE site_uuid IS NULL;

-- Section 0b — ONLY if the first count above is non-zero. Replace
-- 'NTC' with the site_code these orphaned rows belong to, then run:
-- UPDATE public.equipment_registry
--   SET site_uuid = (SELECT id FROM public.sites WHERE site_code = 'NTC')
--   WHERE site_uuid IS NULL;


-- ════════════════════════════════════════════════════════════
-- SECTION 1 — Real revocation, enforced at the data layer
--
-- Every site-scoped policy in this database calls get_my_site_uuid()
-- or get_my_role(). Gating BOTH on status='Active' means revoking one
-- employee row instantly fails every read/write they attempt, across
-- every table, with no per-table changes needed.
-- ════════════════════════════════════════════════════════════
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Active'
  CHECK (status IN ('Active','Revoked'));

CREATE OR REPLACE FUNCTION public.get_my_site_uuid() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT site_uuid FROM public.employees WHERE auth_id = auth.uid() AND status = 'Active' LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.employees WHERE auth_id = auth.uid() AND status = 'Active' LIMIT 1;
$$;


-- ════════════════════════════════════════════════════════════
-- SECTION 2 — Drop the leftover wide-open policies
--
-- Confirmed live via pg_policies. Postgres OR-combines permissive
-- policies, so each of these silently nullifies the correct
-- site-scoped policy sitting next to it on the same table.
--
-- KNOWN SIDE EFFECT: this intentionally breaks the "Seed NTC/WTC DB"
-- buttons (src/shared/utils/seedDatabase.ts), which DELETE from
-- rooms / equipment_registry / equipment_parameters. Those buttons are
-- flagged for removal anyway (report §4.6) because they wipe live site
-- data from the main dashboard behind a single confirm(). Seed from the
-- SQL Editor or with the service_role key from now on.
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow full access to telemetry_logs"                          ON public.telemetry_logs;
DROP POLICY IF EXISTS "Allow all operations for beta"                                ON public.telemetry_logs;
DROP POLICY IF EXISTS "Allow full access for authenticated users on equipment_paramete" ON public.equipment_parameters;
DROP POLICY IF EXISTS "Allow full access for authenticated users on equipment_registry" ON public.equipment_registry;
DROP POLICY IF EXISTS "Allow full access for authenticated users"                    ON public.equipment_status_logs;
DROP POLICY IF EXISTS "Allow full access for authenticated users on rooms"           ON public.rooms;
DROP POLICY IF EXISTS "Allow authenticated insert on rooms"                          ON public.rooms;
DROP POLICY IF EXISTS "Allow authenticated read on rooms"                            ON public.rooms;
DROP POLICY IF EXISTS "Allow authenticated update on rooms"                          ON public.rooms;
DROP POLICY IF EXISTS "Allow full access for authenticated users on sites"           ON public.sites;
DROP POLICY IF EXISTS "Allow authenticated read on sites"                            ON public.sites;

-- This one is site-scoped and looks fine, but it reads `employees`
-- directly instead of going through get_my_site_uuid() — so it does NOT
-- honor the new status check, and a revoked user would keep full
-- telemetry access through it. The scoped read/insert/update policies
-- already cover every operation the app performs (nothing in src/
-- deletes telemetry), so it's redundant as well as leaky.
DROP POLICY IF EXISTS "Site-scoped telemetry access" ON public.telemetry_logs;


-- ════════════════════════════════════════════════════════════
-- SECTION 3 — employees: close the privilege-escalation hole
--
-- NOTE ON RECURSION: a policy ON employees must never SELECT from
-- employees in its own USING/WITH CHECK — Postgres re-applies RLS to
-- that subquery and aborts with "infinite recursion detected in policy".
-- That's what get_my_role()/get_my_site_uuid() are for: SECURITY DEFINER
-- so they bypass RLS. Both are STABLE, so inside an UPDATE they see the
-- pre-update snapshot — i.e. the caller's OLD role/site, which is
-- exactly what we want to pin the new values against.
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Employees: self-update" ON public.employees;

-- Users may edit their own contact details, but role and site_uuid are
-- pinned to their existing values, so self-escalation is impossible.
CREATE POLICY "Employees: self-update (non-privileged fields only)"
  ON public.employees FOR UPDATE
  USING (auth_id = auth.uid())
  WITH CHECK (
    auth_id = auth.uid()
    AND role = public.get_my_role()
    AND site_uuid IS NOT DISTINCT FROM public.get_my_site_uuid()
  );

-- Admins may edit anyone at their own site, including role changes.
CREATE POLICY "Employees: admin update within own site"
  ON public.employees FOR UPDATE
  USING      (public.get_my_role() = 'ADMIN' AND site_uuid = public.get_my_site_uuid())
  WITH CHECK (public.get_my_role() = 'ADMIN' AND site_uuid = public.get_my_site_uuid());

-- Provisioning now goes exclusively through admin_create_employee()
-- below. Row-level self-insert can't distinguish "new hire signing
-- themselves up" from "existing user granting themselves ADMIN", so it
-- is removed entirely rather than narrowed.
--
-- Bootstrapping a brand-new database (zero employees) is a dashboard /
-- service_role operation — insert the first ADMIN row directly in the
-- SQL Editor, which bypasses RLS.
DROP POLICY IF EXISTS "Employees: self-insert on registration" ON public.employees;


-- ════════════════════════════════════════════════════════════
-- SECTION 4 — Make equipment admin-checks honor revocation
--
-- These two currently do EXISTS(SELECT 1 FROM employees ... role='ADMIN')
-- inline, which skips the status='Active' gate — a revoked admin would
-- keep write access to equipment. Route them through get_my_role().
-- (No recursion risk here: the policy is on equipment_registry, not
-- employees, but the helper is used for consistency and status-awareness.)
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Equipment: admin insert" ON public.equipment_registry;
DROP POLICY IF EXISTS "Equipment: admin update" ON public.equipment_registry;

CREATE POLICY "Equipment: admin insert"
  ON public.equipment_registry FOR INSERT
  WITH CHECK (site_uuid = public.get_my_site_uuid() AND public.get_my_role() = 'ADMIN');

CREATE POLICY "Equipment: admin update"
  ON public.equipment_registry FOR UPDATE
  USING      (site_uuid = public.get_my_site_uuid() AND public.get_my_role() = 'ADMIN')
  WITH CHECK (site_uuid = public.get_my_site_uuid() AND public.get_my_role() = 'ADMIN');


-- ════════════════════════════════════════════════════════════
-- SECTION 5 — Secure admin-driven provisioning
-- (fixes "Add Personnel", report §1.5 — wired up in Part 2)
--
-- SECURITY DEFINER so the insert isn't subject to the row-level check
-- that made admin-driven onboarding impossible, with an explicit
-- role check taking its place.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.admin_create_employee(
  p_auth_id      uuid,
  p_full_name    text,
  p_employee_id  text,
  p_role         text,
  p_site_uuid    uuid,
  p_site_id      text,
  p_email        text,
  p_phone_number text DEFAULT NULL
) RETURNS public.employees
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row       public.employees;
  v_my_site   uuid := public.get_my_site_uuid();
BEGIN
  IF public.get_my_role() <> 'ADMIN' THEN
    RAISE EXCEPTION 'Only active admins can provision employees';
  END IF;

  IF p_role NOT IN ('ADMIN','FIELD_TECH') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  -- Blocks provisioning with a missing site, and blocks an admin at one
  -- site from creating accounts at another. If you later want a global
  -- admin who can provision across sites, relax this check.
  IF p_site_uuid IS NULL OR p_site_uuid <> v_my_site THEN
    RAISE EXCEPTION 'Employees must be provisioned into your own site';
  END IF;

  INSERT INTO public.employees
    (auth_id, full_name, employee_id, role, site_uuid, site_id, email, phone_number)
  VALUES
    (p_auth_id, p_full_name, p_employee_id, p_role, p_site_uuid, p_site_id, p_email, p_phone_number)
  RETURNING * INTO v_row;

  RETURN v_row;
END; $$;

REVOKE ALL ON FUNCTION public.admin_create_employee(uuid,text,text,text,uuid,text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_employee(uuid,text,text,text,uuid,text,text,text) TO authenticated;


-- ════════════════════════════════════════════════════════════
-- SECTION 6 — Atomic incident-comment append (report §2.6)
--
-- Replaces the client-side read-modify-write where two people
-- commenting at once silently erase each other's comment.
-- SECURITY INVOKER on purpose: the existing "Incidents: site-scoped
-- update" policy still applies, so this grants no new access.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.append_incident_comment(
  p_incident_id uuid,
  p_comment     jsonb
) RETURNS public.incidents
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_row public.incidents;
BEGIN
  UPDATE public.incidents
     SET comments = COALESCE(comments, '[]'::jsonb) || jsonb_build_array(p_comment)
   WHERE id = p_incident_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Incident % not found or not visible to you', p_incident_id;
  END IF;

  RETURN v_row;
END; $$;

GRANT EXECUTE ON FUNCTION public.append_incident_comment(uuid,jsonb) TO authenticated;


-- ════════════════════════════════════════════════════════════
-- SECTION 7 — POST-FLIGHT VERIFICATION (read-only, run after)
-- ════════════════════════════════════════════════════════════
-- 7a. No permissive "allow-everything" policies should remain:
-- SELECT tablename, policyname, cmd FROM pg_policies
--  WHERE schemaname='public' AND (qual = 'true' OR with_check = 'true')
--  ORDER BY tablename;
--
-- 7b. employees should now show: read access, self-update
--     (non-privileged fields only), admin update within own site.
--     There should be NO insert policy.
-- SELECT policyname, cmd FROM pg_policies
--  WHERE schemaname='public' AND tablename='employees' ORDER BY cmd;
--
-- 7c. Smoke-test in the app after running this file:
--     - log in as admin; equipment, rooms and telemetry all still load
--     - a FIELD_TECH can still submit an hourly log
--     - "Add Personnel" still fails until Part 2 wires up the RPC
