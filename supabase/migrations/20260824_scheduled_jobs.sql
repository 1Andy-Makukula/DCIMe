-- ═══════════════════════════════════════════════════════════════════════════
-- 20260824_scheduled_jobs.sql
-- DCIMe V2 — the automatic behaviour actually runs
--
-- Threshold evaluation, maintenance due-dates and the silence alarm all work,
-- and none of them run on their own. A capability nobody triggers is a
-- capability nobody has: the system would still only notice a problem when a
-- human went looking, which is exactly the V1 behaviour all of it replaces.
--
-- pg_cron runs inside the database, so there is no server to keep alive, no
-- token to rotate, and nothing to forget to redeploy.
--
-- CADENCE. Each of these reads recent rows and writes at most a handful of work
-- items, so cost is not the constraint — usefulness is:
--   thresholds   every 15 min  · readings arrive hourly at best, so this is
--                               responsive without being pointless
--   maintenance  daily 06:00   · a service due date does not move hour to hour,
--                               and a job appearing before the shift starts is
--                               more useful than one appearing at 03:00
--   silence      every 15 min  · matches the shortest grace window a site can
--                               sensibly configure
--
-- SAFE TO RE-RUN: each schedule is unscheduled before being recreated, so this
-- migration cannot accumulate duplicate jobs.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- pg_cron lives in its own schema and must be enabled once per database.
-- On Supabase this requires the extension to be available to the project; if it
-- is not, everything below is skipped rather than failing the migration, and
-- the functions can still be called by hand or from an external scheduler.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not available on this database.';
    RAISE NOTICE 'The evaluation functions still work; schedule them externally:';
    RAISE NOTICE '  SELECT public.evaluate_thresholds();          -- every 15 min';
    RAISE NOTICE '  SELECT public.resolve_recovered_thresholds(); -- every 15 min';
    RAISE NOTICE '  SELECT public.raise_due_maintenance();        -- daily';
    RAISE NOTICE '  SELECT public.check_ingestion_health();       -- every 15 min';
    RETURN;
  END IF;

  CREATE EXTENSION IF NOT EXISTS pg_cron;

  -- ── Thresholds ────────────────────────────────────────────────────────
  -- Recovery runs BEFORE evaluation in the same statement: a reading that has
  -- returned to normal should clear its job in the same cycle that would
  -- otherwise leave it sitting in the queue looking unresolved.
  PERFORM cron.unschedule('dcime_thresholds')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dcime_thresholds');
  PERFORM cron.schedule(
    'dcime_thresholds',
    '*/15 * * * *',
    $job$
      SELECT public.resolve_recovered_thresholds();
      SELECT count(*) FROM public.evaluate_thresholds();
    $job$
  );

  -- ── Preventive maintenance ────────────────────────────────────────────
  PERFORM cron.unschedule('dcime_maintenance')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dcime_maintenance');
  PERFORM cron.schedule(
    'dcime_maintenance',
    '0 6 * * *',
    $job$ SELECT public.raise_due_maintenance(); $job$
  );

  -- ── Silence ───────────────────────────────────────────────────────────
  PERFORM cron.unschedule('dcime_ingestion_health')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dcime_ingestion_health');
  PERFORM cron.schedule(
    'dcime_ingestion_health',
    '*/15 * * * *',
    $job$ SELECT public.check_ingestion_health(); $job$
  );

  RAISE NOTICE 'Scheduled: thresholds (15 min), maintenance (daily 06:00), silence (15 min).';
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- VISIBILITY
--
-- A scheduled job that silently stops is worse than one that never existed —
-- the system looks like it is watching when it is not. This view makes the
-- schedule and its last outcome inspectable from the application.
-- ═══════════════════════════════════════════════════════════════════════════
-- Built with EXECUTE and guarded: cron.job does not exist when pg_cron is
-- unavailable, and a plain CREATE VIEW would fail at parse time — undoing the
-- graceful handling above and taking the whole migration down with it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'cron' AND table_name = 'job') THEN
    EXECUTE $view$
      CREATE OR REPLACE VIEW public.scheduled_job_status AS
      SELECT j.jobname, j.schedule, j.active,
             r.status AS last_status, r.start_time AS last_run, r.return_message
        FROM cron.job j
        LEFT JOIN LATERAL (
          SELECT status, start_time, return_message
            FROM cron.job_run_details d
           WHERE d.jobid = j.jobid
           ORDER BY d.start_time DESC LIMIT 1
        ) r ON true
       WHERE j.jobname LIKE 'dcime_%';
    $view$;
  ELSE
    -- A stand-in with the same shape, so the application can query one name
    -- regardless. No rows means nothing is scheduled — which is the truth.
    EXECUTE $view$
      CREATE OR REPLACE VIEW public.scheduled_job_status AS
      SELECT NULL::text AS jobname, NULL::text AS schedule, NULL::boolean AS active,
             NULL::text AS last_status, NULL::timestamptz AS last_run,
             NULL::text AS return_message
       WHERE false;
    $view$;
  END IF;
END $$;

COMMENT ON VIEW public.scheduled_job_status IS
  'The DCIMe background jobs and their last outcome. Empty means pg_cron is not '
  'enabled and the evaluation functions are being triggered externally, if at all.';

COMMIT;
