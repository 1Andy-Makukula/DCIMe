-- Captured 2026-08-22T15:03:57Z immediately before applying 20260836/20260837.
-- Restores the two function definitions those migrations replace.
-- Additive objects (capture_mode, visit_frequency, parameter_excel_targets)
-- are listed at the foot as explicit DROP statements, not run automatically.

CREATE OR REPLACE FUNCTION public.resolve_equipment_parameters(p_equipment_id text)
 RETURNS TABLE(parameter_name text, display_label text, data_type parameter_data_type, unit text, canonical_unit text, dimension text, min_value double precision, max_value double precision, is_required boolean, input_type text, options jsonb, help_text text, display_order integer, frequency text, carry_forward boolean, default_value text, is_constant boolean, constant_value text, is_graphable boolean, source text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_site_form_definition(p_site_uuid uuid DEFAULT NULL::uuid, p_frequency text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$
;

-- To fully undo the additive changes as well:
--   DROP TABLE IF EXISTS public.parameter_excel_targets;
--   DELETE FROM public.equipment_parameters WHERE capture_mode IS NOT NULL
--     AND parameter_name <> 'oil_pressure';
--   ALTER TABLE public.equipment_parameters
--     DROP CONSTRAINT IF EXISTS equipment_parameters_capture_mode_check,
--     DROP CONSTRAINT IF EXISTS equipment_parameters_uncaptured_has_value,
--     DROP COLUMN IF EXISTS capture_mode;
--   ALTER TABLE public.equipment_registry
--     DROP CONSTRAINT IF EXISTS equipment_registry_visit_frequency_check,
--     DROP COLUMN IF EXISTS visit_frequency;
