-- ═══════════════════════════════════════════════════════════════════════════
-- 20260874_template_capture_parameters.sql
-- DCIMe V2.1 — a template that knows what its equipment measures.
--
-- THE GAP
-- equipment_templates.default_parameters holds NAMEPLATE data — a rack's 42U
-- height, a PAC's 30 kW capacity. Useful, and not what a form is built from.
-- Nothing anywhere says "an equipment rack measures these nine things", so
-- registering an asset in Inventory produces an asset with no parameters, and
-- somebody then adds them one at a time by hand. equipment_parameters.template_id
-- exists and is never populated, which is the shape of an intention that was
-- never finished.
--
-- WHAT THIS ADDS
--   capture_parameters   what a technician reads off this kind of equipment
--   apply_template_parameters()   provisions them onto a specific asset
--
-- Kept separate from default_parameters rather than merged into it: one is what
-- the machine IS, the other is what it TELLS you. Merging them would mean every
-- consumer of the nameplate had to skip over the capture list.
--
-- ── THE RACK SET, AND WHERE IT COMES FROM ─────────────────────────────────
-- Site has no IT racks registered, so nothing here is applied yet — this is the
-- definition waiting for the first one. The choice of what to measure was
-- delegated to standard practice rather than specified, so:
--
-- THERMAL — ASHRAE TC9.9 measures at the RACK INLET, not in the room, and at
-- THREE HEIGHTS. Stratification is the characteristic data-hall failure: a hall
-- averaging a comfortable 21 °C routinely has 28 °C at the top of a rack while
-- the floor sensor reads 18. A single mid-height probe reports the average and
-- misses precisely the condition that kills equipment. Exhaust is captured too,
-- because inlet-to-exhaust rise is what actually reveals airflow.
--
-- ELECTRICAL — rack PDU load in kW and A, with voltage. Amps per phase is the
-- automated-DCIM convention; a hand-written round reads whatever the PDU face
-- shows, so this registers a single load_amps and leaves per-phase to be added
-- if the racks turn out to be three-phase fed.
--
-- CAPACITY — U used, as CONSTANT. It is a real fact about the rack that changes
-- when somebody installs a server, not something to retype every hour.
--
-- ⚠ ONE THING SITE KNOWLEDGE WOULD CHANGE: whether racks are single- or
-- three-phase fed. Three-phase would make load_amps three parameters, not one.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.equipment_templates
  ADD COLUMN IF NOT EXISTS capture_parameters jsonb;

COMMENT ON COLUMN public.equipment_templates.capture_parameters IS
  'What a technician reads off this kind of equipment, as an array of parameter '
  'prototypes. Distinct from default_parameters, which is nameplate data. '
  'apply_template_parameters() turns these into equipment_parameters rows.';

-- ── The rack set ───────────────────────────────────────────────────────────
UPDATE public.equipment_templates
   SET capture_parameters = $json$[
  {"measure":"inlet_temp_bottom","label":"Inlet Temp — Bottom","unit":"degC",
   "type":"number","graph":true,"order":10,
   "min":18,"warn_min":20,"warn_max":25,"max":27,
   "help":"Air entering the rack at floor level. ASHRAE TC9.9 recommended envelope."},

  {"measure":"inlet_temp_middle","label":"Inlet Temp — Middle","unit":"degC",
   "type":"number","graph":true,"order":11,
   "min":18,"warn_min":20,"warn_max":25,"max":27,
   "help":"Air entering the rack at mid height."},

  {"measure":"inlet_temp_top","label":"Inlet Temp — Top","unit":"degC",
   "type":"number","graph":true,"order":12,
   "min":18,"warn_min":20,"warn_max":25,"max":27,
   "help":"Air entering the rack at the top. Usually the hottest — stratification shows here first."},

  {"measure":"exhaust_temp","label":"Exhaust Temp","unit":"degC",
   "type":"number","graph":true,"order":13,
   "min":null,"warn_min":null,"warn_max":40,"max":45,
   "help":"Air leaving the rack. The rise from inlet to exhaust is what reveals airflow."},

  {"measure":"inlet_humidity","label":"Inlet Humidity","unit":"%RH",
   "type":"number","graph":true,"order":14,
   "min":20,"warn_min":30,"warn_max":50,"max":60,
   "help":"Relative humidity at the rack face."},

  {"measure":"rack_load_kw","label":"Rack Load","unit":"kW",
   "type":"number","graph":true,"order":20,
   "min":null,"warn_min":null,"warn_max":8,"max":10,
   "help":"Real power drawn, from the rack PDU. Warn band assumes a 10 kW rack."},

  {"measure":"rack_load_amps","label":"Rack Load Current","unit":"A",
   "type":"number","graph":true,"order":21,
   "min":null,"warn_min":null,"warn_max":26,"max":32,
   "help":"Current at the PDU. Assumes a 32 A feed — correct this if yours differ."},

  {"measure":"rack_voltage","label":"Rack Voltage","unit":"V",
   "type":"number","graph":true,"order":22,
   "min":207,"warn_min":218,"warn_max":242,"max":253,
   "help":"Supply voltage at the PDU. IEC 60038, 230 V nominal."},

  {"measure":"rack_u_used","label":"U Used","unit":null,
   "type":"number","graph":false,"order":30,"constant":true,
   "min":0,"warn_min":null,"warn_max":38,"max":42,
   "help":"Rack units occupied. Changes when hardware is installed, not hourly."}
]$json$::jsonb
 WHERE template_id = 'TPL_RACK';

COMMIT;


-- ── Turning a template into an asset's parameters ──────────────────────────
BEGIN;

CREATE OR REPLACE FUNCTION public.apply_template_parameters(
  p_equipment_id text,
  p_template_id  text DEFAULT NULL,
  p_frequency    text DEFAULT 'hourly'
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template text;
  v_spec     jsonb;
  v_count    int := 0;
BEGIN
  -- Fall back to whatever template the asset was registered against.
  SELECT COALESCE(p_template_id, e.template_id) INTO v_template
    FROM public.equipment_registry e WHERE e.equipment_id = p_equipment_id;

  IF v_template IS NULL THEN
    RAISE EXCEPTION 'No template given and % is not registered against one', p_equipment_id;
  END IF;

  SELECT t.capture_parameters INTO v_spec
    FROM public.equipment_templates t WHERE t.template_id = v_template;

  IF v_spec IS NULL OR jsonb_typeof(v_spec) <> 'array' THEN
    RAISE EXCEPTION 'Template % defines no capture parameters', v_template;
  END IF;

  INSERT INTO public.equipment_parameters (
    equipment_id, parameter_name, measure, display_label, unit,
    data_type, input_type, is_graphable, display_order,
    min_value, warn_min, warn_max, max_value,
    help_text, frequency, capture_mode, template_id)
  SELECT p_equipment_id,
         -- Parameter names embed their asset; measures do not. That is what
         -- lets one screen chart every rack's inlet temperature together.
         p_equipment_id || '_' || (s->>'measure'),
         s->>'measure',
         s->>'label',
         s->>'unit',
         COALESCE(s->>'type','number')::parameter_data_type,
         COALESCE(s->>'type','number'),
         COALESCE((s->>'graph')::boolean, false),
         COALESCE((s->>'order')::int, 100),
         (s->>'min')::double precision,
         (s->>'warn_min')::double precision,
         (s->>'warn_max')::double precision,
         (s->>'max')::double precision,
         s->>'help',
         p_frequency,
         CASE WHEN COALESCE((s->>'constant')::boolean, false)
              THEN 'CONSTANT' ELSE 'CAPTURED' END,
         v_template
    FROM jsonb_array_elements(v_spec) s
  -- Re-running must not duplicate. A parameter already present keeps whatever
  -- it has been edited to; the template does not overwrite a person's work.
  ON CONFLICT (equipment_id, parameter_name) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

COMMENT ON FUNCTION public.apply_template_parameters(text, text, text) IS
  'Provisions an asset with the capture parameters its template defines. Safe '
  'to re-run: existing parameters are left exactly as they are.';

GRANT EXECUTE ON FUNCTION public.apply_template_parameters(text, text, text) TO authenticated;

COMMIT;


DO $$
DECLARE v_n int;
BEGIN
  SELECT jsonb_array_length(capture_parameters) INTO v_n
    FROM public.equipment_templates WHERE template_id = 'TPL_RACK';
  RAISE NOTICE 'TPL_RACK defines % capture parameters', v_n;
  RAISE NOTICE 'No IT racks are registered at any live site, so none are applied yet.';
  RAISE NOTICE 'Register one in Inventory, then: select apply_template_parameters(''<id>'', ''TPL_RACK'');';
END $$;
