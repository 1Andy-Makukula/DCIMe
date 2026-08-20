-- ═══════════════════════════════════════════════════════════════════════════
-- 20260833_report_signoffs.sql
-- DCIMe V2 — signing a report that is generated, not stored.
--
-- The executive summary is built live from telemetry every time it is opened,
-- so there is no row to hang a signature on the way there is for a handover or
-- a work order. Its "Prepared by / Reviewed" lines were therefore just ruled
-- underlines on a page nobody could actually sign.
--
-- This gives a generated report an identity: site + kind + the period it
-- covers. Sign that identity, and reopening the same day's report shows the
-- same signatures — while tomorrow's is unsigned, which is correct.
--
-- TWO PARTIES, ONE ROW. Prepared and Reviewed are different people doing
-- different things, but they sign the same document, and a row per document is
-- what makes "is this report signed off" a single lookup.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.report_signoffs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_uuid    uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,

  -- Which generated report. Kept as text rather than an enum so a new report
  -- does not need a migration to become signable.
  report_kind  text NOT NULL,
  -- The period the report covers, as it is labelled on the page — 'YYYY-MM-DD'
  -- for a daily. This is what makes a signature belong to one edition.
  period_key   text NOT NULL,

  prepared_signature text,
  prepared_name      text,
  prepared_at        timestamptz,

  reviewed_signature text,
  reviewed_name      text,
  reviewed_at        timestamptz,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT report_signoffs_unique UNIQUE (site_uuid, report_kind, period_key)
);

COMMENT ON TABLE public.report_signoffs IS
  'Signatures against a GENERATED report, identified by site + kind + period. '
  'Reports built live from telemetry have no row of their own to sign.';

-- ── Attribution, as everywhere else: the server decides who signed ─────────
CREATE OR REPLACE FUNCTION public.stamp_report_signoff()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_name text;
BEGIN
  SELECT e.full_name INTO v_name
    FROM public.employees e
   WHERE e.auth_id = auth.uid();

  IF NEW.prepared_signature IS NOT NULL
     AND NEW.prepared_signature IS DISTINCT FROM COALESCE(OLD.prepared_signature, '') THEN
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'No employee record for the signed-in user; cannot attribute a signature.';
    END IF;
    NEW.prepared_name := v_name;
    NEW.prepared_at   := COALESCE(NEW.prepared_at, now());
  END IF;

  IF NEW.reviewed_signature IS NOT NULL
     AND NEW.reviewed_signature IS DISTINCT FROM COALESCE(OLD.reviewed_signature, '') THEN
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'No employee record for the signed-in user; cannot attribute a signature.';
    END IF;
    NEW.reviewed_name := v_name;
    NEW.reviewed_at   := COALESCE(NEW.reviewed_at, now());
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_stamp_report_signoff ON public.report_signoffs;
CREATE TRIGGER trg_stamp_report_signoff
  BEFORE INSERT OR UPDATE ON public.report_signoffs
  FOR EACH ROW EXECUTE FUNCTION public.stamp_report_signoff();

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.report_signoffs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS report_signoffs_read ON public.report_signoffs;
CREATE POLICY report_signoffs_read ON public.report_signoffs
  FOR SELECT USING (site_uuid = public.get_my_site_uuid());

DROP POLICY IF EXISTS report_signoffs_write ON public.report_signoffs;
CREATE POLICY report_signoffs_write ON public.report_signoffs
  FOR ALL USING (site_uuid = public.get_my_site_uuid())
           WITH CHECK (site_uuid = public.get_my_site_uuid());

COMMIT;
