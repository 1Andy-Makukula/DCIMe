-- ═══════════════════════════════════════════════════════════════════════════
-- 20260831_signer_attribution.sql
-- DCIMe V2 — the database decides who signed, not the browser.
--
-- countersigned_by / countersigned_name and work_items.signed_name were sent
-- by the client. A signature whose attribution the signer can choose is not
-- evidence of anything: anyone able to reach the endpoint could countersign as
-- somebody else, and the printed document would carry that name.
--
-- These triggers overwrite the attribution fields on write, from the JWT, so
-- whatever the client sends is discarded. RLS already restricts WHICH rows can
-- be touched; this fixes WHO the row records as having touched them.
--
-- The name is still denormalised into the row, because a printed document must
-- keep reading correctly after an employee record is removed — but it is now
-- the name the server looked up, not one the browser supplied.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.stamp_countersignature()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_id   uuid;
  v_name text;
BEGIN
  -- Only when a countersignature is actually being applied.
  IF NEW.countersign_image IS NULL
     OR NEW.countersign_image IS NOT DISTINCT FROM OLD.countersign_image THEN
    RETURN NEW;
  END IF;

  SELECT e.id, e.full_name INTO v_id, v_name
    FROM public.employees e
   WHERE e.auth_id = auth.uid();

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'No employee record for the signed-in user; cannot attribute a signature.';
  END IF;

  NEW.countersigned_by   := v_id;
  NEW.countersigned_name := v_name;
  NEW.countersigned_at   := COALESCE(NEW.countersigned_at, now());
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_stamp_countersignature ON public.shift_reports;
CREATE TRIGGER trg_stamp_countersignature
  BEFORE UPDATE ON public.shift_reports
  FOR EACH ROW EXECUTE FUNCTION public.stamp_countersignature();


CREATE OR REPLACE FUNCTION public.stamp_work_signature()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_name text;
BEGIN
  IF NEW.signature_image IS NULL
     OR NEW.signature_image IS NOT DISTINCT FROM OLD.signature_image THEN
    RETURN NEW;
  END IF;

  SELECT e.full_name INTO v_name
    FROM public.employees e
   WHERE e.auth_id = auth.uid();

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'No employee record for the signed-in user; cannot attribute a signature.';
  END IF;

  NEW.signed_name := v_name;
  NEW.signed_at   := COALESCE(NEW.signed_at, now());
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_stamp_work_signature ON public.work_items;
CREATE TRIGGER trg_stamp_work_signature
  BEFORE UPDATE ON public.work_items
  FOR EACH ROW EXECUTE FUNCTION public.stamp_work_signature();

COMMIT;
