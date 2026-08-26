-- ═══════════════════════════════════════════════════════════════════════════
-- 20260836_registry_unification.sql
-- DCIMe V2.1 — Stage 1: the registry becomes the only definition of truth.
--
-- WHAT THIS IS FOR
-- The same facts — what equipment exists, what it measures, where the reading
-- goes — are currently written down three times: SITE_01_blueprint.json (324
-- metrics), this registry, and src/config/mappings/excelMappings.ts (614 keys).
-- The three have drifted, and every mapping defect found in the V2.1 audit is
-- a symptom of that drift rather than an independent bug.
--
-- This migration prepares the registry to hold all of it. The destinations
-- themselves arrive in 20260837, which is GENERATED from the TypeScript mapping
-- by scripts/generate-excel-targets.mjs, so the import cannot introduce
-- transcription errors of its own.
--
-- THREE CHANGES
--
--   1. capture_mode — a parameter can now exist in the registry WITHOUT being
--      something a technician types. That is what lets the 291 orphaned Excel
--      columns become real registry rows that print 'NA', and what lets the
--      Environment / Earthing / DG Battery / Inergen sheets be modelled at all.
--      Switching one on later is an UPDATE, never a deploy.
--
--   2. visit_frequency — cadence is a property of the PLACE, not of each
--      reading taken there. HQ Power Room is a separate building visited every
--      four hours, but its ambient sensor was registered hourly and its three
--      aircons 2-hourly, so the form demanded HQ readings 24 and 12 times a day
--      for a room somebody reaches 6 times. The unfillable rounds became blank
--      cells that read as missed captures.
--
--   3. parameter_excel_targets — where a reading lands in the workbooks.
--      A TABLE and not columns on equipment_parameters, because 28 of the 614
--      mappings write to TWO cells: every ambient temperature goes to both the
--      hourly day sheet and the four-hourly Temp Record. The three
--      excel_* columns already on equipment_parameters assume one destination
--      and would silently drop the second, so they are deprecated below.
--
-- NOT IN THIS MIGRATION
-- media_ambient_* is still the Data Room's key. Renaming it to data_ambient_*
-- means rewriting historical telemetry_logs JSONB, which is free during the
-- Stage 2 backfill and expensive here. Deferred deliberately, not forgotten.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. capture_mode ────────────────────────────────────────────────────────
ALTER TABLE public.equipment_parameters
  ADD COLUMN IF NOT EXISTS capture_mode text;

-- Backfilled from is_constant, which already carries the same distinction for
-- the rows that have one: a nameplate figure is not something anybody types.
UPDATE public.equipment_parameters
   SET capture_mode = CASE WHEN COALESCE(is_constant, false) THEN 'CONSTANT' ELSE 'CAPTURED' END
 WHERE capture_mode IS NULL;

ALTER TABLE public.equipment_parameters
  ALTER COLUMN capture_mode SET DEFAULT 'CAPTURED';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'equipment_parameters_capture_mode_check') THEN
    ALTER TABLE public.equipment_parameters
      ADD CONSTRAINT equipment_parameters_capture_mode_check
      CHECK (capture_mode IN ('CAPTURED','CONSTANT','NOT_APPLICABLE'));
  END IF;
END $$;

ALTER TABLE public.equipment_parameters
  ALTER COLUMN capture_mode SET NOT NULL;

COMMENT ON COLUMN public.equipment_parameters.capture_mode IS
  'CAPTURED — a technician types it; the form renders an input. '
  'CONSTANT — a fixed nameplate figure; rendered read-only, exported as constant_value. '
  'NOT_APPLICABLE — not collected at this site yet: hidden from the form entirely '
  'and exported as constant_value (''NA'' by default), so the workbook column is '
  'answered rather than blank. Promoting it to CAPTURED needs no code change.';

-- A row flagged is_constant with no constant_value is a pre-existing defect:
-- the form renders it read-only and the resolver has nothing to put in it, so
-- it shows as a dead field a technician can neither fill nor skip. Restore it
-- to something typeable rather than inventing a value for it — and rather than
-- letting it fail the constraint below.
DO $$
DECLARE v_fixed bigint;
BEGIN
  UPDATE public.equipment_parameters
     SET capture_mode = 'CAPTURED'
   WHERE capture_mode = 'CONSTANT' AND constant_value IS NULL;
  GET DIAGNOSTICS v_fixed = ROW_COUNT;
  IF v_fixed > 0 THEN
    RAISE NOTICE '% constant parameter(s) had no value and were made CAPTURED', v_fixed;
  END IF;
END $$;

-- A parameter nobody types needs something to print. Enforced rather than
-- assumed: a NOT_APPLICABLE row with no constant_value would silently export an
-- empty cell, which is the state this whole mechanism exists to remove.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'equipment_parameters_uncaptured_has_value') THEN
    ALTER TABLE public.equipment_parameters
      ADD CONSTRAINT equipment_parameters_uncaptured_has_value
      CHECK (capture_mode = 'CAPTURED' OR constant_value IS NOT NULL);
  END IF;
END $$;

-- Answering "what does this site not collect yet" is a report an admin will
-- want, and it is the work queue for turning columns on.
CREATE INDEX IF NOT EXISTS idx_equipment_parameters_capture_mode
  ON public.equipment_parameters (capture_mode)
  WHERE capture_mode <> 'CAPTURED';


-- ── 2. Cadence belongs to the place ────────────────────────────────────────
ALTER TABLE public.equipment_registry
  ADD COLUMN IF NOT EXISTS visit_frequency text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'equipment_registry_visit_frequency_check') THEN
    ALTER TABLE public.equipment_registry
      ADD CONSTRAINT equipment_registry_visit_frequency_check
      CHECK (visit_frequency IS NULL OR visit_frequency IN
             ('hourly','2-hour','4-hour','daily','weekly','monthly'));
  END IF;
END $$;

COMMENT ON COLUMN public.equipment_registry.visit_frequency IS
  'How often a technician actually reaches this asset. When set it overrides '
  'every parameter''s own frequency, because no reading can be taken more often '
  'than the person taking it arrives. NULL means the parameter''s own cadence stands.';

-- HQ Power Room is a separate building on a four-hourly round. Its ambient
-- sensor was registered hourly and its three aircons 2-hourly.
--
-- Corroborating evidence that four-hourly is right: hq_ambient_* has no column
-- on the hourly daily-canvas day sheet at all, and appears only on the
-- four-hourly Temp Record. The workbook already knew; the registry did not.
--
-- room_workstation and fm200_panel are also assigned to room_hq but captured
-- hourly and written to the hourly day sheet. They are deliberately NOT touched
-- here — either they sit at the main site and their room assignment is wrong, or
-- their cadence is, and guessing would bury the question.
UPDATE public.equipment_registry
   SET visit_frequency = '4-hour'
 WHERE equipment_id IN ('room_hq_ambient','pac_hq_em1','pac_hq_em2','pac_hq_em3')
   AND visit_frequency IS DISTINCT FROM '4-hour';


-- ── 3. Where a reading lands in the workbooks ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.parameter_excel_targets (
  site_uuid      uuid    NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  parameter_name text    NOT NULL,
  workbook       text    NOT NULL,
  sheet_name     text    NOT NULL,
  column_index   integer NOT NULL,
  -- Names the row geometry of the destination sheet. A column index alone
  -- cannot say which ROW a reading belongs in, because every sheet counts
  -- differently: the day sheet is one row per hour, Temp Record six rows per
  -- day, PAC twenty-three units per two-hourly block. That arithmetic lived in
  -- a switch statement in the export engine, which is why three of its four
  -- cases were wrong.
  row_rule       text    NOT NULL,
  PRIMARY KEY (site_uuid, parameter_name, workbook, sheet_name),
  CONSTRAINT parameter_excel_targets_workbook_check
    CHECK (workbook IN ('daily_canvas','commercial_logbook')),
  CONSTRAINT parameter_excel_targets_row_rule_check
    CHECK (row_rule IN ('hourly_row','four_hourly_row','dg_row','dg_check_row',
                        'fuel_row','pac_row','eqpt_status_row','fss_row')),
  CONSTRAINT parameter_excel_targets_column_check CHECK (column_index >= 0)
);

COMMENT ON TABLE public.parameter_excel_targets IS
  'One row per destination cell. Keyed per site because the two sites use the '
  'same workbook templates with different layouts. A parameter may have several '
  'targets — every ambient temperature writes to both the hourly day sheet and '
  'the four-hourly Temp Record. sheet_name ''DYNAMIC_DAY'' is resolved by the '
  'export to the day-of-month sheet (''1''…''31''); every other value is literal.';

CREATE INDEX IF NOT EXISTS idx_parameter_excel_targets_sheet
  ON public.parameter_excel_targets (site_uuid, workbook, sheet_name);

ALTER TABLE public.parameter_excel_targets ENABLE ROW LEVEL SECURITY;

-- Readable by anyone signed in at the site — the export runs in the browser.
DROP POLICY IF EXISTS "Excel targets: site-scoped read" ON public.parameter_excel_targets;
CREATE POLICY "Excel targets: site-scoped read"
  ON public.parameter_excel_targets FOR SELECT
  USING (auth.role() = 'authenticated' AND site_uuid = public.get_my_site_uuid());

-- Where a column lives is a layout fact, not an operational one.
DROP POLICY IF EXISTS "Excel targets: admin write" ON public.parameter_excel_targets;
CREATE POLICY "Excel targets: admin write"
  ON public.parameter_excel_targets FOR ALL
  USING (public.get_my_role() = 'ADMIN')
  WITH CHECK (public.get_my_role() = 'ADMIN');

-- Superseded by the table above. Left in place rather than dropped in the same
-- migration that replaces them: nothing reads them today (their only writer was
-- seedDatabase.ts, which nothing imports), but dropping a column in the same
-- step as introducing its replacement makes a rollback lossy. They go in Stage 4,
-- once the export engine reads the new table and the conformance test passes.
COMMENT ON COLUMN public.equipment_parameters.excel_workbook IS
  'DEPRECATED — superseded by parameter_excel_targets. Cannot represent the 28 '
  'parameters that write to two cells. Dropped in Stage 4.';
COMMENT ON COLUMN public.equipment_parameters.excel_sheet_name IS
  'DEPRECATED — see parameter_excel_targets.';
COMMENT ON COLUMN public.equipment_parameters.excel_column_index IS
  'DEPRECATED — see parameter_excel_targets.';


-- ── 4. The resolver ────────────────────────────────────────────────────────
-- Return type changes, so it is dropped rather than replaced. Postgres does not
-- track SQL-function-to-function dependencies, so get_site_form_definition
-- survives the drop and is rebuilt below in the same transaction.
--
-- Excel destinations are deliberately NOT returned here. A parameter can have
-- several, and flattening them would duplicate every parameter row on a form.
-- The export reads parameter_excel_targets directly.
DROP FUNCTION IF EXISTS public.resolve_equipment_parameters(text);

CREATE FUNCTION public.resolve_equipment_parameters(p_equipment_id text)
RETURNS TABLE (
  parameter_name text,
  display_label  text,
  data_type      public.parameter_data_type,
  unit           text,
  canonical_unit text,
  dimension      text,
  min_value      double precision,
  max_value      double precision,
  is_required    boolean,
  input_type     text,
  options        jsonb,
  help_text      text,
  display_order  integer,
  frequency      text,
  carry_forward  boolean,
  default_value  text,
  is_constant    boolean,
  constant_value text,
  is_graphable   boolean,
  capture_mode   text,
  source         text            -- 'INSTANCE' or 'TEMPLATE'
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH inst AS (
    SELECT e.equipment_id, e.template_id, e.visit_frequency
      FROM public.equipment_registry e
     WHERE e.equipment_id = p_equipment_id
  ),
  merged AS (
    SELECT p.*, 'INSTANCE'::text AS source, 1 AS precedence
      FROM public.equipment_parameters p
     WHERE p.equipment_id = p_equipment_id AND p.is_active
    UNION ALL
    SELECT p.*, 'TEMPLATE'::text AS source, 2 AS precedence
      FROM public.equipment_parameters p
      JOIN inst i ON i.template_id = p.template_id
     WHERE p.template_id IS NOT NULL AND p.is_active
  ),
  deduped AS (
    SELECT DISTINCT ON (m.parameter_name) m.*
      FROM merged m
     ORDER BY m.parameter_name, m.precedence
  )
  SELECT d.parameter_name,
         COALESCE(d.display_label, d.parameter_name),
         d.data_type,
         d.unit,
         u.canonical_unit,
         u.dimension,
         d.min_value,
         d.max_value,
         d.is_required,
         d.input_type,
         d.options,
         d.help_text,
         d.display_order,
         -- The asset's visit cadence wins. A reading cannot be taken more often
         -- than somebody arrives to take it.
         COALESCE((SELECT i.visit_frequency FROM inst i), d.frequency),
         d.carry_forward,
         d.default_value,
         d.is_constant,
         d.constant_value,
         d.is_graphable,
         d.capture_mode,
         d.source
    FROM deduped d
    LEFT JOIN public.unit_definitions u ON u.unit_code = d.unit
$$;

COMMENT ON FUNCTION public.resolve_equipment_parameters(text) IS
  'Every parameter for one asset, instance definitions overriding template ones, '
  'with the asset''s visit cadence applied. Returns parameters of every '
  'capture_mode — a caller rendering a form must filter NOT_APPLICABLE out '
  'itself, and the export needs all three.';


-- ── 5. The form ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_site_form_definition(
  p_site_uuid uuid DEFAULT NULL,
  p_frequency text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH target AS (
    SELECT COALESCE(p_site_uuid, public.get_my_site_uuid()) AS id
  ),
  items AS (
    SELECT e.equipment_id, e.name, e.category, e.location, e.room_id, e.sort_order
      FROM public.equipment_registry e, target t
     WHERE e.site_uuid = t.id AND COALESCE(e.is_active, true)
  )
  SELECT jsonb_build_object(
    'site_uuid', (SELECT id FROM target),
    'frequency', p_frequency,
    'equipment', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'equipment_id', i.equipment_id,
               'name',         i.name,
               'category',     i.category,
               'location',     i.location,
               'room_id',      i.room_id,
               'parameters',   COALESCE((
                 SELECT jsonb_agg(to_jsonb(r) ORDER BY r.display_order NULLS LAST, r.parameter_name)
                   FROM public.resolve_equipment_parameters(i.equipment_id) r
                  -- NOT_APPLICABLE never reaches the phone. The technician sees
                  -- only what they are actually being asked to read; the value
                  -- those parameters carry is applied at export instead, so 291
                  -- 'NA' strings are not written into every hourly row.
                  WHERE r.capture_mode <> 'NOT_APPLICABLE'
                    AND (p_frequency IS NULL OR r.frequency = p_frequency)
               ), '[]'::jsonb)
             ) ORDER BY i.sort_order NULLS LAST, i.equipment_id)
        FROM items i
       WHERE EXISTS (
         SELECT 1 FROM public.resolve_equipment_parameters(i.equipment_id) r2
          WHERE r2.capture_mode <> 'NOT_APPLICABLE'
            AND (p_frequency IS NULL OR r2.frequency = p_frequency)
       )
    ), '[]'::jsonb)
  );
$$;

COMMENT ON FUNCTION public.get_site_form_definition(uuid, text) IS
  'The whole shift form in one call: every equipment item with its resolved '
  'parameters, optionally filtered to one cadence. Excludes NOT_APPLICABLE.';

REVOKE ALL ON FUNCTION public.get_site_form_definition(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_site_form_definition(uuid, text) TO authenticated;

COMMIT;


-- ── 6. Self-check ──────────────────────────────────────────────────────────
-- Reported rather than asserted: this runs against a live database whose
-- contents cannot be inspected from the repository, so the numbers below are how
-- anyone applying it finds out what actually happened.
DO $$
DECLARE
  v_captured bigint; v_constant bigint; v_na bigint; v_hq bigint;
BEGIN
  SELECT count(*) FILTER (WHERE capture_mode = 'CAPTURED'),
         count(*) FILTER (WHERE capture_mode = 'CONSTANT'),
         count(*) FILTER (WHERE capture_mode = 'NOT_APPLICABLE')
    INTO v_captured, v_constant, v_na
    FROM public.equipment_parameters WHERE is_active;

  SELECT count(*) INTO v_hq
    FROM public.equipment_registry
   WHERE visit_frequency = '4-hour'
     AND equipment_id IN ('room_hq_ambient','pac_hq_em1','pac_hq_em2','pac_hq_em3');

  RAISE NOTICE 'capture_mode: % CAPTURED, % CONSTANT, % NOT_APPLICABLE', v_captured, v_constant, v_na;
  RAISE NOTICE 'HQ assets moved to 4-hour: % of 4', v_hq;
  RAISE NOTICE 'excel targets loaded: % (20260837 fills these)',
    (SELECT count(*) FROM public.parameter_excel_targets);

  IF v_hq < 4 THEN
    RAISE NOTICE 'NOTE: fewer than 4 HQ assets matched — check equipment_id naming at this site.';
  END IF;
END $$;
