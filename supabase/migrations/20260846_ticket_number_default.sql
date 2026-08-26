-- ═══════════════════════════════════════════════════════════════════════════
-- 20260846_ticket_number_default.sql
-- DCIMe V2.1 — the ingestion monitor has been failing every 15 minutes.
--
-- incidents.ticket_number is NOT NULL with no default and no trigger, so every
-- inserter has to invent one. The browser does. check_ingestion_health() — which
-- runs on cron and raises the alert for "no readings are arriving" — does not,
-- so it has failed on every run since it was installed:
--
--   ERROR: null value in column "ticket_number" violates not-null constraint
--
-- That is the alert that fires when no other alert CAN fire, because nothing is
-- being logged. It has never once succeeded.
--
-- A DEFAULT rather than a patch to that one function: any future server-side
-- inserter has the same hole, and a client that generates its own still wins.
-- The format matches what the browser already produces
-- (INC-2026-MT32VKOM-6JOH) so a ticket raised by the monitor is
-- indistinguishable from one raised by a person.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.to_base36(p_n bigint)
RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT
AS $$
DECLARE
  c text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  v bigint := abs(p_n);
  o text := '';
BEGIN
  IF v = 0 THEN RETURN '0'; END IF;
  WHILE v > 0 LOOP
    o := substr(c, (v % 36)::int + 1, 1) || o;
    v := v / 36;
  END LOOP;
  RETURN o;
END $$;

COMMENT ON FUNCTION public.to_base36(bigint) IS
  'Base-36, uppercase. Matches Number.prototype.toString(36) in the browser so '
  'server-generated identifiers read the same as client-generated ones.';

CREATE OR REPLACE FUNCTION public.generate_ticket_number()
RETURNS text
LANGUAGE sql VOLATILE
AS $$
  SELECT 'INC-' || to_char(now(), 'YYYY') || '-'
      -- clock_timestamp, not now(): now() is fixed for the whole transaction, so
      -- two incidents raised in one call would collide on the timestamp half and
      -- rely entirely on the random tail.
      || public.to_base36((extract(epoch from clock_timestamp()) * 1000)::bigint) || '-'
      || public.to_base36((random() * 1679615)::bigint)
$$;

ALTER TABLE public.incidents
  ALTER COLUMN ticket_number SET DEFAULT public.generate_ticket_number();

COMMIT;

DO $$
DECLARE v_sample text;
BEGIN
  SELECT public.generate_ticket_number() INTO v_sample;
  RAISE NOTICE 'ticket_number default installed — sample: %', v_sample;
END $$;
