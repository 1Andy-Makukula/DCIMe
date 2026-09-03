-- ═══════════════════════════════════════════════════════════════════════════
-- 20260877_merge_telemetry_metrics.sql
-- DCIMe V2 — a second save of an hour must not erase the first.
--
-- THE DATA LOSS THIS FIXES
-- 2026-09-03 04:00 local. FRANCIS submitted a complete round at 04:33 — 278
-- metrics, 274 readings, the same as every neighbouring hour. At 04:44 the
-- same hour was written again from the Readings Round screen, which carries
-- only the parameters for the frequency being walked and omits blanks
-- entirely. metrics was REPLACED rather than merged, so the round became 164
-- keys; fan_out_readings() then deleted the hour's readings and rebuilt them
-- from what was left, taking 274 down to 162. Grid, both UPS units, both
-- rectifiers, every room temperature and every PAC return temp were gone, and
-- nothing anywhere said so.
--
-- Three code paths write this table — the routine dashboard, the Readings
-- Round screen, and the offline queue replaying a round recorded hours
-- earlier — and all three upsert a whole `metrics` object. Any one of them
-- landing second wins outright. That is why the fix is here and not in the
-- mutation hook: a client-side merge would leave the other two writers, and
-- the offline replay is precisely the case where a stale payload arrives last.
--
-- WHAT MERGING DOES AND DOES NOT CHANGE
-- `||` is a shallow merge of top-level keys, which is the shape metrics has.
-- A key the writer SENDS still wins, so an edit that changes a value still
-- changes it. A key the writer CLEARS still clears it: the dashboard sends ''
-- for a blanked field, and fan_out_readings() already treats '' as the absence
-- of a reading rather than a value. What can no longer happen is a writer
-- silently deleting readings it never had on screen in the first place.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.merge_telemetry_metrics()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
  -- An UPDATE that touches other columns without carrying metrics must not
  -- blank the reading set.
  IF NEW.metrics IS NULL THEN
    NEW.metrics := OLD.metrics;
  ELSIF OLD.metrics IS NOT NULL THEN
    NEW.metrics := OLD.metrics || NEW.metrics;
  END IF;

  -- _report_text is a rendered WhatsApp summary that used to be stored and go
  -- stale after an edit. The mutation hook deletes it from every payload so it
  -- can never be re-persisted — but under a merge, deleting a key client-side
  -- no longer removes it from the stored row, so the row would keep an old
  -- snapshot forever. Strip it here instead, where every writer passes.
  NEW.metrics := NEW.metrics - '_report_text';

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.merge_telemetry_metrics() IS
  'Merges an incoming metrics payload over the stored one so a partial save '
  '(the Readings Round screen, or an offline round replayed late) cannot erase '
  'readings it never had on screen.';

DROP TRIGGER IF EXISTS trg_merge_telemetry_metrics ON public.telemetry_logs;

-- BEFORE the AFTER-trigger that fans out to `readings`, which re-reads the row
-- and therefore sees the merged value.
CREATE TRIGGER trg_merge_telemetry_metrics
  BEFORE UPDATE ON public.telemetry_logs
  FOR EACH ROW EXECUTE FUNCTION public.merge_telemetry_metrics();

COMMIT;
