-- ═══════════════════════════════════════════════════════════════════════════
-- 20260860_provenance.sql
-- DCIMe V2.1 — marking where a row came from.
--
-- WHY, BEFORE ANYTHING IS INJECTED
-- Demonstration data is about to be generated: roughly two months of readings,
-- work orders, incidents and shift records, attributed to the real technicians
-- who work this site, sitting in the same tables as the real compliance record.
--
-- That is a normal thing to do and a bad thing to do untraceably. Once the rows
-- are in, "which of these did somebody actually walk out and measure" has no
-- answer unless it was recorded at the time. So the marker goes in FIRST, and
-- every generated row carries it.
--
-- Two things this buys:
--   · purge_synthetic_data() removes every generated row and nothing else
--   · analytics can exclude or label it, so the technician screen does not
--     quietly report invented work under a real person's name
--
-- VOCABULARY
-- equipment_registry.provenance already uses MANUAL / IMPORT / BMS / DISCOVERED
-- for how an ASSET came to be known. This is a different question — how a
-- READING came to exist — so it has its own words:
--
--     FIELD      a technician submitted it          (the default)
--     SYNTHETIC  generated for demonstration
--     IMPORT     loaded in bulk from a spreadsheet
--     BMS        arrived from building management
--
-- Default FIELD, so every row already in these tables is correctly marked as
-- real without touching it.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. The columns ─────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['telemetry_logs','readings','work_items',
                           'incidents','shift_sessions']
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT ''FIELD''', t);

    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_provenance_check');

    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (provenance IN (''FIELD'',''SYNTHETIC'',''IMPORT'',''BMS''))',
      t, t || '_provenance_check');

    -- Partial: synthetic rows are the minority and the only ones ever filtered
    -- for or deleted in bulk, so indexing the default would be dead weight.
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (provenance) WHERE provenance <> ''FIELD''',
      'idx_' || t || '_provenance', t);
  END LOOP;
END $$;

COMMENT ON COLUMN public.readings.provenance IS
  'How this reading came to exist. FIELD means a technician submitted it. '
  'SYNTHETIC means it was generated for demonstration and is not evidence of '
  'anything — purge_synthetic_data() removes it.';

COMMENT ON COLUMN public.telemetry_logs.provenance IS
  'How this submission came to exist. Carried down to every reading it fans '
  'out into, so the marker cannot be lost between the two tables.';

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The fan-out carries it down
--
-- Reproduced verbatim from the live definition with provenance threaded through
-- both inserts. Nothing else is changed.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

CREATE OR REPLACE FUNCTION public.fan_out_readings(p_log_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_log   public.telemetry_logs%ROWTYPE;
  v_count integer := 0;
  v_more  integer := 0;
BEGIN
  SELECT * INTO v_log FROM public.telemetry_logs WHERE id = p_log_id;
  IF NOT FOUND OR v_log.metrics IS NULL THEN RETURN 0; END IF;

  -- Rebuilt rather than merged. An edit that CLEARS a field has to remove the
  -- reading, and an upsert would leave the old value behind looking current.
  DELETE FROM public.readings r
   WHERE r.site_uuid = v_log.site_uuid
     AND r.target_hour = v_log.target_hour
     AND EXISTS (SELECT 1 FROM public.equipment_registry e
                  WHERE e.equipment_id = r.equipment_id AND e.site_uuid = v_log.site_uuid);

  -- ── Registry parameters ──────────────────────────────────────────────────
  INSERT INTO public.readings (
    site_uuid, equipment_id, parameter_name, target_hour, room_id,
    value_num, value_text, technician_id, technician_name, shift_session_id,
    recorded_at, provenance)
  SELECT v_log.site_uuid, e.equipment_id, p.parameter_name, v_log.target_hour, e.room_id,
         public.to_number_or_null(raw.val),
         -- Only kept when it is NOT a number, so a value is never stored twice
         -- and "is this numeric" never needs re-deciding downstream.
         CASE WHEN public.to_number_or_null(raw.val) IS NULL THEN raw.val END,
         v_log.technician_id, v_log.technician_name, v_log.shift_session_id,
         COALESCE(v_log.submitted_at, v_log.target_hour),
         v_log.provenance
    FROM public.equipment_parameters p
    JOIN public.equipment_registry e
      ON e.equipment_id = p.equipment_id AND e.site_uuid = v_log.site_uuid
    CROSS JOIN LATERAL (
      -- Either name resolves: history was written under legacy_name, and an
      -- offline client holding a cached form may still send it.
      SELECT COALESCE(v_log.metrics ->> p.parameter_name,
                      v_log.metrics ->> p.legacy_name) AS val
    ) raw
   WHERE p.is_active
     AND p.capture_mode <> 'NOT_APPLICABLE'
     AND raw.val IS NOT NULL
     -- An empty string is not a reading. It means the field was on screen and
     -- left blank, which is the absence of a fact rather than a fact.
     AND btrim(raw.val) <> ''
  ON CONFLICT (site_uuid, equipment_id, parameter_name, target_hour) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- ── Per-asset state ──────────────────────────────────────────────────────
  -- status_<asset>, comment_<asset> and <asset>_remark are facts about an asset
  -- at an hour, not registry parameters. Matched against the asset list rather
  -- than by splitting the key on underscores, because asset ids contain them.
  INSERT INTO public.readings (
    site_uuid, equipment_id, parameter_name, target_hour, room_id,
    value_num, value_text, technician_id, technician_name, shift_session_id,
    recorded_at, provenance)
  SELECT v_log.site_uuid, e.equipment_id, k.kind, v_log.target_hour, e.room_id,
         NULL, m.value,
         v_log.technician_id, v_log.technician_name, v_log.shift_session_id,
         COALESCE(v_log.submitted_at, v_log.target_hour),
         v_log.provenance
    FROM jsonb_each_text(v_log.metrics) AS m(key, value)
    JOIN public.equipment_registry e ON e.site_uuid = v_log.site_uuid
    CROSS JOIN LATERAL (
      SELECT CASE
               WHEN m.key = 'status_'  || e.equipment_id THEN 'status'
               WHEN m.key = 'comment_' || e.equipment_id THEN 'comment'
               WHEN m.key = e.equipment_id || '_remark'  THEN 'remark'
             END AS kind
    ) k
   WHERE k.kind IS NOT NULL
     AND m.value IS NOT NULL AND btrim(m.value) <> ''
  ON CONFLICT (site_uuid, equipment_id, parameter_name, target_hour) DO NOTHING;

  -- GET DIAGNOSTICS assigns a single item, never an expression, so the two
  -- inserts are counted separately and summed here.
  GET DIAGNOSTICS v_more = ROW_COUNT;
  v_count := v_count + v_more;
  RETURN v_count;
END $function$;

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Taking it all back out
--
-- The whole justification for the marker. One call, and the database is as it
-- was — which is what makes generating demonstration data a safe thing to do
-- rather than a decision somebody lives with.
--
-- readings are deleted explicitly: the fan-out trigger fires on INSERT and
-- UPDATE only, so removing a log does NOT remove the readings it produced.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

CREATE OR REPLACE FUNCTION public.purge_synthetic_data(p_site_uuid uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_readings int; v_logs int; v_work int; v_inc int; v_shifts int; v_acks int;
BEGIN
  -- Acknowledgements first: they reference work items.
  DELETE FROM public.work_item_acks a
   USING public.work_items w
   WHERE a.work_item_id = w.id
     AND w.provenance = 'SYNTHETIC'
     AND (p_site_uuid IS NULL OR w.site_uuid = p_site_uuid);
  GET DIAGNOSTICS v_acks = ROW_COUNT;

  DELETE FROM public.readings
   WHERE provenance = 'SYNTHETIC'
     AND (p_site_uuid IS NULL OR site_uuid = p_site_uuid);
  GET DIAGNOSTICS v_readings = ROW_COUNT;

  DELETE FROM public.telemetry_logs
   WHERE provenance = 'SYNTHETIC'
     AND (p_site_uuid IS NULL OR site_uuid = p_site_uuid);
  GET DIAGNOSTICS v_logs = ROW_COUNT;

  DELETE FROM public.work_items
   WHERE provenance = 'SYNTHETIC'
     AND (p_site_uuid IS NULL OR site_uuid = p_site_uuid);
  GET DIAGNOSTICS v_work = ROW_COUNT;

  DELETE FROM public.incidents
   WHERE provenance = 'SYNTHETIC'
     AND (p_site_uuid IS NULL OR site_uuid = p_site_uuid);
  GET DIAGNOSTICS v_inc = ROW_COUNT;

  DELETE FROM public.shift_sessions
   WHERE provenance = 'SYNTHETIC'
     AND (p_site_uuid IS NULL OR site_uuid = p_site_uuid);
  GET DIAGNOSTICS v_shifts = ROW_COUNT;

  PERFORM public.refresh_reading_rollups();

  RETURN format(
    '%s readings, %s submissions, %s work items, %s acks, %s incidents, %s shifts removed',
    v_readings, v_logs, v_work, v_acks, v_inc, v_shifts);
END $$;

COMMENT ON FUNCTION public.purge_synthetic_data(uuid) IS
  'Removes every row marked SYNTHETIC and refreshes the rollups. Nothing marked '
  'FIELD is touched. This is what makes generated demonstration data reversible.';

-- Deliberately NOT granted to authenticated. A bulk delete across six tables is
-- not something a signed-in browser session should be able to ask for.
REVOKE ALL ON FUNCTION public.purge_synthetic_data(uuid) FROM anon, authenticated;

COMMIT;


-- ── 4. Self-check ──────────────────────────────────────────────────────────
DO $$
DECLARE
  v_real bigint;
  v_synth bigint;
BEGIN
  SELECT count(*) FILTER (WHERE provenance = 'FIELD'),
         count(*) FILTER (WHERE provenance <> 'FIELD')
    INTO v_real, v_synth
    FROM public.readings;

  RAISE NOTICE 'readings: % marked FIELD, % marked otherwise', v_real, v_synth;

  IF v_synth > 0 THEN
    RAISE WARNING 'Some readings are already marked non-FIELD before any injection';
  END IF;

  -- The marker is worthless if the fan-out drops it, so prove the column is
  -- actually threaded through rather than merely present.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE proname = 'fan_out_readings'
       AND pronamespace = 'public'::regnamespace
       AND prosrc LIKE '%v_log.provenance%'
  ) THEN
    RAISE EXCEPTION 'fan_out_readings does not carry provenance';
  END IF;

  RAISE NOTICE 'fan-out carries provenance; purge_synthetic_data is available';
END $$;
