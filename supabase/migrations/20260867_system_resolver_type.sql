-- ═══════════════════════════════════════════════════════════════════════════
-- 20260867_system_resolver_type.sql
-- DCIMe V2.1 — the monitor may say it resolved something itself.
--
-- THE FAILURE
-- dcime_ingestion_health has been erroring every 15 minutes:
--
--   ERROR: new row for relation "incidents" violates check constraint
--          "incidents_resolved_by_type_ck"
--
-- check_ingestion_health() auto-closes its own incident when telemetry starts
-- arriving again, and stamps resolved_by_type = 'SYSTEM'. The constraint allows
-- only INTERNAL_TECH, EXTERNAL_CONTRACTOR or NULL.
--
-- WHY IT SURFACED NOW
-- The recovery branch had never run. Ingestion at this site had been silent
-- since 21 August, so the monitor only ever took the RAISE path — which works.
-- Generating readings up to today made the site recover for the first time,
-- the auto-close branch executed, and a bug that had been sitting in the
-- function since it was written finally had a way to fire.
--
-- Worth saying plainly: this was latent, not new. It would have broken the
-- first time a real outage ended.
--
-- THE FIX
-- Widen the vocabulary rather than change the function. 'SYSTEM' is the honest
-- answer to "who resolved this" — nobody attended; the condition cleared and
-- the monitor observed it. Recording that as INTERNAL_TECH would credit a
-- person who did nothing, and NULL would lose the distinction between "closed
-- itself" and "closed by someone we failed to record".
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.incidents DROP CONSTRAINT IF EXISTS incidents_resolved_by_type_ck;

ALTER TABLE public.incidents ADD CONSTRAINT incidents_resolved_by_type_ck
  CHECK (resolved_by_type IS NULL
         OR resolved_by_type IN ('INTERNAL_TECH', 'EXTERNAL_CONTRACTOR', 'SYSTEM'));

COMMENT ON COLUMN public.incidents.resolved_by_type IS
  'Who closed it. SYSTEM means nobody attended — the condition cleared and a '
  'monitor observed the recovery, which is different from a technician '
  'attending and different again from an unrecorded resolver (NULL).';

COMMIT;


-- ── Prove the recovery path now works ──────────────────────────────────────
DO $$
DECLARE v_result text;
BEGIN
  BEGIN
    SELECT public.check_ingestion_health()::text INTO v_result;
    RAISE NOTICE 'check_ingestion_health ran clean: %', left(v_result, 160);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'check_ingestion_health still fails: %', SQLERRM;
  END;
END $$;
