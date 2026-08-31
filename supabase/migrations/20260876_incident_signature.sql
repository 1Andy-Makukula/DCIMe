-- ═══════════════════════════════════════════════════════════════════════════
-- 20260876_incident_signature.sql
-- DCIMe V2 — the person who closes an incident signs for it.
--
-- An incident carried resolved_by_name and resolution_details and nothing
-- else: a claim, typed into a form, that the fault was fixed and by whom. It
-- is the record produced when a client asks why a room ran hot for six hours,
-- and it is the one formal document in the system that had no mark on it at
-- all. Every other closing document — the daily checklist, the shift handover,
-- a work order, a contractor visit — already takes one.
--
-- Deliberately NOT added to the hourly round or the DG test. Those are
-- readings, taken twenty-four times a day; a signature on each would be
-- ceremony rather than evidence, and would train people to sign without
-- reading. Signatures belong on documents that close something.
--
-- WHO THE ROW SAYS SIGNED
-- Server-stamped from the JWT by the trigger below, the same way 20260831
-- stamps countersignatures and work-order signatures. The signer here IS the
-- signed-in technician, so the name is looked up rather than accepted from the
-- browser — an attribution the client can choose is not evidence.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS resolution_signature   text,
  ADD COLUMN IF NOT EXISTS resolution_signed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_signed_name text;

COMMENT ON COLUMN public.incidents.resolution_signature IS
  'Handwritten mark of the person closing the incident, as a PNG data URL.';
COMMENT ON COLUMN public.incidents.resolution_signed_name IS
  'Who signed. Server-stamped from the JWT by trg_stamp_incident_signature — '
  'whatever the client sends is discarded.';

CREATE OR REPLACE FUNCTION public.stamp_incident_signature()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_name text;
BEGIN
  -- Only when a signature is actually being applied. An unrelated UPDATE to a
  -- closed incident must not re-stamp, or the row would record whoever touched
  -- it last as the signatory.
  IF NEW.resolution_signature IS NULL
     OR NEW.resolution_signature IS NOT DISTINCT FROM OLD.resolution_signature THEN
    RETURN NEW;
  END IF;

  SELECT e.full_name INTO v_name
    FROM public.employees e
   WHERE e.auth_id = auth.uid();

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'No employee record for the signed-in user; cannot attribute a signature.';
  END IF;

  NEW.resolution_signed_name := v_name;
  NEW.resolution_signed_at   := COALESCE(NEW.resolution_signed_at, now());
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_stamp_incident_signature ON public.incidents;
CREATE TRIGGER trg_stamp_incident_signature
  BEFORE UPDATE ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.stamp_incident_signature();

COMMIT;
