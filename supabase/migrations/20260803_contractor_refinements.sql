-- ============================================================
-- DCIMe — Contractor Workflow Refinements
-- Run in Supabase Dashboard → SQL Editor
--
-- Two changes:
--   1. contractor_visits.scope (fixed enum) → contractor_visits.purpose (freeform).
--      Contractors perform an open-ended range of work; a seven-value enum forced
--      real visits into the wrong bucket.
--   2. incidents gains resolved_by_type, so a fault fixed by an in-house
--      technician is no longer recorded as if a contractor did it.
--
-- IDEMPOTENT AND ORDER-SAFE. 20260802_contractor_visits.sql has been updated to
-- create the table with `purpose` directly, so:
--   • Fresh database (20260802 not yet run): section 1 is a no-op.
--   • 20260802 already applied in its ORIGINAL form: section 1 migrates the
--     existing `scope` column across, preserving the recorded values.
-- ============================================================

-- ── 1. contractor_visits: scope (enum) → purpose (freeform) ──
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'contractor_visits'
  ) THEN

    -- Add the freeform column if this table predates the change.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'contractor_visits' AND column_name = 'purpose'
    ) THEN
      ALTER TABLE public.contractor_visits ADD COLUMN purpose text;
    END IF;

    -- Carry existing enum values over as readable text, so no logged visit
    -- loses its recorded reason.
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'contractor_visits' AND column_name = 'scope'
    ) THEN
      UPDATE public.contractor_visits
      SET purpose = COALESCE(NULLIF(purpose, ''), CASE scope
            WHEN 'GENERAL_SITE'    THEN 'General site inspection'
            WHEN 'EQUIPMENT_AUDIT' THEN 'Equipment audit & checkup'
            WHEN 'ROUTINE_PM'      THEN 'Routine servicing & preventative maintenance'
            WHEN 'FUEL_REFILL'     THEN 'Fuel & generator refill check'
            WHEN 'HVAC_THERMAL'    THEN 'HVAC & thermal audit'
            WHEN 'ELECTRICAL'      THEN 'Electrical & power inspection'
            WHEN 'SAFETY_SECURITY' THEN 'Safety & security check'
            ELSE scope
          END)
      WHERE purpose IS NULL OR purpose = '';

      ALTER TABLE public.contractor_visits DROP COLUMN scope;
    END IF;

    -- Backstop for any row still empty, so the NOT NULL below cannot fail.
    UPDATE public.contractor_visits
    SET purpose = 'Site visit (purpose not recorded)'
    WHERE purpose IS NULL OR purpose = '';

    ALTER TABLE public.contractor_visits ALTER COLUMN purpose SET NOT NULL;
  END IF;
END $$;


-- ── 2. incidents: who actually resolved the fault ───────────
-- NULL on historical rows: we cannot know retroactively whether an in-house
-- technician or a contractor closed those, and guessing would be worse than
-- leaving it unstated.
ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS resolved_by_type text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'incidents_resolved_by_type_ck'
  ) THEN
    ALTER TABLE public.incidents
      ADD CONSTRAINT incidents_resolved_by_type_ck
      CHECK (resolved_by_type IS NULL OR resolved_by_type IN ('INTERNAL_TECH', 'EXTERNAL_CONTRACTOR'));
  END IF;
END $$;

-- contractor_engaged is meaningful only for external resolutions. It stays
-- nullable rather than being forced to a placeholder like 'None', so
-- "no contractor was involved" and "a contractor was involved" stay distinct.
