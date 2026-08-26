-- ═══════════════════════════════════════════════════════════════════════════
-- 20260848_schedule_rollup_refresh.sql
-- DCIMe V2.1 — Stage 3: keep the rollups current without anyone asking.
--
-- readings_daily and readings_monthly are materialised, so they are only as
-- fresh as their last refresh. Ten past the hour, five minutes after the
-- readings for that hour have had time to arrive and be fanned out.
--
-- Not */15 like the threshold job: the rollups exist to answer questions about
-- days and months, and rebuilding them four times an hour would spend work on a
-- grain nobody reads at that resolution.
--
-- Also strengthens the note on get_series: grouping by room or site WITHOUT a
-- parameter filter aggregates every measure in that room together, which
-- averages volts with degrees and produces a confident meaningless number. The
-- counts stay meaningful; the average does not.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- pg_cron lives in its own schema and is not installed everywhere this
  -- migration might run — a local restore, for instance. Skipping is correct;
  -- failing would block the rest of a rebuild for a scheduling concern.
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not installed — rollup refresh not scheduled.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('dcime_rollups')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dcime_rollups');

  PERFORM cron.schedule(
    'dcime_rollups',
    '10 * * * *',
    $job$ SELECT public.refresh_reading_rollups(); $job$
  );

  RAISE NOTICE 'scheduled dcime_rollups at 10 past every hour';
END $$;

COMMENT ON FUNCTION public.get_series(uuid,timestamptz,timestamptz,text,text,text,text,uuid) IS
  'One series over a window, at hour, day, month or year grain, grouped by '
  'asset, room or site. The single entry point for every chart and every '
  'printed figure — nothing computes an average client-side. '
  'CAUTION: grouping by room or site without p_parameter_name aggregates every '
  'measure in scope, averaging volts with degrees. The counts (n, n_na, n_warn, '
  'n_breach) stay meaningful; avg_num, min_num and max_num do not. Pass a '
  'parameter whenever the average is the thing being read.';

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT jobname, schedule, active FROM public.scheduled_job_status ORDER BY jobname
  LOOP
    RAISE NOTICE 'job % (%) active=%', r.jobname, r.schedule, r.active;
  END LOOP;
END $$;
