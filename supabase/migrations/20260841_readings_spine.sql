-- ═══════════════════════════════════════════════════════════════════════════
-- 20260841_readings_spine.sql
-- DCIMe V2.1 — Stage 2: a reading gets a real home.
--
-- WHAT IS WRONG TODAY
-- telemetry_logs holds ONE row per site per hour, with every reading for every
-- asset in a single JSONB object. Equipment identity survives only as a naming
-- convention inside the keys — ups_1_battery_voltage — with no foreign key, no
-- per-reading author and no per-reading time. Everything downstream reconstructs
-- the asset by parsing string prefixes, which is why media_ambient_temp could
-- sit on the Data Room sensor for a year without anyone noticing.
--
-- readings gives each value its own row, attached to its asset by key, to its
-- room, and to the person who took it.
--
-- NOT A CUTOVER
-- telemetry_logs remains the write path and the raw record. A trigger fans each
-- write out into readings, so both are readable throughout and nothing has to
-- be switched over in one step. The form, the export and every existing screen
-- carry on untouched.
--
-- THREE KINDS OF FACT ARE CARRIED ACROSS
--   1. The 324 registry parameters — the readings proper.
--   2. Per-asset state: status_<asset>, comment_<asset>, <asset>_remark. Not
--      registry parameters, but genuinely facts about an asset at an hour —
--      "UPS 2 was OFFLINE" is the kind of thing the detailed views exist to
--      show, and the export already reads it. Normalised to parameter_name
--      'status' / 'comment' / 'remark' against the owning asset. Verified: all
--      47 such keys resolve to a real asset, and none of those three names
--      collides with a registry parameter.
--
-- WHAT IS DELIBERATELY LEFT BEHIND
--   · Row-level context (fsm_mode, outage_type, shift, date, site_id) describes
--     the HOUR, not any one reading. It stays on telemetry_logs, which is still
--     there to be joined.
--   · Derived values (ambient_avg_temp, dg_*_calculated_fuel_burn) are
--     recomputed by the Stage 3 rollups. Copying a stale derivation into the
--     spine would let it disagree with its own inputs.
--   · Legacy identity fields (clientSpoc, msPartner, siteName, _report_text,
--     formValues) are V1 residue.
--
-- 'NA' IS A READING, NOT A GAP
-- 5,999 stored values in numeric parameters are the literal string 'NA'. That
-- is a technician saying "not available", which is different from never having
-- been asked. It lands in value_text with value_num NULL, so the rollups can
-- count it without averaging it.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Parsing a stored value ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.to_number_or_null(p_raw text)
RETURNS double precision
LANGUAGE sql IMMUTABLE
AS $$
  -- Guarded by a pattern rather than a exception block: this runs once per
  -- value across the whole history, and trapping an exception per row is
  -- an order of magnitude slower than not raising one.
  SELECT CASE
    WHEN p_raw IS NULL THEN NULL
    WHEN btrim(p_raw) ~ '^-?\d+(\.\d+)?([eE][-+]?\d+)?$' THEN btrim(p_raw)::double precision
    ELSE NULL
  END
$$;

COMMENT ON FUNCTION public.to_number_or_null(text) IS
  'A stored reading as a number, or NULL when it is not one. ''NA'' and '''' '
  'both return NULL — the distinction between them is kept in value_text.';


-- ── 2. A parameter's former name ───────────────────────────────────────────
ALTER TABLE public.equipment_parameters
  ADD COLUMN IF NOT EXISTS legacy_name text;

COMMENT ON COLUMN public.equipment_parameters.legacy_name IS
  'The key this parameter used to be written under. Historical telemetry_logs '
  'rows still carry it, and an offline client holding a cached form may still '
  'send it, so the fan-out below accepts either name.';

CREATE INDEX IF NOT EXISTS idx_equipment_parameters_legacy_name
  ON public.equipment_parameters (legacy_name) WHERE legacy_name IS NOT NULL;

-- The Data Room's ambient sensor has been called media_ambient_* since V1 — a
-- name matching no room, no asset and no sheet heading. It is the reason the
-- daily canvas has a "Media Room" column and the Data Room appears to have no
-- temperature. Renamed here rather than at Stage 1 because it is free while the
-- history is being read anyway.
UPDATE public.equipment_parameters
   SET legacy_name    = parameter_name,
       parameter_name = replace(parameter_name, 'media_ambient_', 'data_ambient_')
 WHERE parameter_name LIKE 'media\_ambient\_%'
   AND legacy_name IS NULL;

UPDATE public.parameter_excel_targets
   SET parameter_name = replace(parameter_name, 'media_ambient_', 'data_ambient_')
 WHERE parameter_name LIKE 'media\_ambient\_%';


-- ── 3. The spine ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.readings (
  site_uuid        uuid        NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  equipment_id     text        NOT NULL REFERENCES public.equipment_registry(equipment_id) ON DELETE CASCADE,
  parameter_name   text        NOT NULL,
  target_hour      timestamptz NOT NULL,

  -- Denormalised from the asset deliberately. A reading belongs to the room it
  -- was taken in, and moving an asset later must not silently re-attribute a
  -- year of history to its new room.
  room_id          uuid        REFERENCES public.rooms(id) ON DELETE SET NULL,

  -- A reading is one or the other. 'NA' is a value_text with no value_num;
  -- a number is a value_num with no value_text.
  value_num        double precision,
  value_text       text,

  technician_id    uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  -- Kept beside the id, not instead of it: a printed record has to keep naming
  -- who took the reading even if the employee row is later removed.
  technician_name  text,
  shift_session_id uuid REFERENCES public.shift_sessions(id) ON DELETE SET NULL,
  recorded_at      timestamptz,

  PRIMARY KEY (site_uuid, equipment_id, parameter_name, target_hour)
);

COMMENT ON TABLE public.readings IS
  'One row per value, per asset, per hour. Derived from telemetry_logs by '
  'trg_fan_out_readings; telemetry_logs remains the write path and the raw record.';

-- One series, over a window. The ordering matches how every chart reads it.
CREATE INDEX IF NOT EXISTS idx_readings_series
  ON public.readings (site_uuid, parameter_name, target_hour DESC);

-- Per-room aggregation — the figure this platform exists to produce, because
-- averaging rooms in different buildings answers nothing.
CREATE INDEX IF NOT EXISTS idx_readings_room
  ON public.readings (site_uuid, room_id, target_hour DESC) WHERE room_id IS NOT NULL;

-- "What did this technician record, and when" — Stage 8.
CREATE INDEX IF NOT EXISTS idx_readings_technician
  ON public.readings (technician_id, target_hour DESC) WHERE technician_id IS NOT NULL;

ALTER TABLE public.readings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Readings: site-scoped read" ON public.readings;
CREATE POLICY "Readings: site-scoped read"
  ON public.readings FOR SELECT
  USING (auth.role() = 'authenticated' AND site_uuid = public.get_my_site_uuid());

-- No write policy. readings is derived, and the only writer is the SECURITY
-- DEFINER trigger below. A row that could be written directly would be a row
-- that could disagree with the log it came from.

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. FANNING ONE LOG ROW OUT INTO READINGS
--
-- Written as a function over a single (site, hour) so the backfill and the
-- trigger share exactly one implementation. Two copies of this logic would
-- drift, and the drift would be invisible: history and new writes would simply
-- disagree about what a reading is.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

CREATE OR REPLACE FUNCTION public.fan_out_readings(p_log_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    value_num, value_text, technician_id, technician_name, shift_session_id, recorded_at)
  SELECT v_log.site_uuid, e.equipment_id, p.parameter_name, v_log.target_hour, e.room_id,
         public.to_number_or_null(raw.val),
         -- Only kept when it is NOT a number, so a value is never stored twice
         -- and "is this numeric" never needs re-deciding downstream.
         CASE WHEN public.to_number_or_null(raw.val) IS NULL THEN raw.val END,
         v_log.technician_id, v_log.technician_name, v_log.shift_session_id,
         COALESCE(v_log.submitted_at, v_log.target_hour)
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
    value_num, value_text, technician_id, technician_name, shift_session_id, recorded_at)
  SELECT v_log.site_uuid, e.equipment_id, k.kind, v_log.target_hour, e.room_id,
         NULL, m.value,
         v_log.technician_id, v_log.technician_name, v_log.shift_session_id,
         COALESCE(v_log.submitted_at, v_log.target_hour)
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
END $$;

COMMENT ON FUNCTION public.fan_out_readings(uuid) IS
  'Explodes one telemetry_logs row into public.readings. Shared by the backfill '
  'and the trigger so history and new writes can never disagree.';

CREATE OR REPLACE FUNCTION public.trg_fan_out_readings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fan_out_readings(NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_telemetry_fan_out ON public.telemetry_logs;
CREATE TRIGGER trg_telemetry_fan_out
  AFTER INSERT OR UPDATE OF metrics ON public.telemetry_logs
  FOR EACH ROW EXECUTE FUNCTION public.trg_fan_out_readings();

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. BACKFILL
--
-- Outside the transactions above so a failure here leaves the spine in place
-- and re-runnable, rather than rolling back the schema with it.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_log    record;
  v_rows   bigint := 0;
  v_logs   int    := 0;
BEGIN
  FOR v_log IN
    SELECT id FROM public.telemetry_logs ORDER BY target_hour
  LOOP
    v_rows := v_rows + public.fan_out_readings(v_log.id);
    v_logs := v_logs + 1;
  END LOOP;
  RAISE NOTICE 'backfill: % log rows -> % readings', v_logs, v_rows;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. SELF-CHECK
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_total bigint; v_num bigint; v_txt bigint; v_na bigint;
  v_assets bigint; v_rooms bigint; v_techs bigint; v_orphan_room bigint;
  v_media bigint;
BEGIN
  SELECT count(*), count(value_num), count(value_text),
         count(*) FILTER (WHERE value_text = 'NA'),
         count(DISTINCT equipment_id), count(DISTINCT room_id), count(DISTINCT technician_id),
         count(*) FILTER (WHERE room_id IS NULL)
    INTO v_total, v_num, v_txt, v_na, v_assets, v_rooms, v_techs, v_orphan_room
    FROM public.readings;

  SELECT count(*) INTO v_media FROM public.readings WHERE parameter_name LIKE 'data\_ambient\_%';

  RAISE NOTICE 'readings: % rows — % numeric, % text (of which % are NA)', v_total, v_num, v_txt, v_na;
  RAISE NOTICE 'attribution: % assets, % rooms, % technicians, % rows with no room',
    v_assets, v_rooms, v_techs, v_orphan_room;
  RAISE NOTICE 'data_ambient_* rows recovered from media_ambient_*: %', v_media;

  IF v_total = 0 THEN
    RAISE WARNING 'No readings were produced — check that telemetry_logs has rows for a site with equipment.';
  END IF;
END $$;
