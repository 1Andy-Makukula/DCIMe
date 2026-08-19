-- ═══════════════════════════════════════════════════════════════════════════
-- 20260812_reference_layer.sql
-- DCIMe V2 — Stage 1: the reference layer
--
-- Adds the three tables the rest of Phase 1 stands on:
--   1. unit_definitions     — dimensioned units, so kVA can never be added to A
--   2. equipment_templates  — the blueprint half of Template/Instance (Rule 1)
--   3. equipment_parameters — PROMOTED from an Excel-mapping table to the
--                             schema registry that will generate field forms
--
-- NO BEHAVIOUR CHANGE. Nothing here alters what the app currently does. Every
-- existing equipment_parameters row keeps working untouched (equipment_id set,
-- template_id null). No data migration. No column drops. No renames.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. UNIT DEFINITIONS
--
--    Conversion contract:   canonical_value = (raw_value * factor) + offset
--
--    The offset exists for temperature. °F -> °C is (F - 32) * 5/9, which is
--    not expressible as a bare multiplier — a factor-only design silently
--    corrupts every Fahrenheit reading it touches.
--
--    `dimension` is the column that earns its keep: it makes "add kVA to amps"
--    a constraint violation rather than a plausible-looking wrong number on an
--    executive slide.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.unit_definitions (
  unit_code           text PRIMARY KEY,
  display_name        text        NOT NULL,
  dimension           text        NOT NULL,
  canonical_unit      text        NOT NULL,
  to_canonical_factor double precision NOT NULL DEFAULT 1.0,
  to_canonical_offset double precision NOT NULL DEFAULT 0.0,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unit_definitions_dimension_check CHECK (
    dimension IN ('POWER','APPARENT_POWER','ENERGY','CURRENT','VOLTAGE',
                  'FREQUENCY','TEMPERATURE','HUMIDITY','VOLUME','VOLUME_FLOW',
                  'PRESSURE','MASS','TIME','SPEED','RATIO','COUNT','TEXT')
  ),

  -- A unit that IS the canonical unit must be an identity conversion.
  CONSTRAINT unit_definitions_canonical_identity CHECK (
    unit_code <> canonical_unit
    OR (to_canonical_factor = 1.0 AND to_canonical_offset = 0.0)
  )
);

COMMENT ON TABLE public.unit_definitions IS
  'Dimensioned unit registry. Telemetry is stored in canonical units; the UI '
  'converts at the edge. canonical = (raw * to_canonical_factor) + to_canonical_offset';

-- Seed. Covers every unit the current telemetry blob implies, plus the obvious
-- neighbours. Re-running updates factors rather than erroring.
INSERT INTO public.unit_definitions
  (unit_code, display_name, dimension, canonical_unit, to_canonical_factor, to_canonical_offset)
VALUES
  -- Power (canonical: kW)
  ('kW',    'Kilowatt',              'POWER',          'kW',   1.0,      0.0),
  ('W',     'Watt',                  'POWER',          'kW',   0.001,    0.0),
  ('MW',    'Megawatt',              'POWER',          'kW',   1000.0,   0.0),
  -- Apparent power kept as its OWN dimension. kVA is not kW; conflating them
  -- is the single most common power-reporting error in facilities work.
  ('kVA',   'Kilovolt-ampere',       'APPARENT_POWER', 'kVA',  1.0,      0.0),
  ('VA',    'Volt-ampere',           'APPARENT_POWER', 'kVA',  0.001,    0.0),
  ('MVA',   'Megavolt-ampere',       'APPARENT_POWER', 'kVA',  1000.0,   0.0),
  -- Energy (canonical: kWh)
  ('kWh',   'Kilowatt-hour',         'ENERGY',         'kWh',  1.0,      0.0),
  ('MWh',   'Megawatt-hour',         'ENERGY',         'kWh',  1000.0,   0.0),
  -- Current (canonical: A)
  ('A',     'Ampere',                'CURRENT',        'A',    1.0,      0.0),
  ('mA',    'Milliampere',           'CURRENT',        'A',    0.001,    0.0),
  ('kA',    'Kiloampere',            'CURRENT',        'A',    1000.0,   0.0),
  -- Voltage (canonical: V)
  ('V',     'Volt',                  'VOLTAGE',        'V',    1.0,      0.0),
  ('kV',    'Kilovolt',              'VOLTAGE',        'V',    1000.0,   0.0),
  ('mV',    'Millivolt',             'VOLTAGE',        'V',    0.001,    0.0),
  -- Frequency
  ('Hz',    'Hertz',                 'FREQUENCY',      'Hz',   1.0,      0.0),
  -- Temperature (canonical: degC) — note the offset on Fahrenheit
  ('degC',  'Degrees Celsius',       'TEMPERATURE',    'degC', 1.0,      0.0),
  ('degF',  'Degrees Fahrenheit',    'TEMPERATURE',    'degC', 0.555556, -17.777778),
  ('K',     'Kelvin',                'TEMPERATURE',    'degC', 1.0,      -273.15),
  -- Humidity / ratios
  ('%RH',   'Relative Humidity %',   'HUMIDITY',       '%RH',  1.0,      0.0),
  ('%',     'Percent',               'RATIO',          '%',    1.0,      0.0),
  ('pf',    'Power Factor',          'RATIO',          'pf',   1.0,      0.0),
  ('PUE',   'Power Usage Effectiveness','RATIO',       'PUE',  1.0,      0.0),
  -- Volume (canonical: L)
  ('L',     'Litre',                 'VOLUME',         'L',    1.0,      0.0),
  ('mL',    'Millilitre',            'VOLUME',         'L',    0.001,    0.0),
  ('m3',    'Cubic metre',           'VOLUME',         'L',    1000.0,   0.0),
  ('L/hr',  'Litres per hour',       'VOLUME_FLOW',    'L/hr', 1.0,      0.0),
  -- Pressure (canonical: kPa)
  ('kPa',   'Kilopascal',            'PRESSURE',       'kPa',  1.0,      0.0),
  ('bar',   'Bar',                   'PRESSURE',       'kPa',  100.0,    0.0),
  ('psi',   'Pounds per square inch','PRESSURE',       'kPa',  6.894757,  0.0),
  -- Mass
  ('kg',    'Kilogram',              'MASS',           'kg',   1.0,      0.0),
  -- Time (canonical: min)
  ('min',   'Minute',                'TIME',           'min',  1.0,      0.0),
  ('s',     'Second',                'TIME',           'min',  0.0166667, 0.0),
  ('hr',    'Hour',                  'TIME',           'min',  60.0,     0.0),
  -- Speed
  ('rpm',   'Revolutions per minute','SPEED',          'rpm',  1.0,      0.0),
  -- Dimensionless
  ('count', 'Count',                 'COUNT',          'count',1.0,      0.0),
  ('text',  'Free text',             'TEXT',           'text', 1.0,      0.0)
ON CONFLICT (unit_code) DO UPDATE
  SET display_name        = EXCLUDED.display_name,
      dimension           = EXCLUDED.dimension,
      canonical_unit      = EXCLUDED.canonical_unit,
      to_canonical_factor = EXCLUDED.to_canonical_factor,
      to_canonical_offset = EXCLUDED.to_canonical_offset;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. EQUIPMENT TEMPLATES  (Rule 1: Template-Instance)
--
--    The blueprint. Instances live in equipment_registry and are created by
--    deploying a template, never by hand-describing a device from scratch.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.equipment_templates (
  template_id        text PRIMARY KEY,
  display_name       text        NOT NULL,
  category           text        NOT NULL,

  -- Node type the WASM PowerMatrix engine switches on. Kept in lockstep with
  -- the enum in topology_engine/core/include/PowerMatrix.hpp.
  engine_type        text,

  manufacturer       text,
  model              text,

  -- Baseline physics copied onto each instance at deploy time, in canonical units.
  default_parameters jsonb       NOT NULL DEFAULT '{}'::jsonb,

  -- Bumped whenever the blueprint changes. Instances record the version they
  -- were deployed from, so a later spec correction is detectable rather than
  -- silently divergent.
  version            integer     NOT NULL DEFAULT 1,
  is_active          boolean     NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT equipment_templates_engine_type_check CHECK (
    engine_type IS NULL OR engine_type IN
      ('grid_tx','tco','main_db','ups','rectifier','cooling','server','generator')
  )
);

COMMENT ON TABLE public.equipment_templates IS
  'Blueprints. Never delete a template with live instances — supersede it by '
  'bumping version.';

-- The nine primitives. Physics baselines match the literals currently hardcoded
-- in public/topology_engine/renderer/engine.js, so Stage 2 instances inherit
-- exactly the values the simulation runs on today.
INSERT INTO public.equipment_templates
  (template_id, display_name, category, engine_type, manufacturer, model, default_parameters)
VALUES
  ('TPL_GRID_FEED',  'Utility Grid Feed',        'MAINS',        'grid_tx',   'ZESCO',   'HV Feed',
     '{"capacity": 750.0, "voltage": 11000.0, "current": 24.0}'::jsonb),
  ('TPL_GENSET_1MW', 'Diesel Generator 1MVA',    'GENERATOR',    'generator', 'Generic', 'DG-1000',
     '{"capacity": 1000.0, "voltage": 415.0, "kw_load": 0.0, "fuel_capacity_l": 2000.0}'::jsonb),
  ('TPL_GENSET_HQ',  'Standby Generator 1.5MVA', 'GENERATOR',    'generator', 'Generic', 'DG-1500',
     '{"capacity": 1500.0, "voltage": 415.0, "kw_load": 0.0, "fuel_capacity_l": 3000.0}'::jsonb),
  ('TPL_TCO',        'Triple Changeover Switch', 'SWITCHGEAR',   'tco',       'Generic', 'TCO-3P',
     '{"capacity": 2000.0, "voltage": 415.0}'::jsonb),
  ('TPL_DB',         'Distribution Board',       'SWITCHGEAR',   'main_db',   'Generic', 'DB-400',
     '{"capacity": 1000.0, "voltage": 415.0}'::jsonb),
  ('TPL_UPS_200',    'UPS 200kVA',               'UPS',          'ups',       'Vertiv',  'Liebert 200',
     '{"capacity": 200.0, "voltage": 415.0, "current": 0.0, "battery_minutes": 15.0}'::jsonb),
  ('TPL_RECT_5000',  'DC Rectifier 5000A',       'RECTIFIER',    'rectifier', 'NetSure', 'NS-5000',
     '{"capacity": 5000.0, "voltage": 54.2, "current": 0.0}'::jsonb),
  ('TPL_RACK',       'Equipment Rack 42U',       'IT_LOAD',      'server',    'Generic', '42U',
     '{"capacity": 10.0, "u_space": 42}'::jsonb),
  ('TPL_PAC',        'Precision Air Conditioner','AIRCON',       'cooling',   'Emerson', 'PAC-STD',
     '{"capacity": 30.0, "btu_hr": 102000.0}'::jsonb),
  -- engine_type NULL: drawn on the diagram, absent from the power cascade.
  ('TPL_FSS',        'Fire Suppression Unit',   'SAFETY',       NULL,        'Generic', 'FM-200',
     '{"agent_kg": 100.0}'::jsonb),
  -- ── Read but never simulated ──────────────────────────────────────────────
  -- A room sensor, a fuel ledger and a workstation are real equipment a
  -- technician records against, but they carry no power and have no place in a
  -- cascade. engine_type NULL is exactly that statement, and it is what lets one
  -- registry hold both the power model and the telemetry model.
  ('TPL_AMBIENT',    'Room Ambient Sensor',     'ENVIRONMENT',  NULL,        'Generic', 'TH-SENSOR',
     '{}'::jsonb),
  ('TPL_RECORD',     'Facility Record',         'FACILITY',     NULL,        'Generic', 'LOG',
     '{}'::jsonb),
  ('TPL_FUEL',       'Fuel Stock Record',       'FUEL',         NULL,        'Generic', 'TANK',
     '{}'::jsonb)
ON CONFLICT (template_id) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2b. THE INSTANCE SIDE OF RULE 1
--
--     equipment_registry rows become instances OF a template. Only the link
--     lives here — Stage 2 adds the topology columns (engine_type, ports,
--     provenance). Without this column the resolver in section 5 has nothing
--     to resolve through.
--
--     template_version records which revision an instance was deployed from,
--     so a later blueprint correction is detectable instead of silently
--     divergent. NULL template_id is allowed: existing equipment keeps working
--     un-templated until someone adopts it.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.equipment_registry
  ADD COLUMN IF NOT EXISTS template_id      text
    REFERENCES public.equipment_templates(template_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_version integer;

CREATE INDEX IF NOT EXISTS idx_equipment_registry_template
  ON public.equipment_registry (template_id)
  WHERE template_id IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. EQUIPMENT PARAMETERS — promoted to the schema registry
--
--    This is the table that removes V1's hardcoding. Today a new parameter
--    means editing a literal field list in a React component. After Stage 6 it
--    means inserting a row here.
--
--    A parameter is defined EITHER on a template (inherited by every instance)
--    OR on a single instance (an override or a one-off). Exactly one, enforced.
-- ═══════════════════════════════════════════════════════════════════════════

-- Template-level rows have no equipment_id.
ALTER TABLE public.equipment_parameters ALTER COLUMN equipment_id DROP NOT NULL;

ALTER TABLE public.equipment_parameters
  ADD COLUMN IF NOT EXISTS template_id   text
    REFERENCES public.equipment_templates(template_id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS min_value     double precision,
  ADD COLUMN IF NOT EXISTS max_value     double precision,
  ADD COLUMN IF NOT EXISTS is_required   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS display_order integer,
  ADD COLUMN IF NOT EXISTS input_type    text    NOT NULL DEFAULT 'number',
  ADD COLUMN IF NOT EXISTS options       jsonb,
  ADD COLUMN IF NOT EXISTS help_text     text,
  ADD COLUMN IF NOT EXISTS is_active     boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.equipment_parameters.template_id IS
  'Set for a template-level definition inherited by all instances. Mutually '
  'exclusive with equipment_id.';

-- Exactly one owner.
ALTER TABLE public.equipment_parameters
  DROP CONSTRAINT IF EXISTS equipment_parameters_one_owner;
ALTER TABLE public.equipment_parameters
  ADD CONSTRAINT equipment_parameters_one_owner
  CHECK (num_nonnulls(equipment_id, template_id) = 1);

-- Widget the form renderer should draw in Stage 6.
ALTER TABLE public.equipment_parameters
  DROP CONSTRAINT IF EXISTS equipment_parameters_input_type_check;
ALTER TABLE public.equipment_parameters
  ADD CONSTRAINT equipment_parameters_input_type_check
  CHECK (input_type IN ('number','text','boolean','select','time','date','textarea'));

-- Range must be coherent.
ALTER TABLE public.equipment_parameters
  DROP CONSTRAINT IF EXISTS equipment_parameters_range_check;
ALTER TABLE public.equipment_parameters
  ADD CONSTRAINT equipment_parameters_range_check
  CHECK (min_value IS NULL OR max_value IS NULL OR min_value <= max_value);

-- A 'select' parameter without options is a broken form field.
ALTER TABLE public.equipment_parameters
  DROP CONSTRAINT IF EXISTS equipment_parameters_select_options_check;
ALTER TABLE public.equipment_parameters
  ADD CONSTRAINT equipment_parameters_select_options_check
  CHECK (input_type <> 'select' OR jsonb_typeof(options) = 'array');

-- Tie `unit` to the registry. NOT VALID deliberately: existing rows may hold
-- free-text units that predate this table, and blocking the migration on legacy
-- data would be the wrong trade. New and updated rows are checked from now on.
-- To clean up later:  ALTER TABLE ... VALIDATE CONSTRAINT equipment_parameters_unit_fk;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'equipment_parameters_unit_fk'
  ) THEN
    ALTER TABLE public.equipment_parameters
      ADD CONSTRAINT equipment_parameters_unit_fk
      FOREIGN KEY (unit) REFERENCES public.unit_definitions(unit_code)
      NOT VALID;
  END IF;
END $$;

-- One definition of a given parameter name per owner.
CREATE UNIQUE INDEX IF NOT EXISTS uq_equipment_parameters_template_name
  ON public.equipment_parameters (template_id, parameter_name)
  WHERE template_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_equipment_parameters_equipment_name
  ON public.equipment_parameters (equipment_id, parameter_name)
  WHERE equipment_id IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. RLS
-- ═══════════════════════════════════════════════════════════════════════════

-- Reference data: readable by anyone signed in, writable by admins.
ALTER TABLE public.unit_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Units: authenticated read" ON public.unit_definitions;
CREATE POLICY "Units: authenticated read"
  ON public.unit_definitions FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Units: admin write" ON public.unit_definitions;
CREATE POLICY "Units: admin write"
  ON public.unit_definitions FOR ALL
  USING (public.get_my_role() = 'ADMIN')
  WITH CHECK (public.get_my_role() = 'ADMIN');

ALTER TABLE public.equipment_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Templates: authenticated read" ON public.equipment_templates;
CREATE POLICY "Templates: authenticated read"
  ON public.equipment_templates FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Templates: admin write" ON public.equipment_templates;
CREATE POLICY "Templates: admin write"
  ON public.equipment_templates FOR ALL
  USING (public.get_my_role() = 'ADMIN')
  WITH CHECK (public.get_my_role() = 'ADMIN');

-- ── equipment_parameters: two real problems with the deployed policies ────
--
-- (a) Every current policy scopes by equipment_id -> site. A template-level row
--     has equipment_id NULL, so it fails the IN (...) test and becomes INVISIBLE
--     to every user. Without this fix, section 3 above would appear to work and
--     then return nothing.
--
-- (b) There is no DELETE policy. Under RLS that means deny, so a mistyped
--     parameter definition could never be removed.
DROP POLICY IF EXISTS "Equipment params: site-scoped read" ON public.equipment_parameters;
CREATE POLICY "Equipment params: site-scoped read"
  ON public.equipment_parameters FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      template_id IS NOT NULL                       -- global reference data
      OR equipment_id IN (
        SELECT equipment_id FROM public.equipment_registry
         WHERE site_uuid = public.get_my_site_uuid())
    )
  );

DROP POLICY IF EXISTS "Equipment params: site-scoped insert" ON public.equipment_parameters;
CREATE POLICY "Equipment params: site-scoped insert"
  ON public.equipment_parameters FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND (
      (template_id IS NOT NULL AND public.get_my_role() = 'ADMIN')
      OR equipment_id IN (
        SELECT equipment_id FROM public.equipment_registry
         WHERE site_uuid = public.get_my_site_uuid())
    )
  );

DROP POLICY IF EXISTS "Equipment params: site-scoped update" ON public.equipment_parameters;
CREATE POLICY "Equipment params: site-scoped update"
  ON public.equipment_parameters FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND (
      (template_id IS NOT NULL AND public.get_my_role() = 'ADMIN')
      OR equipment_id IN (
        SELECT equipment_id FROM public.equipment_registry
         WHERE site_uuid = public.get_my_site_uuid())
    )
  )
  WITH CHECK (
    auth.role() = 'authenticated'
    AND (
      (template_id IS NOT NULL AND public.get_my_role() = 'ADMIN')
      OR equipment_id IN (
        SELECT equipment_id FROM public.equipment_registry
         WHERE site_uuid = public.get_my_site_uuid())
    )
  );

DROP POLICY IF EXISTS "Equipment params: admin delete" ON public.equipment_parameters;
CREATE POLICY "Equipment params: admin delete"
  ON public.equipment_parameters FOR DELETE
  USING (
    public.get_my_role() = 'ADMIN'
    AND (
      template_id IS NOT NULL
      OR equipment_id IN (
        SELECT equipment_id FROM public.equipment_registry
         WHERE site_uuid = public.get_my_site_uuid())
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. THE RESOLVER
--
--    Merges template-level definitions with instance-level overrides into the
--    single list a form should render. Stage 6's dynamic form calls exactly
--    this. Instance rows win over template rows of the same parameter_name.
--
--    SECURITY INVOKER is load-bearing: the function runs as the caller, so the
--    policies above still apply. Switching it to DEFINER would turn it into a
--    cross-site leak.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.resolve_equipment_parameters(p_equipment_id text)
RETURNS TABLE (
  parameter_name text,
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
    -- Instance-level definitions take precedence.
    SELECT p.*, 'INSTANCE'::text AS source, 1 AS precedence
      FROM public.equipment_parameters p
     WHERE p.equipment_id = p_equipment_id
       AND p.is_active

    UNION ALL

    -- Template-level definitions inherited by this instance.
    SELECT p.*, 'TEMPLATE'::text AS source, 2 AS precedence
      FROM public.equipment_parameters p
      JOIN inst i ON i.template_id = p.template_id
     WHERE p.template_id IS NOT NULL
       AND p.is_active
  ),
  deduped AS (
    SELECT DISTINCT ON (m.parameter_name) m.*
      FROM merged m
     ORDER BY m.parameter_name, m.precedence
  )
  SELECT d.parameter_name,
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
         d.is_constant,
         d.constant_value,
         d.is_graphable,
         d.source
    FROM deduped d
    LEFT JOIN public.unit_definitions u ON u.unit_code = d.unit
   ORDER BY d.display_order NULLS LAST, d.parameter_name;
$$;

COMMENT ON FUNCTION public.resolve_equipment_parameters(text) IS
  'Template definitions merged with instance overrides — the parameter list a '
  'form should render. SECURITY INVOKER; do not change.';

REVOKE ALL ON FUNCTION public.resolve_equipment_parameters(text) FROM public;
GRANT EXECUTE ON FUNCTION public.resolve_equipment_parameters(text) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. UNIT CONVERSION HELPER
--    Single implementation of the conversion contract, so the rule lives in one
--    place rather than being reimplemented in TypeScript, SQL and C++.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.to_canonical(p_value double precision, p_unit text)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
           WHEN p_value IS NULL THEN NULL
           ELSE (p_value * u.to_canonical_factor) + u.to_canonical_offset
         END
    FROM public.unit_definitions u
   WHERE u.unit_code = p_unit;
$$;

COMMENT ON FUNCTION public.to_canonical(double precision, text) IS
  'canonical = (raw * factor) + offset. Returns NULL for an unknown unit — '
  'callers must treat NULL as "unit not registered", not as zero.';

GRANT EXECUTE ON FUNCTION public.to_canonical(double precision, text) TO authenticated;

COMMIT;
