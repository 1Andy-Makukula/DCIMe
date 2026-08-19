-- ═══════════════════════════════════════════════════════════════════════════
-- 20260816_parameter_registry.sql
-- DCIMe V2 — Stage 6a: the parameter registry gains what forms actually need
--
-- WHERE THE HARDCODING ACTUALLY LIVES
-- The 324 metric definitions a technician fills in every shift are not in React
-- components — they are in src/config/sites/NTC_blueprint.json, as a `metrics`
-- array on each of 47 equipment entries. That is why "a supervisor asks to track
-- a new parameter" means editing a JSON file, rebuilding and redeploying.
--
-- Stage 1 promoted equipment_parameters to a schema registry, but modelled it on
-- the Excel mapping table it grew out of. The blueprint carries four things that
-- registry has no home for, and a form cannot be generated without them.
--
-- Idempotent: safe to re-run. No behaviour change until Stage 6b reads from it.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.equipment_parameters
  -- What the technician reads on the form. parameter_name is the storage key
  -- (server_ambient_temp); this is the human string ("Temperature (°C)").
  -- Without it every form field would be labelled with a snake_case identifier.
  ADD COLUMN IF NOT EXISTS display_label text,

  -- How often this reading is taken. The walking order and the shift checklist
  -- both depend on it: an hourly temperature and a daily fuel dip do not belong
  -- on the same screen.
  ADD COLUMN IF NOT EXISTS frequency text,

  -- Prefill from the previous shift's value rather than blank. Used for slow-
  -- moving readings (meter totals, cumulative run-hours) where starting from
  -- empty invites a transcription error.
  ADD COLUMN IF NOT EXISTS carry_forward boolean NOT NULL DEFAULT false,

  -- Initial value offered on a blank form. Distinct from constant_value, which
  -- is a fixed nameplate figure the technician cannot change.
  ADD COLUMN IF NOT EXISTS default_value text;

COMMENT ON COLUMN public.equipment_parameters.display_label IS
  'Human-facing field label. parameter_name remains the storage key in '
  'telemetry_logs.metrics.';

COMMENT ON COLUMN public.equipment_parameters.carry_forward IS
  'Prefill from the last recorded value instead of blank — meter totals and '
  'run-hours, where a blank field invites transcription error.';

-- Frequencies observed in the blueprint. Constrained rather than free text so a
-- typo cannot quietly create a fifth cadence that no screen renders.
ALTER TABLE public.equipment_parameters
  DROP CONSTRAINT IF EXISTS equipment_parameters_frequency_check;
ALTER TABLE public.equipment_parameters
  ADD CONSTRAINT equipment_parameters_frequency_check
  CHECK (frequency IS NULL OR frequency IN ('hourly','2-hour','4-hour','daily','weekly','monthly'));

-- Forms are rendered in frequency order, then display order.
CREATE INDEX IF NOT EXISTS idx_equipment_parameters_form
  ON public.equipment_parameters (equipment_id, frequency, display_order)
  WHERE equipment_id IS NOT NULL AND is_active;

-- ── The resolver must return the new columns ──────────────────────────────
-- Stage 1's version predates them, so a form calling it would render fields
-- with no labels and no cadence.
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
  source         text            -- 'INSTANCE' or 'TEMPLATE'
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH inst AS (
    SELECT e.equipment_id, e.template_id
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
         d.frequency,
         d.carry_forward,
         d.default_value,
         d.is_constant,
         d.constant_value,
         d.is_graphable,
         d.source
    FROM deduped d
    LEFT JOIN public.unit_definitions u ON u.unit_code = d.unit
   ORDER BY d.display_order NULLS LAST, d.parameter_name;
$$;

COMMENT ON FUNCTION public.resolve_equipment_parameters(text) IS
  'Template definitions merged with instance overrides — the field list a form '
  'renders. SECURITY INVOKER; do not change.';

REVOKE ALL ON FUNCTION public.resolve_equipment_parameters(text) FROM public;
GRANT EXECUTE ON FUNCTION public.resolve_equipment_parameters(text) TO authenticated;

-- ── One call per equipment item would be dozens of round trips ────────────
-- A shift form covers every item in a site. This returns the whole form in a
-- single request, grouped by equipment.
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
                  WHERE p_frequency IS NULL OR r.frequency = p_frequency
               ), '[]'::jsonb)
             ) ORDER BY i.sort_order NULLS LAST, i.equipment_id)
        FROM items i
       WHERE EXISTS (
         SELECT 1 FROM public.resolve_equipment_parameters(i.equipment_id) r2
          WHERE p_frequency IS NULL OR r2.frequency = p_frequency
       )
    ), '[]'::jsonb)
  );
$$;

COMMENT ON FUNCTION public.get_site_form_definition(uuid, text) IS
  'The whole shift form in one call: every equipment item with its resolved '
  'parameters, optionally filtered to one cadence.';

REVOKE ALL ON FUNCTION public.get_site_form_definition(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_site_form_definition(uuid, text) TO authenticated;

COMMIT;
