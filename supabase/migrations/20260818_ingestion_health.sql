-- ═══════════════════════════════════════════════════════════════════════════
-- 20260818_ingestion_health.sql
-- DCIMe V2 — Stage 8: the dead-man's switch
--
-- THE GAP THIS CLOSES
-- Every alert in the system so far is triggered by a READING: a temperature too
-- high, a voltage too low, a generator that started. All of them require data to
-- arrive. If a site stops reporting entirely — technician off sick, tablet
-- broken, network down, someone simply forgot — the dashboards show the last
-- known good values and nothing complains.
--
-- Silence is currently indistinguishable from health. That is the most dangerous
-- state a monitoring system can have, because it fails exactly when you most
-- need it and gives no sign.
--
-- This inverts the trigger: instead of alerting on a bad reading, alert on the
-- ABSENCE of readings. It is the one check that cannot be satisfied by data that
-- never arrives.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. EXPECTED CADENCE, PER SITE
--
--    Sites do not all report at the same rate — a staffed facility logs hourly,
--    a remote one might be four-hourly. A single global threshold would either
--    cry wolf at the slow site or stay silent too long at the fast one.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS expected_interval_minutes integer NOT NULL DEFAULT 60,
  -- Grace before a late reading counts as silence. Rounds slip; a technician
  -- fifteen minutes behind is normal and must not page anyone.
  ADD COLUMN IF NOT EXISTS ingestion_grace_minutes  integer NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS monitoring_enabled       boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.sites.expected_interval_minutes IS
  'How often this site is expected to report. Drives the dead-man''s switch.';
COMMENT ON COLUMN public.sites.monitoring_enabled IS
  'Set false during commissioning or planned downtime, so a site that is '
  'deliberately quiet does not raise an incident every hour.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. INGESTION HEALTH
--
--    SECURITY DEFINER, deliberately and unusually.
--
--    Every other function in this system is INVOKER so RLS applies. This one
--    must see ALL sites regardless of who is asking, because the question is
--    "which site has gone quiet?" — and a site-scoped view can never answer it.
--    A supervisor at Site 1 cannot see that Site 2 stopped reporting.
--
--    It exposes only timestamps and staleness, never telemetry values, so the
--    widened visibility leaks nothing operational.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.site_ingestion_health AS
  SELECT s.id                       AS site_uuid,
         s.site_code,
         s.site_name,
         s.expected_interval_minutes,
         s.ingestion_grace_minutes,
         s.monitoring_enabled,
         t.last_reading_at,
         t.last_technician,
         CASE WHEN t.last_reading_at IS NULL THEN NULL
              ELSE EXTRACT(EPOCH FROM (now() - t.last_reading_at)) / 60.0
         END                        AS minutes_since_reading,
         CASE
           WHEN NOT s.monitoring_enabled          THEN 'PAUSED'
           WHEN t.last_reading_at IS NULL         THEN 'NEVER_REPORTED'
           WHEN EXTRACT(EPOCH FROM (now() - t.last_reading_at)) / 60.0
                > (s.expected_interval_minutes + s.ingestion_grace_minutes) * 3
                                                  THEN 'CRITICAL'
           WHEN EXTRACT(EPOCH FROM (now() - t.last_reading_at)) / 60.0
                > (s.expected_interval_minutes + s.ingestion_grace_minutes)
                                                  THEN 'STALE'
           ELSE                                        'HEALTHY'
         END                        AS status
    FROM public.sites s
    LEFT JOIN LATERAL (
      SELECT tl.submitted_at AS last_reading_at,
             tl.technician_name AS last_technician
        FROM public.telemetry_logs tl
       WHERE tl.site_uuid = s.id
       ORDER BY tl.submitted_at DESC NULLS LAST
       LIMIT 1
    ) t ON true;

COMMENT ON VIEW public.site_ingestion_health IS
  'Per-site reporting freshness. STALE means one missed cadence plus grace; '
  'CRITICAL means three. NEVER_REPORTED distinguishes a new site from a dead one.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. RAISING THE ALARM
--
--    Writes into `incidents`, so a silent site arrives through exactly the same
--    path a technician-reported fault does — same table, same UI, same WhatsApp
--    formatter. A separate alert channel would be one more thing to remember to
--    look at.
--
--    Idempotent by design: re-raising every time the scheduler fires would bury
--    the operator. One open incident per site until it is resolved.
-- ═══════════════════════════════════════════════════════════════════════════
-- Dropped rather than replaced: CREATE OR REPLACE cannot rename a function's
-- OUT columns, so an earlier signature would survive and callers would break.
DROP FUNCTION IF EXISTS public.check_ingestion_health();

CREATE FUNCTION public.check_ingestion_health()
RETURNS TABLE (out_site_code text, out_status text, out_action text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r        record;
  v_open   uuid;
  v_sev    text;
  v_msg    text;
BEGIN
  FOR r IN
    SELECT h.* FROM public.site_ingestion_health h
     WHERE h.status IN ('STALE','CRITICAL','NEVER_REPORTED')
  LOOP
    -- Is there already an unresolved silence incident for this site?
    SELECT i.id INTO v_open
      FROM public.incidents i
     WHERE i.site_uuid = r.site_uuid
       AND i.asset_id  = 'INGESTION_MONITOR'
       AND i.resolved_at IS NULL
     LIMIT 1;

    IF v_open IS NOT NULL THEN
      RETURN QUERY SELECT r.site_code, r.status, 'already open'::text;
      CONTINUE;
    END IF;

    v_sev := CASE WHEN r.status = 'CRITICAL' THEN 'critical' ELSE 'high' END;
    v_msg := CASE
      WHEN r.status = 'NEVER_REPORTED'
        THEN 'No telemetry has ever been received from this site.'
      ELSE 'No telemetry received for ' || round(r.minutes_since_reading / 60.0, 1)
           || ' hours. Expected every ' || r.expected_interval_minutes || ' minutes.'
           || CASE WHEN r.last_technician IS NOT NULL
                   THEN ' Last reading by ' || r.last_technician || '.' ELSE '' END
    END;

    INSERT INTO public.incidents
      (site_uuid, site_name, asset_id, severity, occurred_at,
       raised_by_id, raised_by_name, notes, impact, comments)
    VALUES
      (r.site_uuid, r.site_name, 'INGESTION_MONITOR', v_sev,
       COALESCE(r.last_reading_at, now()),
       '00000000-0000-0000-0000-000000000000', 'Ingestion Monitor',
       v_msg,
       'Monitoring blind: readings are not arriving, so no other alert can fire.',
       '[]'::jsonb);

    RETURN QUERY SELECT r.site_code, r.status, 'incident raised'::text;
  END LOOP;

  -- Auto-resolve once readings resume. A silence incident describes a condition
  -- that has demonstrably ended, so leaving it open teaches people to ignore it.
  UPDATE public.incidents i
     SET resolved_at        = now(),
         resolved_by_name   = 'Ingestion Monitor',
         resolved_by_type   = 'SYSTEM',
         resolution_details = 'Telemetry resumed.'
    FROM public.site_ingestion_health h
   WHERE i.site_uuid = h.site_uuid
     AND i.asset_id  = 'INGESTION_MONITOR'
     AND i.resolved_at IS NULL
     AND h.status IN ('HEALTHY','PAUSED');

  RETURN;
END $$;

COMMENT ON FUNCTION public.check_ingestion_health() IS
  'Dead-man''s switch. Raises one incident per silent site and resolves it when '
  'readings resume. Schedule every 15 minutes via pg_cron.';

REVOKE ALL ON FUNCTION public.check_ingestion_health() FROM public;
GRANT EXECUTE ON FUNCTION public.check_ingestion_health() TO authenticated;

GRANT SELECT ON public.site_ingestion_health TO authenticated;

COMMIT;

-- ── Scheduling ─────────────────────────────────────────────────────────────
-- Not enabled here: pg_cron must be available and the schedule is an
-- operational decision, not a schema one. In the Supabase SQL editor:
--
--     CREATE EXTENSION IF NOT EXISTS pg_cron;
--     SELECT cron.schedule('dcime-ingestion-health', '*/15 * * * *',
--                          'SELECT public.check_ingestion_health()');
--
-- Fifteen minutes is deliberate: frequent enough that a site going quiet is
-- noticed within a fraction of its reporting cadence, infrequent enough that the
-- check itself costs nothing.
