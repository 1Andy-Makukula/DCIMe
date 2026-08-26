-- ═══════════════════════════════════════════════════════════════════════════
-- 20260865_entry_discipline.sql
-- DCIMe V2.1 — was the reading written down when it was taken?
--
-- A DIFFERENT QUESTION ON THE SAME RAIL
-- site_ingestion_health already answers "are readings ARRIVING?" — it compares
-- the newest submitted_at against now(). This adds the question next to it:
-- "were they written down WHEN THEY WERE TAKEN?"
--
-- Those are genuinely different facts and both matter:
--
--     last_reading_at   arrival    — is the site still reporting at all
--     entry lag         discipline — was 06:00 typed at 06:05 or at 22:00
--
-- A site can be perfectly HEALTHY on arrival while every round is backdated six
-- hours from memory at the end of a shift. The first tells you the pipe is
-- open; the second tells you whether what came down it was observed or
-- remembered. On a signed compliance record that is the difference between
-- evidence and recollection.
--
-- Because it is a second fact about the same thing, it goes in the SAME VIEW
-- and onto the SAME CARD rather than getting a table, a hook and a panel of its
-- own. One place to look for "is our data trustworthy".
--
-- NO NEW THRESHOLD TO CONFIGURE
-- A reading is late when it was written up more than one whole round after the
-- hour it describes — expected_interval_minutes + ingestion_grace_minutes, the
-- tolerance the site already declares for arrival. Reusing it means one number
-- to tune, not two, and it already means "longer than a round plus slack".
--
-- WHAT IT FINDS TODAY
-- Of 237 real submissions: average lag 91 minutes, 20 entered more than two
-- hours after the fact, the worst 22 hours later.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE VIEW public.site_ingestion_health
WITH (security_invoker = true) AS
SELECT s.id AS site_uuid,
       s.site_code,
       s.site_name,
       s.expected_interval_minutes,
       s.ingestion_grace_minutes,
       s.monitoring_enabled,
       t.last_reading_at,
       t.last_technician,
       CASE
         WHEN t.last_reading_at IS NULL THEN NULL::numeric
         ELSE EXTRACT(epoch FROM now() - t.last_reading_at) / 60.0
       END AS minutes_since_reading,
       CASE
         WHEN NOT s.monitoring_enabled THEN 'PAUSED'::text
         WHEN t.last_reading_at IS NULL THEN 'NEVER_REPORTED'::text
         WHEN (EXTRACT(epoch FROM now() - t.last_reading_at) / 60.0)
              > ((s.expected_interval_minutes + s.ingestion_grace_minutes) * 3)::numeric
           THEN 'CRITICAL'::text
         WHEN (EXTRACT(epoch FROM now() - t.last_reading_at) / 60.0)
              > (s.expected_interval_minutes + s.ingestion_grace_minutes)::numeric
           THEN 'STALE'::text
         ELSE 'HEALTHY'::text
       END AS status,

       -- ── How promptly it was written down ────────────────────────────────
       COALESCE(l.n_total, 0)      AS entries_7d,
       COALESCE(l.n_late, 0)       AS late_entries_7d,
       l.worst_lag_minutes,
       l.avg_lag_minutes,
       l.last_late_at,
       l.last_late_technician,
       CASE
         WHEN COALESCE(l.n_total, 0) = 0 THEN 'NO_DATA'::text
         -- Under a tenth slipping is ordinary: a round genuinely interrupted,
         -- a tablet out of signal. Not worth a colour.
         WHEN l.n_late::numeric / l.n_total < 0.10 THEN 'PROMPT'::text
         WHEN l.n_late::numeric / l.n_total < 0.30 THEN 'SLIPPING'::text
         ELSE 'RETROSPECTIVE'::text
       END AS entry_status

  FROM sites s
  LEFT JOIN LATERAL (
    SELECT tl.submitted_at AS last_reading_at,
           tl.technician_name AS last_technician
      FROM telemetry_logs tl
     WHERE tl.site_uuid = s.id
     ORDER BY tl.submitted_at DESC NULLS LAST
     LIMIT 1
  ) t ON true
  LEFT JOIN LATERAL (
    SELECT count(*)                                                  AS n_total,
           count(*) FILTER (WHERE lag_min > tolerance)               AS n_late,
           round(max(lag_min) FILTER (WHERE lag_min > tolerance), 1) AS worst_lag_minutes,
           round(avg(lag_min), 1)                                    AS avg_lag_minutes,
           max(x.submitted_at) FILTER (WHERE lag_min > tolerance)    AS last_late_at,
           (ARRAY_AGG(x.technician_name ORDER BY x.submitted_at DESC)
             FILTER (WHERE lag_min > tolerance))[1]                  AS last_late_technician
      FROM (
        SELECT tl.submitted_at, tl.technician_name,
               EXTRACT(epoch FROM tl.submitted_at - tl.target_hour) / 60.0 AS lag_min,
               (s.expected_interval_minutes + s.ingestion_grace_minutes)::numeric AS tolerance
          FROM public.telemetry_logs tl
         WHERE tl.site_uuid = s.id
           AND tl.submitted_at IS NOT NULL
           AND tl.submitted_at >= now() - interval '7 days'
           -- A reading typed BEFORE the hour it describes is a clock problem,
           -- not a discipline one, and would drag the average negative.
           AND tl.submitted_at >= tl.target_hour
      ) x
  ) l ON true;

COMMENT ON VIEW public.site_ingestion_health IS
  'Two questions about the same data on one row: is it ARRIVING (status, from '
  'last_reading_at) and was it written down WHEN TAKEN (entry_status, from the '
  'lag between target_hour and submitted_at). Both use the site''s own '
  'expected_interval_minutes + ingestion_grace_minutes, so there is one '
  'tolerance to tune rather than two.';

COMMIT;


-- ── What it says right now ─────────────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT site_code, status, entry_status, entries_7d, late_entries_7d,
           avg_lag_minutes, worst_lag_minutes, last_late_technician
      FROM public.site_ingestion_health
     WHERE entries_7d > 0
  LOOP
    RAISE NOTICE '% — arrival %, entry % (% of % late, avg % min, worst % min, last by %)',
      r.site_code, r.status, r.entry_status, r.late_entries_7d, r.entries_7d,
      r.avg_lag_minutes, r.worst_lag_minutes, COALESCE(r.last_late_technician, '—');
  END LOOP;
END $$;
