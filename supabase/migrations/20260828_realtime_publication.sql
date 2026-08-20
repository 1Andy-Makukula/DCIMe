-- ═══════════════════════════════════════════════════════════════════════════
-- 20260828_realtime_publication.sql
-- DCIMe V2 — make the live tables actually live.
--
-- The admin NOC subscribes to postgres_changes on telemetry_logs and
-- incidents, but NO TABLE WAS EVER ADDED TO THE supabase_realtime PUBLICATION.
-- Postgres only emits replication events for tables in a publication, so the
-- subscriptions connected successfully and then received nothing, forever.
--
-- The symptom was a technician submitting readings and the admin dashboard
-- never changing until a manual refresh — it looked like a caching bug, but
-- the events were never being produced at all.
--
-- REPLICA IDENTITY FULL is required for the site_uuid filter the client sends.
-- With the default (primary key only), UPDATE and DELETE events carry just the
-- key, so a filter on any other column cannot match and the event is dropped.
-- It costs more WAL per write; these tables are low-volume and correctness
-- matters more here.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['telemetry_logs', 'incidents', 'work_items', 'shift_reports']
  LOOP
    -- ALTER PUBLICATION ... ADD TABLE errors if the table is already a member,
    -- so check first rather than swallowing the exception.
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      RAISE NOTICE 'added % to supabase_realtime', t;
    END IF;

    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;

COMMIT;
