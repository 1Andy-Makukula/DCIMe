-- ============================================================
-- DCIMe — Enable Separate Asset Logging (DG Tests & Checklists)
-- Safe & Idempotent Migration
-- ============================================================

-- Drop old 2-column unique constraint
ALTER TABLE public.telemetry_logs
  DROP CONSTRAINT IF EXISTS telemetry_logs_target_hour_site_unique;

-- Add new 3-column composite unique constraint (target_hour, site_uuid, asset_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'telemetry_logs_target_hour_site_asset_unique'
  ) THEN
    ALTER TABLE public.telemetry_logs
      ADD CONSTRAINT telemetry_logs_target_hour_site_asset_unique
      UNIQUE (target_hour, site_uuid, asset_id);
  END IF;
END $$;
