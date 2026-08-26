-- ═══════════════════════════════════════════════════════════════════════════
-- 20260853_views_enforce_rls.sql
-- DCIMe V2.1 — four views have been reading past row-level security.
--
-- A PostgreSQL view runs with its OWNER's permissions unless it is declared
-- security_invoker. These four are owned by postgres, so RLS on the tables
-- underneath them never applied:
--
--   work_queue                work_items       site-scoped policy, bypassed
--   parameter_observed_range  readings         site-scoped policy, bypassed
--   vendor_activity           vendors          authenticated-read, unaffected
--   employee_directory        employees        read policy, bypassed
--
-- The application always filters by site, so nothing leaks through the screens.
-- But PostgREST exposes every view directly: an authenticated technician at one
-- site could ask work_queue for every row and receive another site's jobs.
--
-- WHY THIS IS SAFE TO CHANGE
-- Checked before touching it, because enforcing RLS on a view that a legitimate
-- path depends on would break that path silently:
--   · employees.site_uuid ties each person to exactly ONE site, and
--     get_my_site_uuid() returns that one.
--   · setCurrentSite is called only from AuthContext, at login, from the signed
--     in employee's own record. There is no site picker — a user cannot view
--     another site.
-- So RLS restricts these views to precisely the site the application was going
-- to ask for anyway. The bypass was exposure with no purpose.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER VIEW public.work_queue               SET (security_invoker = true);
ALTER VIEW public.parameter_observed_range SET (security_invoker = true);
ALTER VIEW public.vendor_activity          SET (security_invoker = true);
ALTER VIEW public.employee_directory       SET (security_invoker = true);

COMMIT;

DO $$
DECLARE r record; v_off int := 0;
BEGIN
  FOR r IN
    SELECT c.relname,
           COALESCE((SELECT option_value FROM pg_options_to_table(c.reloptions)
                      WHERE option_name = 'security_invoker'), 'false') AS inv
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'v'
     ORDER BY c.relname
  LOOP
    IF r.inv <> 'true' THEN
      v_off := v_off + 1;
      RAISE NOTICE 'still reading past RLS: %', r.relname;
    END IF;
  END LOOP;

  IF v_off = 0 THEN
    RAISE NOTICE 'every view in public enforces row-level security';
  ELSE
    -- Reported rather than changed: the remaining views were not reviewed here,
    -- and switching one whose callers depend on the bypass would break them
    -- quietly. Each needs the same check this migration's header records.
    RAISE NOTICE '% view(s) above still bypass RLS — each needs its callers checked first', v_off;
  END IF;
END $$;
