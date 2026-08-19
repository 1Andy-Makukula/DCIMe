-- ═══════════════════════════════════════════════════════════════════════════
-- 20260827_signatures.sql
-- DCIMe V2 — handwritten signatures
--
-- V1 recorded a signature as a checkbox plus SIG-{timestamp}-{random}, and the
-- success screen told the technician their records had been "signed digitally
-- and archived into the immutable ledger". Neither half was true: nothing was
-- signed, and shift_reports rows stay UPDATE-able (audit C-03).
--
-- This stores the actual mark. It is still not a cryptographic signature and
-- the copy has been corrected to stop claiming otherwise — but a drawing a
-- person made, with a timestamp, is evidence a checkbox never was, and it can
-- be shown on a printed handover.
--
-- STORED AS A DATA URL IN A TEXT COLUMN. A signature is a few kilobytes of
-- PNG, so a column keeps it in the same row as the record it signs — no bucket
-- to configure, no second fetch, and no way for the image to go missing while
-- the record survives. Move it to object storage if signatures ever grow.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.shift_reports
  ADD COLUMN IF NOT EXISTS signature_image text,
  ADD COLUMN IF NOT EXISTS signed_at       timestamptz;

COMMENT ON COLUMN public.shift_reports.signature_image IS
  'Handwritten signature as a PNG data URL. NULL for records predating capture.';
COMMENT ON COLUMN public.shift_reports.signed_at IS
  'When the signature was drawn — distinct from the row timestamp, which is '
  'when the report was submitted.';

-- The daily checklist carries two signatories: the maintenance partner and the
-- client representative. Both were free-text names.
ALTER TABLE public.telemetry_logs
  ADD COLUMN IF NOT EXISTS signature_image text,
  ADD COLUMN IF NOT EXISTS signed_at       timestamptz;

-- Work items are signed off on completion, so a resolution can be attributed
-- to a person rather than to an account.
ALTER TABLE public.work_items
  ADD COLUMN IF NOT EXISTS signature_image text;

COMMIT;
