-- ═══════════════════════════════════════════════════════════════════════════
-- 20260829_countersignatures.sql
-- DCIMe V2 — the second signature on a document.
--
-- 20260827 gave shift_reports the technician's own mark. A handover is not
-- complete when one person signs it: the receiving side accepts it. Recording
-- only the outgoing signature leaves no evidence anyone read the document,
-- which is precisely the accountability gap the signature work exists to close.
--
-- Kept as a distinct column pair rather than a signatures table: there are
-- exactly two parties to a handover, the query that renders the document
-- already selects the row, and a join would buy nothing. Revisit if a third
-- signatory ever appears.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.shift_reports
  ADD COLUMN IF NOT EXISTS countersign_image text,
  ADD COLUMN IF NOT EXISTS countersigned_at  timestamptz,
  ADD COLUMN IF NOT EXISTS countersigned_by  uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS countersigned_name text;

COMMENT ON COLUMN public.shift_reports.countersign_image IS
  'Handwritten mark of the person ACCEPTING the handover, as a PNG data URL.';
COMMENT ON COLUMN public.shift_reports.countersigned_name IS
  'Denormalised for the printed document: the record must still read correctly '
  'if the employee row is later removed.';

-- Work items already carry signature_image from 20260827. The closing party
-- needs the same treatment: who confirmed the work, and when.
ALTER TABLE public.work_items
  ADD COLUMN IF NOT EXISTS signed_at    timestamptz,
  ADD COLUMN IF NOT EXISTS signed_name  text;

COMMIT;
