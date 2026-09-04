-- ═══════════════════════════════════════════════════════════════════════════
-- 20260882_employee_site_consistency.sql
-- DCIMe V2 — an employee's two site columns can no longer disagree.
--
-- WHAT WAS WRONG
-- employees carries site_uuid (the foreign key everything queries on) and
-- site_id (a legacy text label, kept because screens and exports still read
-- it). Two ADMIN accounts — ISAAC LONGWE and PAUL LOMBE — had site_uuid
-- correctly pointing at Site 1 while site_id still said 'SANDBOX', left over
-- from whatever created them.
--
-- Nothing broke in the data path, because AuthContext resolves the active site
-- through the site_uuid foreign key. What broke was everything that reads the
-- LABEL: AuthContext exposes siteId from site_id, Personnel Management prints
-- it as the employee's zone, and those two admins were told they belonged to a
-- sandbox facility that is not even active.
--
-- Two columns holding the same fact will drift again, so this does not only
-- correct the rows: the trigger keeps the label derived from the key on every
-- write, which makes the key the single source of truth without dropping the
-- column anything still reads.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Keep the label in step with the key ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stamp_employee_site_label()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public AS $$
DECLARE
  v_label text;
BEGIN
  IF NEW.site_uuid IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(s.site_name, s.site_code) INTO v_label
    FROM public.sites s
   WHERE s.id = NEW.site_uuid;

  -- A site row that has gone missing is not a reason to blank the label a
  -- printed handover may still be relying on.
  IF v_label IS NOT NULL THEN
    NEW.site_id := v_label;
  END IF;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.stamp_employee_site_label() IS
  'Derives employees.site_id from the site_uuid foreign key, so the legacy '
  'text label can never contradict the key the application actually queries on.';

DROP TRIGGER IF EXISTS trg_stamp_employee_site_label ON public.employees;
CREATE TRIGGER trg_stamp_employee_site_label
  BEFORE INSERT OR UPDATE OF site_uuid, site_id ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.stamp_employee_site_label();


-- ── Correct the rows that had drifted ──────────────────────────────────────
-- Every account is put onto the site its own key already names, so nobody is
-- moved between sites here — the label is brought into line with where they
-- already were.
UPDATE public.employees e
   SET site_id = COALESCE(s.site_name, s.site_code)
  FROM public.sites s
 WHERE s.id = e.site_uuid
   AND e.site_id IS DISTINCT FROM COALESCE(s.site_name, s.site_code);

COMMIT;
