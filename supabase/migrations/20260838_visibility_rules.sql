-- ═══════════════════════════════════════════════════════════════════════════
-- 20260838_visibility_rules.sql
-- DCIMe V2.1 — Stage 1: what a technician is asked for depends on facility state.
--
-- WHY THIS IS URGENT RATHER THAN TIDY
-- 20260837 loaded the registry, which switched on /tech/readings — a screen that
-- had been rendering nothing because get_site_form_definition() returned zero
-- groups. It now renders the full round, and it renders it WITHOUT the
-- visibility logic the V1 dashboard has always applied. The immediate symptom:
-- all five generators appear on every hourly round while the site is running
-- normally on mains, asking for readings that cannot be taken.
--
-- That logic lives in getVisibleMetrics() in RoutineTasksDashboard.tsx as a
-- switch statement over four rules. Duplicating the switch into the second form
-- would be the same mistake this whole stage exists to undo, so the rules move
-- into the registry and both forms read them from one place.
--
-- THE FOUR RULES, AS THEY EXIST TODAY
--   1. Generators are invisible in NORMAL — the site is on mains, nothing to read.
--   2. During DAILY_TEST the generators run OFF LOAD, so their electrical load
--      parameters (phase currents, line voltages, kWh meter, frequency) have no
--      meaningful value even though the machine is running.
--   3. Grid parameters are invisible during OUTAGE and ON_LOAD_TEST — there is
--      no utility supply to read.
--   4. grid_status is never typed by anybody; it is implied by facility mode.
--
-- TWO COLUMNS COVER ALL FOUR
--   equipment_registry.visible_in_modes  — rules 1 and 3, which are about the
--                                          whole asset.
--   equipment_parameters.hidden_in_modes — rules 2 and 4, which single out
--                                          individual readings.
--
-- NOT MODELLED HERE
-- activeGenerators (which specific machines ran during a test) is a property of
-- the shift, not of the registry — the technician ticks it per round. It stays
-- in the form.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Columns ─────────────────────────────────────────────────────────────
ALTER TABLE public.equipment_registry
  ADD COLUMN IF NOT EXISTS visible_in_modes text[];

COMMENT ON COLUMN public.equipment_registry.visible_in_modes IS
  'Facility modes in which this asset is worth reading. NULL means every mode, '
  'which is the case for all but the generators and the utility feed.';

ALTER TABLE public.equipment_parameters
  ADD COLUMN IF NOT EXISTS hidden_in_modes text[];

COMMENT ON COLUMN public.equipment_parameters.hidden_in_modes IS
  'Facility modes in which this specific reading is withheld even though its '
  'asset is visible. NULL means never withheld. Used for the generator load '
  'parameters during an off-load test, and for grid_status, which is implied by '
  'the facility mode rather than typed.';

-- Guard the vocabulary. A typo here silently hides a field forever, and the
-- symptom (a reading nobody was asked for) looks like a technician problem.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'equipment_registry_visible_modes_check') THEN
    ALTER TABLE public.equipment_registry
      ADD CONSTRAINT equipment_registry_visible_modes_check
      CHECK (visible_in_modes IS NULL OR
             visible_in_modes <@ ARRAY['NORMAL','DAILY_TEST','OUTAGE','ON_LOAD_TEST']::text[]);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'equipment_parameters_hidden_modes_check') THEN
    ALTER TABLE public.equipment_parameters
      ADD CONSTRAINT equipment_parameters_hidden_modes_check
      CHECK (hidden_in_modes IS NULL OR
             hidden_in_modes <@ ARRAY['NORMAL','DAILY_TEST','OUTAGE','ON_LOAD_TEST']::text[]);
  END IF;
END $$;


-- ── 2. The rules, as data ──────────────────────────────────────────────────

-- Rule 1 — generators are read only when they are running.
UPDATE public.equipment_registry
   SET visible_in_modes = ARRAY['DAILY_TEST','OUTAGE','ON_LOAD_TEST']
 WHERE category = 'GENERATOR'
   AND visible_in_modes IS DISTINCT FROM ARRAY['DAILY_TEST','OUTAGE','ON_LOAD_TEST'];

-- Rule 3 — there is no utility supply to read during an outage or a load test.
UPDATE public.equipment_registry
   SET visible_in_modes = ARRAY['NORMAL','DAILY_TEST']
 WHERE category = 'MAINS'
   AND visible_in_modes IS DISTINCT FROM ARRAY['NORMAL','DAILY_TEST'];

-- Rule 2 — a daily test runs the machine off load, so its electrical output
-- parameters have no value to read even though the engine is turning. Matched
-- on the suffixes the V1 switch used, against generator assets only.
UPDATE public.equipment_parameters p
   SET hidden_in_modes = ARRAY['DAILY_TEST']
  FROM public.equipment_registry e
 WHERE e.equipment_id = p.equipment_id
   AND e.category = 'GENERATOR'
   AND (p.parameter_name ~ '_(current_[ryb]|voltage_(ry|yb|br)|kwh_meter|frequency)$')
   AND p.hidden_in_modes IS DISTINCT FROM ARRAY['DAILY_TEST'];

-- Rule 4 — grid_status is derived from the facility mode, never typed.
UPDATE public.equipment_parameters
   SET hidden_in_modes = ARRAY['NORMAL','DAILY_TEST','OUTAGE','ON_LOAD_TEST']
 WHERE parameter_name = 'grid_status'
   AND hidden_in_modes IS DISTINCT FROM ARRAY['NORMAL','DAILY_TEST','OUTAGE','ON_LOAD_TEST'];


-- ── 3. The resolver carries the rule ───────────────────────────────────────
DROP FUNCTION IF EXISTS public.resolve_equipment_parameters(text);

CREATE FUNCTION public.resolve_equipment_parameters(p_equipment_id text)
RETURNS TABLE (
  parameter_name  text,
  display_label   text,
  data_type       public.parameter_data_type,
  unit            text,
  canonical_unit  text,
  dimension       text,
  min_value       double precision,
  max_value       double precision,
  is_required     boolean,
  input_type      text,
  options         jsonb,
  help_text       text,
  display_order   integer,
  frequency       text,
  carry_forward   boolean,
  default_value   text,
  is_constant     boolean,
  constant_value  text,
  is_graphable    boolean,
  capture_mode    text,
  hidden_in_modes text[],
  source          text            -- 'INSTANCE' or 'TEMPLATE'
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
         d.data_type, d.unit, u.canonical_unit, u.dimension,
         d.min_value, d.max_value, d.is_required, d.input_type,
         d.options, d.help_text, d.display_order,
         -- The asset's visit cadence wins. A reading cannot be taken more often
         -- than somebody arrives to take it.
         COALESCE((SELECT i.visit_frequency FROM inst i), d.frequency),
         d.carry_forward, d.default_value, d.is_constant, d.constant_value,
         d.is_graphable, d.capture_mode, d.hidden_in_modes, d.source
    FROM deduped d
    LEFT JOIN public.unit_definitions u ON u.unit_code = d.unit
$$;

COMMENT ON FUNCTION public.resolve_equipment_parameters(text) IS
  'Every parameter for one asset, instance definitions overriding template ones, '
  'with the asset''s visit cadence applied. Returns every capture_mode and every '
  'visibility rule unfiltered — get_site_form_definition() applies them.';


-- ── 4. The form asks for the facility mode ─────────────────────────────────
-- The old two-argument version is dropped rather than left alongside: keeping
-- both would make get_site_form_definition(uuid, text) ambiguous against the
-- new signature's defaults, and a caller that forgot the mode would silently
-- get the unfiltered form back.
DROP FUNCTION IF EXISTS public.get_site_form_definition(uuid, text);
DROP FUNCTION IF EXISTS public.get_site_form_definition(uuid, text, text);

CREATE FUNCTION public.get_site_form_definition(
  p_site_uuid uuid DEFAULT NULL,
  p_frequency text DEFAULT NULL,
  p_fsm_mode  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH target AS (
    SELECT COALESCE(p_site_uuid, public.get_my_site_uuid()) AS id,
           -- No mode supplied means "do not filter on mode". Reading the site's
           -- current state here instead would make the form's contents depend on
           -- something the caller never asked about.
           p_fsm_mode AS mode
  ),
  items AS (
    SELECT e.equipment_id, e.name, e.category, e.location, e.room_id, e.sort_order
      FROM public.equipment_registry e, target t
     WHERE e.site_uuid = t.id
       AND COALESCE(e.is_active, true)
       AND (t.mode IS NULL
            OR e.visible_in_modes IS NULL
            OR t.mode = ANY (e.visible_in_modes))
  )
  SELECT jsonb_build_object(
    'site_uuid', (SELECT id FROM target),
    'frequency', p_frequency,
    'fsm_mode',  p_fsm_mode,
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
                  -- NOT_APPLICABLE never reaches the phone: the workbook asks
                  -- for it but this site does not collect it, and the export
                  -- supplies 'NA' instead.
                  WHERE r.capture_mode <> 'NOT_APPLICABLE'
                    AND (p_frequency IS NULL OR r.frequency = p_frequency)
                    AND ((SELECT mode FROM target) IS NULL
                         OR r.hidden_in_modes IS NULL
                         OR NOT ((SELECT mode FROM target) = ANY (r.hidden_in_modes)))
               ), '[]'::jsonb)
             ) ORDER BY i.sort_order NULLS LAST, i.equipment_id)
        FROM items i
       WHERE EXISTS (
         SELECT 1 FROM public.resolve_equipment_parameters(i.equipment_id) r2
          WHERE r2.capture_mode <> 'NOT_APPLICABLE'
            AND (p_frequency IS NULL OR r2.frequency = p_frequency)
            AND ((SELECT mode FROM target) IS NULL
                 OR r2.hidden_in_modes IS NULL
                 OR NOT ((SELECT mode FROM target) = ANY (r2.hidden_in_modes)))
       )
    ), '[]'::jsonb)
  );
$$;

COMMENT ON FUNCTION public.get_site_form_definition(uuid, text, text) IS
  'The whole shift form in one call: every asset with its resolved parameters, '
  'filtered to one cadence and one facility mode. Omitting the mode returns the '
  'form unfiltered, which is what a report wants and a technician does not.';

REVOKE ALL ON FUNCTION public.get_site_form_definition(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_site_form_definition(uuid, text, text) TO authenticated;

COMMIT;


-- ── 5. Self-check ──────────────────────────────────────────────────────────
DO $$
DECLARE
  v_gen int; v_mains int; v_load int; v_status int;
  v_normal int; v_test int;
BEGIN
  SELECT count(*) INTO v_gen   FROM public.equipment_registry WHERE category='GENERATOR' AND visible_in_modes IS NOT NULL;
  SELECT count(*) INTO v_mains FROM public.equipment_registry WHERE category='MAINS'     AND visible_in_modes IS NOT NULL;
  SELECT count(*) INTO v_load  FROM public.equipment_parameters WHERE hidden_in_modes = ARRAY['DAILY_TEST'];
  SELECT count(*) INTO v_status FROM public.equipment_parameters WHERE parameter_name='grid_status' AND hidden_in_modes IS NOT NULL;

  SELECT count(*) INTO v_normal FROM jsonb_array_elements(
    public.get_site_form_definition((SELECT id FROM public.sites WHERE site_code='SITE_01'), 'hourly', 'NORMAL') -> 'equipment') g
   WHERE g ->> 'category' = 'GENERATOR';
  SELECT count(*) INTO v_test FROM jsonb_array_elements(
    public.get_site_form_definition((SELECT id FROM public.sites WHERE site_code='SITE_01'), 'hourly', 'DAILY_TEST') -> 'equipment') g
   WHERE g ->> 'category' = 'GENERATOR';

  RAISE NOTICE 'rules: % generators, % mains assets, % load parameters, % grid_status', v_gen, v_mains, v_load, v_status;
  RAISE NOTICE 'hourly form — generators shown in NORMAL: % (expect 0), in DAILY_TEST: % (expect >0)', v_normal, v_test;

  IF v_normal <> 0 THEN
    RAISE WARNING 'Generators are still visible in NORMAL mode — rule 1 did not apply.';
  END IF;
END $$;
