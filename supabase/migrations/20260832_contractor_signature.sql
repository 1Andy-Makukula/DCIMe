-- ═══════════════════════════════════════════════════════════════════════════
-- 20260832_contractor_signature.sql
-- DCIMe V2 — the contractor signs for their own work.
--
-- A visit recorded the contractor's NAME, typed by the technician who let them
-- in. That is a technician's assertion that somebody was on site, not the
-- contractor's acknowledgement of what they did — and it is the record that
-- gets produced when a vendor disputes an invoice or denies a finding.
--
-- The mark is taken on the technician's device, which is how this works in
-- practice: the contractor signs the phone before leaving site.
--
-- WHY NOT THE SERVER-STAMPED ATTRIBUTION USED ELSEWHERE
-- 20260831 stamps signer identity from the JWT, because the signer IS the
-- signed-in user. Here the signer is a THIRD PARTY who has no account — so the
-- name is necessarily supplied, and witnessed by the authenticated technician
-- whose id is already on the row as logged_by_id. That is the honest model,
-- and the column comment says so rather than implying more assurance than
-- exists.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.contractor_visits
  ADD COLUMN IF NOT EXISTS contractor_signature   text,
  ADD COLUMN IF NOT EXISTS contractor_signed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS contractor_signed_name text;

COMMENT ON COLUMN public.contractor_visits.contractor_signature IS
  'Handwritten mark of the CONTRACTOR, as a PNG data URL. Taken on the '
  'technician''s device before the contractor leaves site.';
COMMENT ON COLUMN public.contractor_visits.contractor_signed_name IS
  'Who signed, as given at the time. NOT server-verified: a contractor has no '
  'account. The witness is logged_by_id, who is authenticated.';

COMMIT;
