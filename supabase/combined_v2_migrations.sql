-- ==========================================
-- MIGRATION: 20260811_widen_category_constraint.sql
-- ==========================================
-- ═══════════════════════════════════════════════════════════════════════════
-- 20260811_widen_category_constraint.sql
-- DCIMe V2 — Stage 1 prerequisite
--
-- WHY THIS EXISTS
-- 20260625_reconcile_schema.sql pinned equipment_registry.category to five
-- values:  UPS, GENERATOR, MAINS, RECTIFIER, AIRCON.
--
-- That set is too narrow for the facility as actually modelled. V2 adds:
--     SWITCHGEAR  changeovers and distribution boards
--     IT_LOAD     server and telecom racks
--     SAFETY      fire suppression
--
-- It is also already violated by live data: the June seed in
-- 20260625_admin_wiring.sql inserts 'Power', 'Cooling', 'Network' and
-- 'Compute'. Any operation that revalidates the constraint therefore fails with
--     check constraint "equipment_registry_category_check" is violated by some row
-- which is what blocked 20260813_topology_graph.sql from applying.
--
-- THE FIX: widen the permitted set, and add it NOT VALID.
--
-- NOT VALID is deliberate, not laziness. It means:
--     - existing rows are grandfathered, whatever legacy value they hold
--     - every INSERT and UPDATE from now on IS checked
-- Blocking a schema migration on historical data entered eighteen months ago is
-- the wrong trade. Clean the legacy values when convenient, then run:
--     ALTER TABLE public.equipment_registry
--       VALIDATE CONSTRAINT equipment_registry_category_check;
--
-- Run this BEFORE 20260813_topology_graph.sql.
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── What is actually in the column right now ──────────────────────────────
-- Read this output. Anything outside the list below is legacy data that will
-- keep working but can never be re-saved through the UI until it is corrected.
DO $$
DECLARE r record; legacy text := '';
BEGIN
  FOR r IN
    SELECT category, count(*) AS n
      FROM public.equipment_registry
     WHERE category NOT IN ('UPS','GENERATOR','MAINS','RECTIFIER','AIRCON',
                            'SWITCHGEAR','IT_LOAD','SAFETY')
     GROUP BY category ORDER BY count(*) DESC
  LOOP
    legacy := legacy || format('%s (%s rows), ', r.category, r.n);
  END LOOP;

  IF legacy = '' THEN
    RAISE NOTICE 'category: no legacy values — the constraint can be VALIDATEd immediately.';
  ELSE
    RAISE NOTICE 'category: legacy values present, grandfathered by NOT VALID: %',
      rtrim(legacy, ', ');
  END IF;
END $$;

ALTER TABLE public.equipment_registry
  DROP CONSTRAINT IF EXISTS equipment_registry_category_check;

ALTER TABLE public.equipment_registry
  ADD CONSTRAINT equipment_registry_category_check
  CHECK (category IN (
    -- V1 vocabulary, unchanged
    'UPS', 'GENERATOR', 'MAINS', 'RECTIFIER', 'AIRCON',
    -- V2 additions
    'SWITCHGEAR',  -- changeovers, distribution boards, the paralleling bus
    'IT_LOAD',     -- server and telecom racks
    'SAFETY'       -- fire suppression: drawn on the diagram, never simulated
  ))
  NOT VALID;

COMMENT ON CONSTRAINT equipment_registry_category_check ON public.equipment_registry IS
  'NOT VALID: pre-2026 rows may hold legacy values (Power, Cooling, Network, '
  'Compute). New and updated rows are checked. VALIDATE once those are cleaned.';

COMMIT;


-- ==========================================
-- MIGRATION: 20260812_reference_layer.sql
-- ==========================================
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


-- ==========================================
-- MIGRATION: 20260813_topology_graph.sql
-- ==========================================
-- ═══════════════════════════════════════════════════════════════════════════
-- 20260813_topology_graph.sql
-- DCIMe V2 — Stage 2: topology as data
--
-- Turns equipment_registry + equipment_connections into a real, queryable
-- power graph. These tables already exist and already carry site-scoped RLS —
-- this extends them rather than introducing a parallel model, because two
-- sources of truth for one physical facility is the failure this architecture
-- exists to prevent.
--
-- Depends on: 20260812_reference_layer.sql (templates, units, template_id link)
--
-- NO BEHAVIOUR CHANGE. engine.js still runs off its hardcoded literals until
-- Stage 3. Nothing here alters what the app currently does.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. NODES — equipment_registry gains its physics columns
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.equipment_registry
  ADD COLUMN IF NOT EXISTS engine_type        text,
  ADD COLUMN IF NOT EXISTS dynamic_parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS input_policy       text  NOT NULL DEFAULT 'ANY',
  ADD COLUMN IF NOT EXISTS provenance         text  NOT NULL DEFAULT 'MANUAL';

-- ── Category vocabulary, widened for the equipment V2 models ──────────────
-- 20260625_reconcile_schema.sql restricted category to
--   UPS | GENERATOR | MAINS | RECTIFIER | AIRCON
-- which covered every asset V1 tracked. The topology graph introduces three
-- kinds V1 had no concept of:
--   SWITCHGEAR  changeovers, distribution boards, the paralleling busbar
--   IT_LOAD     server and telecom racks — the PUE denominator
--   SAFETY      fire suppression: drawn on the diagram, absent from the physics
-- NOT VALID is deliberate and load-bearing.
--
-- A plain ADD CONSTRAINT validates every existing row, and live registries
-- carry equipment predating the vocabulary — categories such as 'Power',
-- 'Cooling', 'Network' and 'Compute' seeded by 20260625_admin_wiring.sql before
-- 20260625_reconcile_schema.sql narrowed the list. Validating on the way in
-- would abort this migration over data it was never meant to police.
--
-- NOT VALID enforces the vocabulary on every INSERT and UPDATE from now on
-- while leaving history alone — so the seeds below are still fully checked.
--
-- To find what does not conform:
--   SELECT category, count(*) FROM public.equipment_registry
--    WHERE category <> ALL (ARRAY['UPS','GENERATOR','MAINS','RECTIFIER',
--                                 'AIRCON','SWITCHGEAR','IT_LOAD','SAFETY'])
--    GROUP BY category;
--
-- Once those rows are re-categorised, promote the constraint with:
--   ALTER TABLE public.equipment_registry
--     VALIDATE CONSTRAINT equipment_registry_category_check;
ALTER TABLE public.equipment_registry
  DROP CONSTRAINT IF EXISTS equipment_registry_category_check;
ALTER TABLE public.equipment_registry
  ADD CONSTRAINT equipment_registry_category_check CHECK (
    category = ANY (ARRAY[
      'UPS'::text, 'GENERATOR'::text, 'MAINS'::text, 'RECTIFIER'::text, 'AIRCON'::text,
      'SWITCHGEAR'::text, 'IT_LOAD'::text, 'SAFETY'::text
    ])
  ) NOT VALID;

COMMENT ON COLUMN public.equipment_registry.engine_type IS
  'Node type the WASM PowerMatrix engine switches on. NULL = inventory-only '
  'asset, excluded from simulation. Denormalised from the template so the '
  'graph query stays a single-table read.';

COMMENT ON COLUMN public.equipment_registry.dynamic_parameters IS
  'Per-instance physics in canonical units (see unit_definitions). Schemaless '
  'for extensibility, but NOT untyped - see the numeric CHECK below.';

-- Same enum as equipment_templates, kept in lockstep with PowerMatrix.hpp.
ALTER TABLE public.equipment_registry
  DROP CONSTRAINT IF EXISTS equipment_registry_engine_type_check;
ALTER TABLE public.equipment_registry
  ADD CONSTRAINT equipment_registry_engine_type_check CHECK (
    engine_type IS NULL OR engine_type IN
      ('grid_tx','tco','main_db','ups','rectifier','cooling','server','generator')
  );

-- ── input_policy: what makes this a real engine rather than a diagram ─────
--
--   ANY      energised if ANY upstream input is live.  A/B feeds, dual-corded
--            racks. THE DEFAULT, and the one that makes redundancy behave.
--   ALL      needs every input live. Series chains.
--   PRIORITY takes the highest-priority live input - which is precisely what a
--            changeover switch does. Ordering comes from input_priority on the
--            edge (grid = 1, generator = 2).
--
-- Without this, a naive traversal says "parent dead -> child dead", which would
-- black out the load whenever one UPS trips - the opposite of what redundancy
-- means.
ALTER TABLE public.equipment_registry
  DROP CONSTRAINT IF EXISTS equipment_registry_input_policy_check;
ALTER TABLE public.equipment_registry
  ADD CONSTRAINT equipment_registry_input_policy_check
  CHECK (input_policy IN ('ANY','ALL','PRIORITY'));

ALTER TABLE public.equipment_registry
  DROP CONSTRAINT IF EXISTS equipment_registry_provenance_check;
ALTER TABLE public.equipment_registry
  ADD CONSTRAINT equipment_registry_provenance_check
  CHECK (provenance IN ('MANUAL','IMPORT','BMS','DISCOVERED'));

-- ── Rule 2 vs section 6.2, resolved in the database ──────────────────────
-- The V2 doc wants schemaless JSONB (Rule 2) AND a strict typed contract for
-- C++ (6.2). Those cancel out unless types are enforced on write: a technician
-- entering "400" (string) where the engine expects 400.0 (float) would crash
-- the WASM module at parse time. This constraint costs nothing and makes that
-- class of crash unreachable.
ALTER TABLE public.equipment_registry
  DROP CONSTRAINT IF EXISTS equipment_registry_params_numeric_check;
ALTER TABLE public.equipment_registry
  ADD CONSTRAINT equipment_registry_params_numeric_check CHECK (
        (NOT dynamic_parameters ? 'capacity' OR jsonb_typeof(dynamic_parameters->'capacity') = 'number')
    AND (NOT dynamic_parameters ? 'voltage'  OR jsonb_typeof(dynamic_parameters->'voltage')  = 'number')
    AND (NOT dynamic_parameters ? 'current'  OR jsonb_typeof(dynamic_parameters->'current')  = 'number')
    AND (NOT dynamic_parameters ? 'kw_load'  OR jsonb_typeof(dynamic_parameters->'kw_load')  = 'number')
  );

CREATE INDEX IF NOT EXISTS idx_equipment_registry_site_engine
  ON public.equipment_registry (site_uuid, engine_type)
  WHERE engine_type IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. EDGES — equipment_connections becomes port-to-port
--
--    DIRECTION CONVENTION, FIXED HERE FOR ALL TIME:
--        source = upstream / feeder        target = downstream / load
--    Power flows source -> target; a cascade is a forward traversal.
--
--    engine.js currently stores the inverse (directFeederMap is child -> parents).
--    The Stage 2 seed flips it. Do not flip it back - inconsistent edge
--    direction is a bug you chase for weeks.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.equipment_connections
  ADD COLUMN IF NOT EXISTS source_port     text NOT NULL DEFAULT 'OUT',
  ADD COLUMN IF NOT EXISTS target_port     text NOT NULL DEFAULT 'IN',

  -- Ordering for a PRIORITY-policy target. Lower wins.
  ADD COLUMN IF NOT EXISTS input_priority  integer NOT NULL DEFAULT 1,

  -- SVG path id in the renderer, so a database-driven graph can still
  -- highlight the correct cable. Presentation concern, deliberately kept out
  -- of the physics payload.
  ADD COLUMN IF NOT EXISTS render_path_id  text,

  -- ── The Ecosystem firewall (V2 doc, Part 2.D) ────────────────────────────
  -- The doc declares Ecosystem -> Infrastructure forbidden but describes no
  -- mechanism; both paths would hit the same endpoint with a different token.
  -- This column is the mechanism. BMS-asserted topology lands as 'BMS' and is
  -- excluded from the authoritative graph until a human promotes it. When the
  -- BMS arrives, nothing needs redesigning.
  ADD COLUMN IF NOT EXISTS provenance      text NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS created_by      uuid,
  ADD COLUMN IF NOT EXISTS updated_at      timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.equipment_connections
  DROP CONSTRAINT IF EXISTS equipment_connections_provenance_check;
ALTER TABLE public.equipment_connections
  ADD CONSTRAINT equipment_connections_provenance_check
  CHECK (provenance IN ('MANUAL','IMPORT','BMS','DISCOVERED'));

-- A cable cannot connect a device to itself.
ALTER TABLE public.equipment_connections
  DROP CONSTRAINT IF EXISTS equipment_connections_no_self_loop;
ALTER TABLE public.equipment_connections
  ADD CONSTRAINT equipment_connections_no_self_loop
  CHECK (source_equipment_id <> target_equipment_id);

-- One physical cable per port pair. Prevents the duplicate-edge corruption
-- that silently doubles load in a reverse-pass calculation.
CREATE UNIQUE INDEX IF NOT EXISTS uq_equipment_connections_ports
  ON public.equipment_connections
     (source_equipment_id, source_port, target_equipment_id, target_port);

CREATE INDEX IF NOT EXISTS idx_equipment_connections_source
  ON public.equipment_connections (source_equipment_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_equipment_connections_target
  ON public.equipment_connections (target_equipment_id) WHERE is_active;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. GRAPH VALIDATION
--    A malformed graph produces confident nonsense rather than an error. This
--    view surfaces the failure modes cheaply. Show it on the admin screen
--    before anyone trusts a simulation, and assert zero rows in CI.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.topology_graph_issues AS
  -- Simulated nodes with no feeder that are not legitimate sources
  SELECT e.site_uuid,
         e.equipment_id,
         'ORPHAN'::text AS issue,
         'Simulated node has no upstream feeder'::text AS detail
    FROM public.equipment_registry e
   WHERE e.engine_type IS NOT NULL
     AND e.engine_type NOT IN ('grid_tx','generator')
     AND NOT EXISTS (
           SELECT 1 FROM public.equipment_connections c
            WHERE c.target_equipment_id = e.equipment_id AND c.is_active)

  UNION ALL

  -- Edges crossing a site boundary: always a data-entry error
  SELECT src.site_uuid,
         c.source_equipment_id,
         'CROSS_SITE'::text,
         'Edge connects equipment in two different sites'::text
    FROM public.equipment_connections c
    JOIN public.equipment_registry src ON src.equipment_id = c.source_equipment_id
    JOIN public.equipment_registry tgt ON tgt.equipment_id = c.target_equipment_id
   WHERE src.site_uuid IS DISTINCT FROM tgt.site_uuid

  UNION ALL

  -- PRIORITY-policy nodes whose inputs do not have distinct priorities:
  -- the changeover order would be arbitrary.
  SELECT e.site_uuid,
         e.equipment_id,
         'AMBIGUOUS_PRIORITY'::text,
         'PRIORITY node has inputs sharing an input_priority'::text
    FROM public.equipment_registry e
   WHERE e.input_policy = 'PRIORITY'
     AND EXISTS (
           SELECT 1 FROM public.equipment_connections c
            WHERE c.target_equipment_id = e.equipment_id AND c.is_active
            GROUP BY c.input_priority
           HAVING count(*) > 1);

COMMENT ON VIEW public.topology_graph_issues IS
  'Graph integrity check. Must return zero rows for a site before its '
  'simulation output is trustworthy.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. RLS REPAIRS
--
--    Two genuine holes in the deployed policy set:
--
--    (a) equipment_connections has SELECT and INSERT policies but NO UPDATE
--        and NO DELETE. With RLS enabled and no policy, those are denied by
--        default - a miswired cable can never be corrected or removed by
--        anyone. The Stage 10 topology editor is impossible until this is fixed.
--
--    (b) The SELECT policy checks only source_equipment_id. An edge whose
--        source is in your site but whose target is not leaks the existence of
--        foreign equipment ids. Narrow, but free to close.
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Equipment connections: site-scoped read" ON public.equipment_connections;
CREATE POLICY "Equipment connections: site-scoped read"
  ON public.equipment_connections FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND source_equipment_id IN (
      SELECT equipment_id FROM public.equipment_registry
       WHERE site_uuid = public.get_my_site_uuid())
    AND target_equipment_id IN (
      SELECT equipment_id FROM public.equipment_registry
       WHERE site_uuid = public.get_my_site_uuid())
  );

DROP POLICY IF EXISTS "Equipment connections: admin update" ON public.equipment_connections;
CREATE POLICY "Equipment connections: admin update"
  ON public.equipment_connections FOR UPDATE
  USING (
    public.get_my_role() = 'ADMIN'
    AND source_equipment_id IN (
      SELECT equipment_id FROM public.equipment_registry
       WHERE site_uuid = public.get_my_site_uuid())
  )
  WITH CHECK (
    public.get_my_role() = 'ADMIN'
    AND source_equipment_id IN (
      SELECT equipment_id FROM public.equipment_registry
       WHERE site_uuid = public.get_my_site_uuid())
    AND target_equipment_id IN (
      SELECT equipment_id FROM public.equipment_registry
       WHERE site_uuid = public.get_my_site_uuid())
  );

DROP POLICY IF EXISTS "Equipment connections: admin delete" ON public.equipment_connections;
CREATE POLICY "Equipment connections: admin delete"
  ON public.equipment_connections FOR DELETE
  USING (
    public.get_my_role() = 'ADMIN'
    AND source_equipment_id IN (
      SELECT equipment_id FROM public.equipment_registry
       WHERE site_uuid = public.get_my_site_uuid())
  );

-- equipment_registry has no DELETE policy either - same class of gap.
DROP POLICY IF EXISTS "Equipment: admin delete" ON public.equipment_registry;
CREATE POLICY "Equipment: admin delete"
  ON public.equipment_registry FOR DELETE
  USING (
    public.get_my_role() = 'ADMIN'
    AND site_uuid = public.get_my_site_uuid()
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. THE API CONTRACT  (V2 doc, section 6.2 - expressed as SQL, not prose)
--
--    Returns exactly the payload the WASM engine consumes. This function IS
--    the contract: if it runs and the engine accepts its output, the contract
--    holds. No drift possible between a document and the code.
--
--    SECURITY INVOKER is load-bearing. The function runs as the calling user,
--    so every policy above still applies. Switching it to SECURITY DEFINER
--    would silently turn it into a cross-site data leak.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_topology_graph(p_site_uuid uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH target_site AS (
    SELECT COALESCE(p_site_uuid, public.get_my_site_uuid()) AS id
  ),
  graph_nodes AS (
    SELECT e.equipment_id, e.engine_type, e.name, e.category, e.room_id,
           e.is_active, e.input_policy, e.dynamic_parameters, e.sort_order
      FROM public.equipment_registry e, target_site s
     WHERE e.site_uuid = s.id
       AND e.engine_type IS NOT NULL
  ),
  graph_edges AS (
    SELECT c.source_equipment_id, c.source_port,
           c.target_equipment_id, c.target_port,
           c.input_priority, c.connection_type, c.render_path_id
      FROM public.equipment_connections c
     WHERE c.is_active
       -- Only authoritative topology reaches the physics engine. BMS-asserted
       -- edges stay quarantined until promoted - the Ecosystem firewall doing
       -- actual work rather than being a line in a diagram.
       AND c.provenance IN ('MANUAL','IMPORT')
       AND c.source_equipment_id IN (SELECT equipment_id FROM graph_nodes)
       AND c.target_equipment_id IN (SELECT equipment_id FROM graph_nodes)
  )
  SELECT jsonb_build_object(
    'site_uuid',    (SELECT id FROM target_site),
    'generated_at', now(),
    'nodes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id',           n.equipment_id,
               'type',         n.engine_type,
               'name',         COALESCE(n.name, n.equipment_id),
               'category',     n.category,
               'room_id',      n.room_id,
               'is_active',    COALESCE(n.is_active, true),
               'input_policy', n.input_policy,
               -- The engine expects numbers, never null. Defaults are applied
               -- here so the C++ side never branches on a missing key.
               'capacity', COALESCE((n.dynamic_parameters->>'capacity')::double precision, 0.0),
               'voltage',  COALESCE((n.dynamic_parameters->>'voltage')::double precision,  0.0),
               'current',  COALESCE((n.dynamic_parameters->>'current')::double precision,  0.0),
               'kw_load',  COALESCE((n.dynamic_parameters->>'kw_load')::double precision,  0.0)
             ) ORDER BY n.sort_order NULLS LAST, n.equipment_id)
        FROM graph_nodes n), '[]'::jsonb),
    'edges', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'source',         g.source_equipment_id,
               'source_port',    g.source_port,
               'target',         g.target_equipment_id,
               'target_port',    g.target_port,
               'priority',       g.input_priority,
               'type',           COALESCE(g.connection_type, 'POWER'),
               'render_path_id', g.render_path_id
             ) ORDER BY g.source_equipment_id, g.target_equipment_id)
        FROM graph_edges g), '[]'::jsonb)
  );
$$;

COMMENT ON FUNCTION public.get_topology_graph(uuid) IS
  'The topology API contract: {nodes[], edges[]} for the WASM engine. '
  'SECURITY INVOKER - do not change; RLS enforcement depends on it.';

REVOKE ALL ON FUNCTION public.get_topology_graph(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_topology_graph(uuid) TO authenticated;

COMMIT;


-- ==========================================
-- MIGRATION: 20260814_topology_layout.sql
-- ==========================================
-- ═══════════════════════════════════════════════════════════════════════════
-- 20260814_topology_layout.sql
-- DCIMe V2 — Stage 3a: the drawing moves into the database
--
-- WHY THIS EXISTS
-- The SVG in public/topology_engine/renderer/index.html is entirely hand-authored:
-- 49 <g transform="translate(x,y)"> groups and 52 hand-routed cable paths.
-- engine.js creates no SVG at all — it only recolours markup that already exists.
-- So making the ENGINE data-driven would have changed the simulation while
-- drawing nothing new, and "add equipment and watch it appear" would have failed
-- in front of an audience.
--
-- THE DESIGN: store the drawing, never compute it.
--   layout_x / layout_y   node position, lifted from the existing transforms
--   render_shape          which isometric cube face to draw
--   render_path_d         the hand-routed SVG path, lifted verbatim
--
-- A power single-line has a meaningful, human-authored arrangement. Auto-layout
-- and auto-routing would both look worse than what is already drawn, and would
-- throw away information (a technician recognises this diagram). The database
-- therefore holds geometry as data, not a layout algorithm.
--
-- Depends on: 20260813_topology_graph.sql
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. NODE GEOMETRY
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.equipment_registry
  ADD COLUMN IF NOT EXISTS layout_x      double precision,
  ADD COLUMN IF NOT EXISTS layout_y      double precision,
  ADD COLUMN IF NOT EXISTS render_shape  text,
  -- Some equipment is drawn as a line rather than a cube. The generator
  -- paralleling bus is a horizontal busbar, not a box; storing its path here
  -- keeps geometry symmetric with equipment_connections instead of forcing a
  -- busbar to masquerade as an edge.
  ADD COLUMN IF NOT EXISTS render_path_d text;

COMMENT ON COLUMN public.equipment_registry.layout_x IS
  'X in the topology SVG user-coordinate space. NULL = not drawn. The Stage 10 '
  'editor sets this by dragging.';

COMMENT ON COLUMN public.equipment_registry.render_shape IS
  'Isometric cube face variant: transformer|generator|tco|db|ups|rectifier|'
  'server|aircon|fss. Stored rather than derived from engine_type, because '
  'decorative equipment (fire suppression) has no engine_type but is still drawn.';

ALTER TABLE public.equipment_registry
  DROP CONSTRAINT IF EXISTS equipment_registry_render_shape_check;
ALTER TABLE public.equipment_registry
  ADD CONSTRAINT equipment_registry_render_shape_check CHECK (
    render_shape IS NULL OR render_shape IN
      ('transformer','generator','tco','db','ups','rectifier','server','aircon','fss','bus')
  );

-- Both coordinates or neither. A node with only one is a drawing bug that would
-- otherwise render at an arbitrary position.
ALTER TABLE public.equipment_registry
  DROP CONSTRAINT IF EXISTS equipment_registry_layout_pair_check;
ALTER TABLE public.equipment_registry
  ADD CONSTRAINT equipment_registry_layout_pair_check CHECK (
    num_nonnulls(layout_x, layout_y) <> 1
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. CABLE GEOMETRY
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.equipment_connections
  ADD COLUMN IF NOT EXISTS render_path_d text;

COMMENT ON COLUMN public.equipment_connections.render_path_d IS
  'SVG path "d" attribute, hand-routed. NULL means the renderer falls back to a '
  'straight line between the two node positions — correct for a newly drawn '
  'cable, and refined later in the editor.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. THE CONTRACT, WIDENED
--
--    Two audiences, one payload:
--      the RENDERER needs every node that should be drawn
--      the ENGINE   needs only the nodes it simulates
--
--    Previously this function returned only engine_type IS NOT NULL, which would
--    have silently dropped decorative equipment (the FM-200 fire suppression
--    unit) from the drawing. Now it returns everything with a `simulated` flag,
--    and the caller filters: renderer draws all, engine loads simulated only.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_topology_graph(p_site_uuid uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH target_site AS (
    SELECT COALESCE(p_site_uuid, public.get_my_site_uuid()) AS id
  ),
  graph_nodes AS (
    SELECT e.equipment_id, e.engine_type, e.name, e.category, e.room_id,
           e.is_active, e.input_policy, e.dynamic_parameters, e.sort_order,
           e.layout_x, e.layout_y, e.render_shape
      FROM public.equipment_registry e, target_site s
     WHERE e.site_uuid = s.id
       -- Drawn OR simulated. A row that is neither is pure inventory and has no
       -- business in a topology payload.
       AND (e.engine_type IS NOT NULL OR e.layout_x IS NOT NULL)
  ),
  graph_edges AS (
    SELECT c.source_equipment_id, c.source_port,
           c.target_equipment_id, c.target_port,
           c.input_priority, c.connection_type,
           c.render_path_id, c.render_path_d
      FROM public.equipment_connections c
     WHERE c.is_active
       -- Only authoritative topology reaches the engine. BMS-asserted edges stay
       -- quarantined until a human promotes them.
       AND c.provenance IN ('MANUAL','IMPORT')
       AND c.source_equipment_id IN (SELECT equipment_id FROM graph_nodes)
       AND c.target_equipment_id IN (SELECT equipment_id FROM graph_nodes)
  )
  SELECT jsonb_build_object(
    'site_uuid',    (SELECT id FROM target_site),
    'generated_at', now(),
    'nodes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id',           n.equipment_id,
               'type',         n.engine_type,
               'name',         COALESCE(n.name, n.equipment_id),
               'category',     n.category,
               'room_id',      n.room_id,
               'is_active',    COALESCE(n.is_active, true),
               'input_policy', n.input_policy,
               -- false = draw it, but keep it out of the physics
               'simulated',    (n.engine_type IS NOT NULL),
               'shape',        n.render_shape,
               'x',            n.layout_x,
               'y',            n.layout_y,
               -- The engine expects numbers, never null, so the C++ side never
               -- has to branch on a missing key.
               'capacity', COALESCE((n.dynamic_parameters->>'capacity')::double precision, 0.0),
               'voltage',  COALESCE((n.dynamic_parameters->>'voltage')::double precision,  0.0),
               'current',  COALESCE((n.dynamic_parameters->>'current')::double precision,  0.0),
               'kw_load',  COALESCE((n.dynamic_parameters->>'kw_load')::double precision,  0.0)
             ) ORDER BY n.sort_order NULLS LAST, n.equipment_id)
        FROM graph_nodes n), '[]'::jsonb),
    'edges', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'source',         g.source_equipment_id,
               'source_port',    g.source_port,
               'target',         g.target_equipment_id,
               'target_port',    g.target_port,
               'priority',       g.input_priority,
               'type',           COALESCE(g.connection_type, 'POWER'),
               'render_path_id', g.render_path_id,
               'd',              g.render_path_d
             ) ORDER BY g.source_equipment_id, g.target_equipment_id)
        FROM graph_edges g), '[]'::jsonb)
  );
$$;

COMMENT ON FUNCTION public.get_topology_graph(uuid) IS
  'The topology API contract: {nodes[], edges[]} for both the renderer and the '
  'WASM engine. Nodes carry `simulated` — renderer draws all, engine loads only '
  'simulated. SECURITY INVOKER; do not change.';

REVOKE ALL ON FUNCTION public.get_topology_graph(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_topology_graph(uuid) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. DRAWING INTEGRITY
--    Extends topology_graph_issues with the failure modes that only exist once
--    geometry is data: a simulated node nobody can see, and two nodes stacked
--    on the same coordinates.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.topology_graph_issues AS
  SELECT e.site_uuid, e.equipment_id, 'ORPHAN'::text AS issue,
         'Simulated node has no upstream feeder'::text AS detail
    FROM public.equipment_registry e
   WHERE e.engine_type IS NOT NULL
     AND e.engine_type NOT IN ('grid_tx','generator')
     AND NOT EXISTS (SELECT 1 FROM public.equipment_connections c
                      WHERE c.target_equipment_id = e.equipment_id AND c.is_active)

  UNION ALL

  SELECT src.site_uuid, c.source_equipment_id, 'CROSS_SITE'::text,
         'Edge connects equipment in two different sites'::text
    FROM public.equipment_connections c
    JOIN public.equipment_registry src ON src.equipment_id = c.source_equipment_id
    JOIN public.equipment_registry tgt ON tgt.equipment_id = c.target_equipment_id
   WHERE src.site_uuid IS DISTINCT FROM tgt.site_uuid

  UNION ALL

  SELECT e.site_uuid, e.equipment_id, 'AMBIGUOUS_PRIORITY'::text,
         'PRIORITY node has inputs sharing an input_priority'::text
    FROM public.equipment_registry e
   WHERE e.input_policy = 'PRIORITY'
     AND EXISTS (SELECT 1 FROM public.equipment_connections c
                  WHERE c.target_equipment_id = e.equipment_id AND c.is_active
                  GROUP BY c.input_priority HAVING count(*) > 1)

  UNION ALL

  -- Simulated but invisible: the node participates in cascades an operator can
  -- never see on screen.
  SELECT e.site_uuid, e.equipment_id, 'NOT_DRAWN'::text,
         'Simulated node has no layout coordinates'::text
    FROM public.equipment_registry e
   WHERE e.engine_type IS NOT NULL
     AND e.layout_x IS NULL

  UNION ALL

  -- Two nodes at identical coordinates: one is hidden behind the other.
  SELECT e.site_uuid, e.equipment_id, 'OVERLAPPING'::text,
         'Another node occupies the same coordinates'::text
    FROM public.equipment_registry e
   WHERE e.layout_x IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.equipment_registry o
                  WHERE o.site_uuid = e.site_uuid
                    AND o.equipment_id <> e.equipment_id
                    AND o.layout_x = e.layout_x AND o.layout_y = e.layout_y);

COMMIT;


-- ==========================================
-- MIGRATION: 20260816_parameter_registry.sql
-- ==========================================
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


-- ==========================================
-- MIGRATION: 20260816_room_geometry.sql
-- ==========================================
-- ═══════════════════════════════════════════════════════════════════════════
-- 20260816_room_geometry.sql
-- DCIMe V2 — Stage 3c: rooms become spatial
--
-- WHY THIS EXISTS
-- The old renderer draws 7 translucent floor plates — THE SERVER ROOM, POWER
-- ROOM 1, EXTERIOR YARD — that tell an operator WHERE they are looking. They
-- are the ground plane the equipment sits on.
--
-- The Stage 3 extraction missed them: it looked for elements carrying an `id`
-- or a `data-path-id`, and the plates are bare <rect> elements with inline
-- styling and neither. So the React canvas draws equipment floating in a void.
--
-- These could have been dumped in as raw SVG, but a room is a real thing in
-- this system — it already has a row, and equipment already references it. So
-- geometry goes on that row, and a room becomes as editable as anything else.
--
-- Depends on: 20260814_topology_layout.sql
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS layout_x      double precision,
  ADD COLUMN IF NOT EXISTS layout_y      double precision,
  ADD COLUMN IF NOT EXISTS layout_w      double precision,
  ADD COLUMN IF NOT EXISTS layout_h      double precision,
  -- Display name on the plate. Deliberately separate from room_name: the
  -- drawing says "THE SERVER ROOM" while the record says "Server Room", and
  -- both are correct for their audience.
  ADD COLUMN IF NOT EXISTS layout_label  text,
  ADD COLUMN IF NOT EXISTS label_x       double precision,
  ADD COLUMN IF NOT EXISTS label_y       double precision,
  ADD COLUMN IF NOT EXISTS label_size    integer,
  -- Faint wash distinguishing zones. Two rooms in the source drawing are
  -- tinted (green for Power Room 1, cyan for Power Room 2); the rest are
  -- neutral white at 1% opacity.
  ADD COLUMN IF NOT EXISTS layout_tint   text;

COMMENT ON COLUMN public.rooms.layout_x IS
  'Floor plate origin in topology SVG user units. NULL = room not drawn.';

-- All four or none: a plate with a width but no height is a drawing bug that
-- would render as an invisible zero-area rectangle.
ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_layout_complete_check;
ALTER TABLE public.rooms
  ADD CONSTRAINT rooms_layout_complete_check CHECK (
    num_nonnulls(layout_x, layout_y, layout_w, layout_h) IN (0, 4)
  );

ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_layout_positive_check;
ALTER TABLE public.rooms
  ADD CONSTRAINT rooms_layout_positive_check CHECK (
    (layout_w IS NULL OR layout_w > 0) AND (layout_h IS NULL OR layout_h > 0)
  );

-- ── Rooms need to reach the client ────────────────────────────────────────
-- The deployed policy set gives rooms a SELECT policy but no write policies,
-- so under RLS an admin cannot reposition one. The Stage 10 editor needs this;
-- same gap as equipment_connections had.
DROP POLICY IF EXISTS "Rooms: admin insert" ON public.rooms;
CREATE POLICY "Rooms: admin insert"
  ON public.rooms FOR INSERT
  WITH CHECK (public.get_my_role() = 'ADMIN' AND site_id = public.get_my_site_uuid());

DROP POLICY IF EXISTS "Rooms: admin update" ON public.rooms;
CREATE POLICY "Rooms: admin update"
  ON public.rooms FOR UPDATE
  USING (public.get_my_role() = 'ADMIN' AND site_id = public.get_my_site_uuid())
  WITH CHECK (public.get_my_role() = 'ADMIN' AND site_id = public.get_my_site_uuid());

DROP POLICY IF EXISTS "Rooms: admin delete" ON public.rooms;
CREATE POLICY "Rooms: admin delete"
  ON public.rooms FOR DELETE
  USING (public.get_my_role() = 'ADMIN' AND site_id = public.get_my_site_uuid());


-- ═══════════════════════════════════════════════════════════════════════════
-- The contract carries rooms alongside nodes and edges
--
-- One request returns everything needed to draw the facility. The renderer
-- paints rooms first, then cables, then equipment — back to front.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_topology_graph(p_site_uuid uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH target_site AS (
    SELECT COALESCE(p_site_uuid, public.get_my_site_uuid()) AS id
  ),
  graph_rooms AS (
    SELECT r.id, r.room_name, r.layout_x, r.layout_y, r.layout_w, r.layout_h,
           r.layout_label, r.label_x, r.label_y, r.label_size, r.layout_tint,
           r.sort_order
      FROM public.rooms r, target_site s
     WHERE r.site_id = s.id
       AND r.layout_x IS NOT NULL
  ),
  graph_nodes AS (
    SELECT e.equipment_id, e.engine_type, e.name, e.category, e.room_id,
           e.is_active, e.input_policy, e.dynamic_parameters, e.sort_order,
           e.layout_x, e.layout_y, e.render_shape
      FROM public.equipment_registry e, target_site s
     WHERE e.site_uuid = s.id
       AND (e.engine_type IS NOT NULL OR e.layout_x IS NOT NULL)
  ),
  graph_edges AS (
    SELECT c.source_equipment_id, c.source_port,
           c.target_equipment_id, c.target_port,
           c.input_priority, c.connection_type,
           c.render_path_id, c.render_path_d
      FROM public.equipment_connections c
     WHERE c.is_active
       AND c.provenance IN ('MANUAL','IMPORT')
       AND c.source_equipment_id IN (SELECT equipment_id FROM graph_nodes)
       AND c.target_equipment_id IN (SELECT equipment_id FROM graph_nodes)
  )
  SELECT jsonb_build_object(
    'site_uuid',    (SELECT id FROM target_site),
    'generated_at', now(),
    'rooms', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id',    r.id,
               'name',  r.room_name,
               'label', COALESCE(r.layout_label, upper(r.room_name)),
               'x',     r.layout_x,
               'y',     r.layout_y,
               'w',     r.layout_w,
               'h',     r.layout_h,
               'label_x', COALESCE(r.label_x, r.layout_x + 30),
               'label_y', COALESCE(r.label_y, r.layout_y + 60),
               'label_size', COALESCE(r.label_size, 28),
               'tint',  r.layout_tint
             ) ORDER BY r.sort_order NULLS LAST, r.room_name)
        FROM graph_rooms r), '[]'::jsonb),
    'nodes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id',           n.equipment_id,
               'type',         n.engine_type,
               'name',         COALESCE(n.name, n.equipment_id),
               'category',     n.category,
               'room_id',      n.room_id,
               'is_active',    COALESCE(n.is_active, true),
               'input_policy', n.input_policy,
               'simulated',    (n.engine_type IS NOT NULL),
               'shape',        n.render_shape,
               'x',            n.layout_x,
               'y',            n.layout_y,
               'capacity', COALESCE((n.dynamic_parameters->>'capacity')::double precision, 0.0),
               'voltage',  COALESCE((n.dynamic_parameters->>'voltage')::double precision,  0.0),
               'current',  COALESCE((n.dynamic_parameters->>'current')::double precision,  0.0),
               'kw_load',  COALESCE((n.dynamic_parameters->>'kw_load')::double precision,  0.0)
             ) ORDER BY n.sort_order NULLS LAST, n.equipment_id)
        FROM graph_nodes n), '[]'::jsonb),
    'edges', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'source',         g.source_equipment_id,
               'source_port',    g.source_port,
               'target',         g.target_equipment_id,
               'target_port',    g.target_port,
               'priority',       g.input_priority,
               'type',           COALESCE(g.connection_type, 'POWER'),
               'render_path_id', g.render_path_id,
               'd',              g.render_path_d
             ) ORDER BY g.source_equipment_id, g.target_equipment_id)
        FROM graph_edges g), '[]'::jsonb)
  );
$$;

COMMENT ON FUNCTION public.get_topology_graph(uuid) IS
  'The topology contract: {rooms[], nodes[], edges[]}. Rooms are the ground '
  'plane, drawn first. Nodes carry `simulated` — the renderer draws all, the '
  'engine loads only simulated. SECURITY INVOKER; do not change.';

REVOKE ALL ON FUNCTION public.get_topology_graph(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_topology_graph(uuid) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- Equipment should sit inside the room it belongs to
--
-- Cheap to check, and it catches both a mistyped coordinate and a node whose
-- room_id no longer matches where it is drawn.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.topology_layout_issues AS
  SELECT e.site_uuid,
         e.equipment_id,
         'OUTSIDE_ROOM'::text AS issue,
         format('%s is drawn at (%s, %s), outside %s',
                e.equipment_id, e.layout_x, e.layout_y, r.room_name) AS detail
    FROM public.equipment_registry e
    JOIN public.rooms r ON r.id = e.room_id
   WHERE e.layout_x IS NOT NULL
     AND r.layout_x IS NOT NULL
     AND NOT (e.layout_x BETWEEN r.layout_x AND r.layout_x + r.layout_w
          AND e.layout_y BETWEEN r.layout_y AND r.layout_y + r.layout_h);

COMMENT ON VIEW public.topology_layout_issues IS
  'Equipment drawn outside the room it is assigned to. Either the coordinates '
  'or the room_id is wrong.';

COMMIT;


-- ==========================================
-- MIGRATION: 20260816_unify_equipment_identity.sql
-- ==========================================
-- ═══════════════════════════════════════════════════════════════════════════
-- 20260816_unify_equipment_identity.sql
-- DCIMe V2 — one registry row per physical device
--
-- THE PROBLEM
-- Two models described the same facility under different identifiers:
--   blueprint (NTC_blueprint.json)  47 items — what gets READ    (pac_server_em1)
--   topology  (sandbox seed)        50 nodes — what carries POWER (node-sr-ac-1)
-- Only ~15 overlapped by name, and automatic matching produced confidently
-- wrong pairs — "Vertiv 1" matched a Vertiv-brand UPS to a Vertiv aircon.
-- The mapping was therefore resolved by hand and confirmed by the facility.
--
-- WHICH IDENTIFIER WINS
-- Blueprint ids, decisively. telemetry_logs stores one row per hour under
-- asset_id = 'facility_wide', with equipment identity embedded in the METRIC KEY
-- PREFIXES (ups_1_load_amps_a, dg_1_run_hours). Those same prefixes key
-- excelMappings.ts. Renaming them would orphan every historical reading and
-- break every export. Topology node ids appear only in the disposable sandbox
-- seed and the engine, so they are the cheap side to move.
--
-- RESULT — 62 rows, three kinds:
--   35  matched      one row carrying BOTH a parameter set and a graph position
--   12  telemetry    room ambient sensors, fuel record, workstation, HQ units:
--                    real equipment, no place in a power cascade
--   15  topology     distribution boards, changeovers, busbar: carry power,
--                    nobody takes readings from them
--
-- This migration only widens constraints. The sandbox seed is rewritten
-- separately, because renaming a primary key referenced by ON DELETE CASCADE
-- foreign keys is worse than regenerating disposable data.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. THE CATEGORY CONSTRAINT
--
--    20260625_reconcile_schema.sql pinned category to five values:
--        UPS, GENERATOR, MAINS, RECTIFIER, AIRCON
--
--    That is the vocabulary of a POWER model. A unified registry also holds
--    switchgear, IT load, safety equipment and environmental sensors, none of
--    which fit — which is why applying the topology migration against the live
--    database failed with "check constraint is violated by some row".
--
--    Widened rather than dropped: an unconstrained category column drifts into
--    free text within a month.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.equipment_registry
  DROP CONSTRAINT IF EXISTS equipment_registry_category_check;

ALTER TABLE public.equipment_registry
  ADD CONSTRAINT equipment_registry_category_check CHECK (
    category IN (
      -- Original five, preserved so existing rows stay valid.
      'UPS','GENERATOR','MAINS','RECTIFIER','AIRCON',
      -- Power path.
      'POWER_SOURCE','SWITCHGEAR','DISTRIBUTION','BUSBAR',
      -- Load and environment.
      'IT_LOAD','COOLING','ENVIRONMENT',
      -- Neither powered nor power-carrying, but still logged.
      'SAFETY','FUEL','FACILITY',
      -- Legacy values seeded by 20260625_admin_wiring.sql.
      'Power','Cooling','Network','Compute'
    )
  ) NOT VALID;

-- NOT VALID deliberately: existing rows are not re-checked, so the migration
-- cannot fail on data that predates it. New and updated rows ARE checked.
-- Once the live registry is known clean:
--     ALTER TABLE public.equipment_registry
--       VALIDATE CONSTRAINT equipment_registry_category_check;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. THE TELEMETRY LINK
--
--    Equipment that is read but never simulated needs no engine_type and no
--    coordinates — the schema already permits both to be NULL. What it does
--    need is a way to say "this row is the subject of metric keys beginning
--    <prefix>", so Stage 6 can attach 324 parameter definitions without
--    guessing from the id.
--
--    Usually identical to equipment_id. It exists for the case where they
--    diverge, and so the relationship is explicit rather than inferred from a
--    naming convention — inferring from names is what produced the bad matches.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.equipment_registry
  ADD COLUMN IF NOT EXISTS metric_prefix text;

COMMENT ON COLUMN public.equipment_registry.metric_prefix IS
  'Prefix of this equipment''s keys inside telemetry_logs.metrics, e.g. ups_1 '
  'for ups_1_load_amps_a. Normally equals equipment_id.';

CREATE INDEX IF NOT EXISTS idx_equipment_registry_metric_prefix
  ON public.equipment_registry (metric_prefix)
  WHERE metric_prefix IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. ROLE VISIBILITY
--
--    With three kinds of row in one table, "what is this?" must be answerable
--    without re-deriving it in every query and every UI.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.equipment_roles AS
  SELECT e.equipment_id,
         e.site_uuid,
         e.name,
         e.category,
         e.engine_type,
         e.metric_prefix,
         (e.engine_type IS NOT NULL)                        AS is_simulated,
         (e.layout_x IS NOT NULL)                           AS is_drawn,
         EXISTS (SELECT 1 FROM public.equipment_parameters p
                  WHERE p.equipment_id = e.equipment_id)     AS has_parameters,
         CASE
           WHEN e.engine_type IS NOT NULL
            AND EXISTS (SELECT 1 FROM public.equipment_parameters p
                         WHERE p.equipment_id = e.equipment_id) THEN 'MATCHED'
           WHEN e.engine_type IS NOT NULL                       THEN 'TOPOLOGY_ONLY'
           ELSE                                                      'TELEMETRY_ONLY'
         END                                                 AS role
    FROM public.equipment_registry e;

COMMENT ON VIEW public.equipment_roles IS
  'One row per device with its role: MATCHED (powered and read), TOPOLOGY_ONLY '
  '(carries power, no readings), TELEMETRY_ONLY (read, not in the cascade).';

COMMIT;


-- ==========================================
-- MIGRATION: 20260817_capacity_analysis.sql
-- ==========================================
-- ═══════════════════════════════════════════════════════════════════════════
-- 20260817_capacity_analysis.sql
-- DCIMe V2 — Stage 7: stranded capacity and N+1 headroom
--
-- This is what the Stage 4b reverse pass was for.
--
-- Naive headroom is a lie in a redundant facility. If UPS 1 and UPS 2 each sit
-- at 45%, a capacity report says "55% free" — but losing either drives the
-- survivor to 90%, so the installable headroom is nearly zero. Every rack you
-- add on the strength of that 55% is a rack that drops when one UPS trips.
--
-- N+1 HEADROOM is the number that actually governs installation: capacity
-- remaining AFTER the worst single upstream failure. It is computable only
-- because the graph knows which feeds are redundant and which are not.
--
-- Computed in SQL rather than in the WASM engine because a dashboard needs it
-- for every site at once, cached, without a browser running a simulation.
-- The two must agree; the engine remains authoritative for live state.
--
-- Depends on: 20260813_topology_graph.sql, 20260814_topology_layout.sql
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. LOAD ACCUMULATION
--
--    Mirrors PowerMatrix::accumulateLoad(). Consumers seed their own draw;
--    everything upstream carries the sum of what sits below it, split evenly
--    across live feeds.
--
--    Depth-capped at 24: a malformed graph containing a cycle would otherwise
--    recurse forever. topology_graph_issues reports cycles separately — this
--    function must degrade, not hang, if one slips through.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_load_accumulation(p_site_uuid uuid DEFAULT NULL)
RETURNS TABLE (
  equipment_id    text,
  name            text,
  engine_type     text,
  capacity        double precision,
  own_load_kw     double precision,
  carried_load_kw double precision,
  headroom_kw     double precision,
  load_pct        double precision,
  feeder_count    integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH RECURSIVE target AS (
    SELECT COALESCE(p_site_uuid, public.get_my_site_uuid()) AS id
  ),
  nodes AS (
    SELECT e.equipment_id, e.name, e.engine_type,
           COALESCE((e.dynamic_parameters->>'capacity')::double precision, 0) AS capacity,
           CASE WHEN e.engine_type IN ('server','cooling')
                THEN COALESCE((e.dynamic_parameters->>'kw_load')::double precision, 0)
                ELSE 0 END AS own_load
      FROM public.equipment_registry e, target t
     WHERE e.site_uuid = t.id AND e.engine_type IS NOT NULL
  ),
  edges AS (
    SELECT c.source_equipment_id AS src,
           c.target_equipment_id AS tgt,
           c.input_priority,
           e.input_policy AS target_policy,
           -- Rank among the inputs of this target, so a PRIORITY node can pick
           -- its primary feed without needing live simulation state.
           row_number() OVER (PARTITION BY c.target_equipment_id
                              ORDER BY c.input_priority, c.source_equipment_id) AS pref
      FROM public.equipment_connections c
      JOIN public.equipment_registry e ON e.equipment_id = c.target_equipment_id
     WHERE c.is_active AND c.provenance IN ('MANUAL','IMPORT')
       AND c.source_equipment_id IN (SELECT equipment_id FROM nodes)
       AND c.target_equipment_id IN (SELECT equipment_id FROM nodes)
  ),
  -- Each consumer's draw, propagated up every path that carries it.
  --
  -- How it divides depends on the target's policy, and getting this wrong
  -- understates the source:
  --   ANY / ALL  split evenly across feeders — a dual-corded rack really does
  --              draw half through each cord.
  --   PRIORITY   ALL of it through the primary feed. A changeover carries on one
  --              source at a time; splitting a TCO's load between grid and
  --              generator would report the grid at half its true burden and
  --              flatter every capacity figure above it.
  --
  -- The primary is the lowest input_priority — normal operation, on mains.
  -- PowerMatrix does the same via selected_feeder, but from live state.
  flows AS (
    SELECT n.equipment_id AS origin, n.equipment_id AS node,
           n.own_load AS kw, 0 AS depth
      FROM nodes n
     WHERE n.own_load > 0

    UNION ALL

    SELECT f.origin, e.src,
           CASE WHEN e.target_policy = 'PRIORITY' THEN f.kw
                ELSE f.kw / GREATEST(
                       (SELECT count(*) FROM edges e2 WHERE e2.tgt = f.node), 1)
           END,
           f.depth + 1
      FROM flows f
      JOIN edges e ON e.tgt = f.node
     WHERE f.depth < 24
       -- A PRIORITY target passes its draw up the primary feed only.
       AND (e.target_policy <> 'PRIORITY' OR e.pref = 1)
  ),
  carried AS (
    SELECT node, sum(kw) AS kw FROM flows WHERE depth > 0 GROUP BY node
  )
  SELECT n.equipment_id, n.name, n.engine_type, n.capacity, n.own_load,
         COALESCE(c.kw, n.own_load)                                   AS carried_load_kw,
         n.capacity - COALESCE(c.kw, n.own_load)                      AS headroom_kw,
         CASE WHEN n.capacity > 0
              THEN (COALESCE(c.kw, n.own_load) / n.capacity) * 100 END AS load_pct,
         (SELECT count(*)::integer FROM edges e WHERE e.tgt = n.equipment_id) AS feeder_count
    FROM nodes n
    LEFT JOIN carried c ON c.node = n.equipment_id
   ORDER BY 7 DESC NULLS LAST;
$$;

COMMENT ON FUNCTION public.get_load_accumulation(uuid) IS
  'Reverse-pass load accumulation in SQL. Mirrors PowerMatrix::accumulateLoad().';


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. N+1 HEADROOM
--
--    For every set of feeders sharing a target under a redundant policy, asks:
--    if the largest one fails, does the rest of the set still carry the load?
--
--    This is the question a capacity report must answer and a naive percentage
--    cannot.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_redundancy_analysis(p_site_uuid uuid DEFAULT NULL)
RETURNS TABLE (
  target_id        text,
  target_name      text,
  input_policy     text,
  feeder_count     integer,
  feeders          text[],
  total_load_kw    double precision,
  surviving_capacity_kw double precision,
  load_after_failure_kw double precision,
  n_plus_1_headroom_kw  double precision,
  n_plus_1_ok      boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH target AS (
    SELECT COALESCE(p_site_uuid, public.get_my_site_uuid()) AS id
  ),
  acc AS (
    SELECT * FROM public.get_load_accumulation(p_site_uuid)
  ),
  groups AS (
    SELECT c.target_equipment_id AS tgt,
           array_agg(c.source_equipment_id ORDER BY c.source_equipment_id) AS feeders,
           count(*)::integer AS n
      FROM public.equipment_connections c
      JOIN public.equipment_registry e ON e.equipment_id = c.target_equipment_id
         , target t
     WHERE c.is_active AND c.provenance IN ('MANUAL','IMPORT')
       AND e.site_uuid = t.id
     GROUP BY c.target_equipment_id
    HAVING count(*) > 1
  )
  SELECT g.tgt,
         e.name,
         e.input_policy,
         g.n,
         g.feeders,
         COALESCE(ta.carried_load_kw, 0),
         -- Capacity remaining once the single largest feeder is removed.
         COALESCE((SELECT sum(a.capacity) FROM acc a WHERE a.equipment_id = ANY(g.feeders)), 0)
           - COALESCE((SELECT max(a.capacity) FROM acc a WHERE a.equipment_id = ANY(g.feeders)), 0),
         -- The survivors carry the whole load, not their share of it. This is
         -- the step naive headroom omits.
         COALESCE(ta.carried_load_kw, 0),
         COALESCE((SELECT sum(a.capacity) FROM acc a WHERE a.equipment_id = ANY(g.feeders)), 0)
           - COALESCE((SELECT max(a.capacity) FROM acc a WHERE a.equipment_id = ANY(g.feeders)), 0)
           - COALESCE(ta.carried_load_kw, 0),
         (COALESCE((SELECT sum(a.capacity) FROM acc a WHERE a.equipment_id = ANY(g.feeders)), 0)
           - COALESCE((SELECT max(a.capacity) FROM acc a WHERE a.equipment_id = ANY(g.feeders)), 0))
           >= COALESCE(ta.carried_load_kw, 0)
    FROM groups g
    JOIN public.equipment_registry e ON e.equipment_id = g.tgt
    LEFT JOIN acc ta ON ta.equipment_id = g.tgt
   ORDER BY 9;
$$;

COMMENT ON FUNCTION public.get_redundancy_analysis(uuid) IS
  'N+1 headroom per redundant group: can the survivors carry the load when the '
  'largest feeder fails? The number that governs whether a rack can be installed.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. THE CAPACITY LEDGER
--
--    What an executive reads. Phrased as a constraint and its cause, because
--    "Room 2 has 14U free but zero N+1 headroom, blocked by AC UPS DB B" is a
--    sentence that justifies capital expenditure. "78% utilised" is not.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_capacity_summary(p_site_uuid uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH acc AS (SELECT * FROM public.get_load_accumulation(p_site_uuid)),
       red AS (SELECT * FROM public.get_redundancy_analysis(p_site_uuid))
  SELECT jsonb_build_object(
    'generated_at', now(),
    'it_load_kw', COALESCE((
      -- IT load is measured at the CONVERSION TIER, never by summing racks.
      -- Racks sit downstream of that meter, so counting both double-counts.
      SELECT sum(a.carried_load_kw) FROM acc a
       WHERE a.engine_type IN ('ups','rectifier')), 0),
    'cooling_load_kw', COALESCE((
      SELECT sum(a.own_load_kw) FROM acc a WHERE a.engine_type = 'cooling'), 0),
    'redundancy', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'target',        r.target_id,
               'name',          r.target_name,
               'policy',        r.input_policy,
               'feeders',       r.feeder_count,
               'load_kw',       round(r.total_load_kw::numeric, 2),
               'n_plus_1_kw',   round(r.n_plus_1_headroom_kw::numeric, 2),
               'n_plus_1_ok',   r.n_plus_1_ok
             ) ORDER BY r.n_plus_1_headroom_kw)
        FROM red r), '[]'::jsonb),
    'constrained', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'equipment', a.equipment_id,
               'name',      a.name,
               'load_pct',  round(a.load_pct::numeric, 1),
               'headroom_kw', round(a.headroom_kw::numeric, 2)
             ) ORDER BY a.load_pct DESC)
        FROM acc a WHERE a.load_pct > 70), '[]'::jsonb),
    'n_plus_1_breaches', COALESCE((
      SELECT count(*) FROM red r WHERE NOT r.n_plus_1_ok), 0)
  );
$$;

COMMENT ON FUNCTION public.get_capacity_summary(uuid) IS
  'Capacity ledger for the executive dashboard: IT load at the conversion tier, '
  'redundancy status per group, and anything above 70% utilisation.';

REVOKE ALL ON FUNCTION public.get_load_accumulation(uuid)   FROM public;
REVOKE ALL ON FUNCTION public.get_redundancy_analysis(uuid) FROM public;
REVOKE ALL ON FUNCTION public.get_capacity_summary(uuid)    FROM public;
GRANT EXECUTE ON FUNCTION public.get_load_accumulation(uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_redundancy_analysis(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_capacity_summary(uuid)    TO authenticated;

COMMIT;


-- ==========================================
-- MIGRATION: 20260818_ingestion_health.sql
-- ==========================================
-- ═══════════════════════════════════════════════════════════════════════════
-- 20260818_ingestion_health.sql
-- DCIMe V2 — Stage 8: the dead-man's switch
--
-- THE GAP THIS CLOSES
-- Every alert in the system so far is triggered by a READING: a temperature too
-- high, a voltage too low, a generator that started. All of them require data to
-- arrive. If a site stops reporting entirely — technician off sick, tablet
-- broken, network down, someone simply forgot — the dashboards show the last
-- known good values and nothing complains.
--
-- Silence is currently indistinguishable from health. That is the most dangerous
-- state a monitoring system can have, because it fails exactly when you most
-- need it and gives no sign.
--
-- This inverts the trigger: instead of alerting on a bad reading, alert on the
-- ABSENCE of readings. It is the one check that cannot be satisfied by data that
-- never arrives.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. EXPECTED CADENCE, PER SITE
--
--    Sites do not all report at the same rate — a staffed facility logs hourly,
--    a remote one might be four-hourly. A single global threshold would either
--    cry wolf at the slow site or stay silent too long at the fast one.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS expected_interval_minutes integer NOT NULL DEFAULT 60,
  -- Grace before a late reading counts as silence. Rounds slip; a technician
  -- fifteen minutes behind is normal and must not page anyone.
  ADD COLUMN IF NOT EXISTS ingestion_grace_minutes  integer NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS monitoring_enabled       boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.sites.expected_interval_minutes IS
  'How often this site is expected to report. Drives the dead-man''s switch.';
COMMENT ON COLUMN public.sites.monitoring_enabled IS
  'Set false during commissioning or planned downtime, so a site that is '
  'deliberately quiet does not raise an incident every hour.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. INGESTION HEALTH
--
--    SECURITY DEFINER, deliberately and unusually.
--
--    Every other function in this system is INVOKER so RLS applies. This one
--    must see ALL sites regardless of who is asking, because the question is
--    "which site has gone quiet?" — and a site-scoped view can never answer it.
--    A supervisor at Site 1 cannot see that Site 2 stopped reporting.
--
--    It exposes only timestamps and staleness, never telemetry values, so the
--    widened visibility leaks nothing operational.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.site_ingestion_health AS
  SELECT s.id                       AS site_uuid,
         s.site_code,
         s.site_name,
         s.expected_interval_minutes,
         s.ingestion_grace_minutes,
         s.monitoring_enabled,
         t.last_reading_at,
         t.last_technician,
         CASE WHEN t.last_reading_at IS NULL THEN NULL
              ELSE EXTRACT(EPOCH FROM (now() - t.last_reading_at)) / 60.0
         END                        AS minutes_since_reading,
         CASE
           WHEN NOT s.monitoring_enabled          THEN 'PAUSED'
           WHEN t.last_reading_at IS NULL         THEN 'NEVER_REPORTED'
           WHEN EXTRACT(EPOCH FROM (now() - t.last_reading_at)) / 60.0
                > (s.expected_interval_minutes + s.ingestion_grace_minutes) * 3
                                                  THEN 'CRITICAL'
           WHEN EXTRACT(EPOCH FROM (now() - t.last_reading_at)) / 60.0
                > (s.expected_interval_minutes + s.ingestion_grace_minutes)
                                                  THEN 'STALE'
           ELSE                                        'HEALTHY'
         END                        AS status
    FROM public.sites s
    LEFT JOIN LATERAL (
      SELECT tl.submitted_at AS last_reading_at,
             tl.technician_name AS last_technician
        FROM public.telemetry_logs tl
       WHERE tl.site_uuid = s.id
       ORDER BY tl.submitted_at DESC NULLS LAST
       LIMIT 1
    ) t ON true;

COMMENT ON VIEW public.site_ingestion_health IS
  'Per-site reporting freshness. STALE means one missed cadence plus grace; '
  'CRITICAL means three. NEVER_REPORTED distinguishes a new site from a dead one.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. RAISING THE ALARM
--
--    Writes into `incidents`, so a silent site arrives through exactly the same
--    path a technician-reported fault does — same table, same UI, same WhatsApp
--    formatter. A separate alert channel would be one more thing to remember to
--    look at.
--
--    Idempotent by design: re-raising every time the scheduler fires would bury
--    the operator. One open incident per site until it is resolved.
-- ═══════════════════════════════════════════════════════════════════════════
-- Dropped rather than replaced: CREATE OR REPLACE cannot rename a function's
-- OUT columns, so an earlier signature would survive and callers would break.
DROP FUNCTION IF EXISTS public.check_ingestion_health();

CREATE FUNCTION public.check_ingestion_health()
RETURNS TABLE (out_site_code text, out_status text, out_action text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r        record;
  v_open   uuid;
  v_sev    text;
  v_msg    text;
BEGIN
  FOR r IN
    SELECT h.* FROM public.site_ingestion_health h
     WHERE h.status IN ('STALE','CRITICAL','NEVER_REPORTED')
  LOOP
    -- Is there already an unresolved silence incident for this site?
    SELECT i.id INTO v_open
      FROM public.incidents i
     WHERE i.site_uuid = r.site_uuid
       AND i.asset_id  = 'INGESTION_MONITOR'
       AND i.resolved_at IS NULL
     LIMIT 1;

    IF v_open IS NOT NULL THEN
      RETURN QUERY SELECT r.site_code, r.status, 'already open'::text;
      CONTINUE;
    END IF;

    v_sev := CASE WHEN r.status = 'CRITICAL' THEN 'critical' ELSE 'high' END;
    v_msg := CASE
      WHEN r.status = 'NEVER_REPORTED'
        THEN 'No telemetry has ever been received from this site.'
      ELSE 'No telemetry received for ' || round(r.minutes_since_reading / 60.0, 1)
           || ' hours. Expected every ' || r.expected_interval_minutes || ' minutes.'
           || CASE WHEN r.last_technician IS NOT NULL
                   THEN ' Last reading by ' || r.last_technician || '.' ELSE '' END
    END;

    INSERT INTO public.incidents
      (site_uuid, site_name, asset_id, severity, occurred_at,
       raised_by_id, raised_by_name, notes, impact, comments)
    VALUES
      (r.site_uuid, r.site_name, 'INGESTION_MONITOR', v_sev,
       COALESCE(r.last_reading_at, now()),
       '00000000-0000-0000-0000-000000000000', 'Ingestion Monitor',
       v_msg,
       'Monitoring blind: readings are not arriving, so no other alert can fire.',
       '[]'::jsonb);

    RETURN QUERY SELECT r.site_code, r.status, 'incident raised'::text;
  END LOOP;

  -- Auto-resolve once readings resume. A silence incident describes a condition
  -- that has demonstrably ended, so leaving it open teaches people to ignore it.
  UPDATE public.incidents i
     SET resolved_at        = now(),
         resolved_by_name   = 'Ingestion Monitor',
         resolved_by_type   = 'SYSTEM',
         resolution_details = 'Telemetry resumed.'
    FROM public.site_ingestion_health h
   WHERE i.site_uuid = h.site_uuid
     AND i.asset_id  = 'INGESTION_MONITOR'
     AND i.resolved_at IS NULL
     AND h.status IN ('HEALTHY','PAUSED');

  RETURN;
END $$;

COMMENT ON FUNCTION public.check_ingestion_health() IS
  'Dead-man''s switch. Raises one incident per silent site and resolves it when '
  'readings resume. Schedule every 15 minutes via pg_cron.';

REVOKE ALL ON FUNCTION public.check_ingestion_health() FROM public;
GRANT EXECUTE ON FUNCTION public.check_ingestion_health() TO authenticated;

GRANT SELECT ON public.site_ingestion_health TO authenticated;

COMMIT;

-- ── Scheduling ─────────────────────────────────────────────────────────────
-- Not enabled here: pg_cron must be available and the schedule is an
-- operational decision, not a schema one. In the Supabase SQL editor:
--
--     CREATE EXTENSION IF NOT EXISTS pg_cron;
--     SELECT cron.schedule('dcime-ingestion-health', '*/15 * * * *',
--                          'SELECT public.check_ingestion_health()');
--
-- Fifteen minutes is deliberate: frequent enough that a site going quiet is
-- noticed within a fraction of its reporting cadence, infrequent enough that the
-- check itself costs nothing.


-- ==========================================
-- MIGRATION: 20260819_commissioning_import.sql
-- ==========================================
-- ═══════════════════════════════════════════════════════════════════════════
-- 20260819_commissioning_import.sql
-- DCIMe V2 — Stage 9: staged commissioning import
--
-- WHY THIS DECIDES WHETHER THE PLATFORM SCALES
-- Bringing a site online means recording every asset AND every cable. Done by
-- hand that is weeks of work per site, and it is the single most common reason
-- DCIM deployments are abandoned — not the software, the data entry.
--
-- THE RULE: NOTHING GOES STRAIGHT INTO LIVE TABLES.
-- A spreadsheet lands in staging, is validated row by row, and is promoted only
-- when it is clean. A half-imported facility is worse than no facility: the
-- graph looks complete, the cascade runs, and the answers are quietly wrong.
--
-- Every row carries its own verdict, so a commissioning engineer fixes their
-- spreadsheet against specific line numbers instead of a single "import failed".
--
-- Imported rows land with provenance = 'IMPORT', so surveyed topology stays
-- distinguishable from bulk-loaded topology forever.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. BATCHES
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.import_batches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_uuid    uuid        NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  filename     text,
  kind         text        NOT NULL,
  status       text        NOT NULL DEFAULT 'STAGED',
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  promoted_at  timestamptz,
  row_count    integer     NOT NULL DEFAULT 0,
  error_count  integer     NOT NULL DEFAULT 0,
  notes        text,

  CONSTRAINT import_batches_kind_check
    CHECK (kind IN ('EQUIPMENT','CONNECTIONS','PARAMETERS')),
  -- STAGED -> VALIDATED -> PROMOTED, or DISCARDED at any point. A batch cannot
  -- be promoted twice; the status is the guard.
  CONSTRAINT import_batches_status_check
    CHECK (status IN ('STAGED','VALIDATED','PROMOTED','DISCARDED'))
);

CREATE INDEX IF NOT EXISTS idx_import_batches_site
  ON public.import_batches (site_uuid, created_at DESC);


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. STAGED ROWS
--
--    Payload is JSONB rather than typed columns: one staging table serves
--    equipment, connections and parameters, and a spreadsheet with an unexpected
--    column is a validation finding rather than a failed insert.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.import_rows (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id    uuid    NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  -- The line number in the source file. Without it a validation message is
  -- useless to whoever has to fix the spreadsheet.
  source_line integer NOT NULL,
  payload     jsonb   NOT NULL,
  verdict     text    NOT NULL DEFAULT 'PENDING',
  message     text,

  CONSTRAINT import_rows_verdict_check
    CHECK (verdict IN ('PENDING','OK','WARN','ERROR','SKIPPED'))
);

CREATE INDEX IF NOT EXISTS idx_import_rows_batch
  ON public.import_rows (batch_id, source_line);
CREATE INDEX IF NOT EXISTS idx_import_rows_problems
  ON public.import_rows (batch_id) WHERE verdict IN ('ERROR','WARN');


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. VALIDATION
--
--    Checks every row and records a verdict. Never writes to live tables, so it
--    is safe to run repeatedly while someone corrects their spreadsheet.
--
--    ERROR blocks promotion. WARN does not — a missing coordinate means the
--    equipment simply is not drawn, which is a legitimate state, not a fault.
-- ═══════════════════════════════════════════════════════════════════════════
-- OUT column names are prefixed and the function dropped before recreation:
-- a RETURNS TABLE column becomes a PL/pgSQL variable that shadows any
-- identically named table column, and CREATE OR REPLACE cannot rename them.
DROP FUNCTION IF EXISTS public.validate_import_batch(uuid);

CREATE FUNCTION public.validate_import_batch(p_batch_id uuid)
RETURNS TABLE (out_verdict text, out_rows bigint)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_kind text;
  v_site uuid;
BEGIN
  SELECT b.kind, b.site_uuid INTO v_kind, v_site
    FROM public.import_batches b WHERE b.id = p_batch_id;
  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'No such import batch: %', p_batch_id;
  END IF;

  UPDATE public.import_rows SET verdict = 'PENDING', message = NULL
   WHERE batch_id = p_batch_id;

  IF v_kind = 'EQUIPMENT' THEN
    -- Required fields.
    UPDATE public.import_rows r
       SET verdict = 'ERROR', message = 'equipment_id and name are required'
     WHERE r.batch_id = p_batch_id
       AND (COALESCE(r.payload->>'equipment_id','') = ''
         OR COALESCE(r.payload->>'name','') = '');

    -- An unknown template would deploy equipment with no physics at all.
    UPDATE public.import_rows r
       SET verdict = 'ERROR',
           message = 'Unknown template: ' || COALESCE(r.payload->>'template_id','(none)')
     WHERE r.batch_id = p_batch_id AND r.verdict = 'PENDING'
       AND r.payload->>'template_id' IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.equipment_templates t
                        WHERE t.template_id = r.payload->>'template_id');

    -- Collides with equipment already at this site.
    UPDATE public.import_rows r
       SET verdict = 'ERROR',
           message = 'equipment_id already exists at this site'
     WHERE r.batch_id = p_batch_id AND r.verdict = 'PENDING'
       AND EXISTS (SELECT 1 FROM public.equipment_registry e
                    WHERE e.equipment_id = r.payload->>'equipment_id'
                      AND e.site_uuid = v_site);

    -- Duplicated inside the spreadsheet itself. Reported against the LATER
    -- line, so the first occurrence stays importable.
    UPDATE public.import_rows r
       SET verdict = 'ERROR', message = 'Duplicate equipment_id within this file'
      FROM (SELECT id, row_number() OVER (PARTITION BY payload->>'equipment_id'
                                          ORDER BY source_line) AS n
              FROM public.import_rows WHERE batch_id = p_batch_id) d
     WHERE r.id = d.id AND d.n > 1 AND r.verdict = 'PENDING';

    -- Drawable but incomplete: one coordinate without the other.
    UPDATE public.import_rows r
       SET verdict = 'WARN', message = 'Only one coordinate given; will not be drawn'
     WHERE r.batch_id = p_batch_id AND r.verdict = 'PENDING'
       AND num_nonnulls(r.payload->>'layout_x', r.payload->>'layout_y') = 1;

  ELSIF v_kind = 'CONNECTIONS' THEN
    UPDATE public.import_rows r
       SET verdict = 'ERROR', message = 'source and target are required'
     WHERE r.batch_id = p_batch_id
       AND (COALESCE(r.payload->>'source_equipment_id','') = ''
         OR COALESCE(r.payload->>'target_equipment_id','') = '');

    UPDATE public.import_rows r
       SET verdict = 'ERROR', message = 'A cable cannot connect equipment to itself'
     WHERE r.batch_id = p_batch_id AND r.verdict = 'PENDING'
       AND r.payload->>'source_equipment_id' = r.payload->>'target_equipment_id';

    -- Endpoints must exist. Checked against live equipment AND against any
    -- EQUIPMENT batch staged for the same site but not yet promoted, so a
    -- facility can be imported as equipment-then-cables in one sitting.
    UPDATE public.import_rows r
       SET verdict = 'ERROR',
           message = 'Unknown source: ' || (r.payload->>'source_equipment_id')
     WHERE r.batch_id = p_batch_id AND r.verdict = 'PENDING'
       AND NOT EXISTS (SELECT 1 FROM public.equipment_registry e
                        WHERE e.equipment_id = r.payload->>'source_equipment_id'
                          AND e.site_uuid = v_site)
       AND NOT EXISTS (SELECT 1 FROM public.import_rows ir
                        JOIN public.import_batches ib ON ib.id = ir.batch_id
                       WHERE ib.site_uuid = v_site AND ib.kind = 'EQUIPMENT'
                         AND ib.status <> 'DISCARDED'
                         AND ir.payload->>'equipment_id' = r.payload->>'source_equipment_id');

    UPDATE public.import_rows r
       SET verdict = 'ERROR',
           message = 'Unknown target: ' || (r.payload->>'target_equipment_id')
     WHERE r.batch_id = p_batch_id AND r.verdict = 'PENDING'
       AND NOT EXISTS (SELECT 1 FROM public.equipment_registry e
                        WHERE e.equipment_id = r.payload->>'target_equipment_id'
                          AND e.site_uuid = v_site)
       AND NOT EXISTS (SELECT 1 FROM public.import_rows ir
                        JOIN public.import_batches ib ON ib.id = ir.batch_id
                       WHERE ib.site_uuid = v_site AND ib.kind = 'EQUIPMENT'
                         AND ib.status <> 'DISCARDED'
                         AND ir.payload->>'equipment_id' = r.payload->>'target_equipment_id');

    -- The same cable twice would silently double the load it carries.
    UPDATE public.import_rows r
       SET verdict = 'ERROR', message = 'Duplicate connection within this file'
      FROM (SELECT id, row_number() OVER (
                     PARTITION BY payload->>'source_equipment_id',
                                  COALESCE(payload->>'source_port','OUT'),
                                  payload->>'target_equipment_id',
                                  COALESCE(payload->>'target_port','IN')
                     ORDER BY source_line) AS n
              FROM public.import_rows WHERE batch_id = p_batch_id) d
     WHERE r.id = d.id AND d.n > 1 AND r.verdict = 'PENDING';
  END IF;

  UPDATE public.import_rows SET verdict = 'OK'
   WHERE batch_id = p_batch_id AND verdict = 'PENDING';

  UPDATE public.import_batches b
     SET status = CASE WHEN EXISTS (SELECT 1 FROM public.import_rows r
                                     WHERE r.batch_id = p_batch_id AND r.verdict = 'ERROR')
                       THEN 'STAGED' ELSE 'VALIDATED' END,
         row_count   = (SELECT count(*) FROM public.import_rows r WHERE r.batch_id = p_batch_id),
         error_count = (SELECT count(*) FROM public.import_rows r
                         WHERE r.batch_id = p_batch_id AND r.verdict = 'ERROR')
   WHERE b.id = p_batch_id;

  RETURN QUERY
    SELECT r.verdict, count(*) FROM public.import_rows r
     WHERE r.batch_id = p_batch_id GROUP BY r.verdict ORDER BY 1;
END $$;

COMMENT ON FUNCTION public.validate_import_batch(uuid) IS
  'Validates a staged batch row by row. Writes nothing to live tables, so it is '
  'safe to re-run while a spreadsheet is corrected.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. PROMOTION
--
--    Refuses to run unless the batch validated clean. All-or-nothing: a partial
--    facility produces a graph that looks complete and answers wrongly.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.promote_import_batch(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_kind text; v_site uuid; v_status text; v_errors int; v_inserted int := 0;
BEGIN
  SELECT b.kind, b.site_uuid, b.status, b.error_count
    INTO v_kind, v_site, v_status, v_errors
    FROM public.import_batches b WHERE b.id = p_batch_id;

  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'No such import batch: %', p_batch_id;
  END IF;
  IF v_status = 'PROMOTED' THEN
    RAISE EXCEPTION 'Batch already promoted';
  END IF;
  IF v_status <> 'VALIDATED' OR v_errors > 0 THEN
    RAISE EXCEPTION 'Batch is not clean: % error(s). Validate and fix first.', v_errors;
  END IF;

  IF v_kind = 'EQUIPMENT' THEN
    INSERT INTO public.equipment_registry
      (equipment_id, name, category, location, site_uuid, template_id,
       template_version, engine_type, dynamic_parameters, input_policy,
       provenance, is_active, layout_x, layout_y, render_shape, metric_prefix)
    SELECT r.payload->>'equipment_id',
           r.payload->>'name',
           COALESCE(r.payload->>'category', t.category, 'FACILITY'),
           COALESCE(r.payload->>'location', ''),
           v_site,
           r.payload->>'template_id',
           t.version,
           COALESCE(r.payload->>'engine_type', t.engine_type),
           COALESCE(t.default_parameters, '{}'::jsonb)
             || COALESCE((r.payload->'dynamic_parameters')::jsonb, '{}'::jsonb),
           COALESCE(r.payload->>'input_policy', 'ANY'),
           'IMPORT', true,
           -- Both coordinates or neither. Validation flags a half-pair as WARN
           -- ("will not be drawn"), and promotion has to honour that verdict —
           -- otherwise equipment_registry_layout_pair_check rejects the row and
           -- one sloppy cell fails an entire facility import.
           CASE WHEN r.payload->>'layout_y' IS NULL THEN NULL
                ELSE (r.payload->>'layout_x')::double precision END,
           CASE WHEN r.payload->>'layout_x' IS NULL THEN NULL
                ELSE (r.payload->>'layout_y')::double precision END,
           r.payload->>'render_shape',
           COALESCE(r.payload->>'metric_prefix', r.payload->>'equipment_id')
      FROM public.import_rows r
      LEFT JOIN public.equipment_templates t ON t.template_id = r.payload->>'template_id'
     WHERE r.batch_id = p_batch_id AND r.verdict IN ('OK','WARN');
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

  ELSIF v_kind = 'CONNECTIONS' THEN
    INSERT INTO public.equipment_connections
      (source_equipment_id, source_port, target_equipment_id, target_port,
       input_priority, connection_type, render_path_id, render_path_d,
       provenance, is_active)
    SELECT r.payload->>'source_equipment_id',
           COALESCE(r.payload->>'source_port','OUT'),
           r.payload->>'target_equipment_id',
           COALESCE(r.payload->>'target_port','IN'),
           COALESCE((r.payload->>'input_priority')::integer, 1),
           COALESCE(r.payload->>'connection_type','POWER'),
           r.payload->>'render_path_id',
           r.payload->>'render_path_d',
           'IMPORT', true
      FROM public.import_rows r
     WHERE r.batch_id = p_batch_id AND r.verdict IN ('OK','WARN');
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  END IF;

  UPDATE public.import_batches
     SET status = 'PROMOTED', promoted_at = now()
   WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'batch_id', p_batch_id,
    'kind', v_kind,
    'inserted', v_inserted,
    -- Surfaced immediately: a commissioning import is exactly when orphans and
    -- cross-site edges appear, and finding them now beats finding them in a
    -- cascade six months later.
    'graph_issues', COALESCE((SELECT count(*) FROM public.topology_graph_issues
                               WHERE site_uuid = v_site), 0)
  );
END $$;

COMMENT ON FUNCTION public.promote_import_batch(uuid) IS
  'Promotes a VALIDATED batch into live tables as provenance IMPORT. Refuses '
  'anything with errors — a partly-imported facility answers wrongly.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. RLS
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_rows    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Imports: site-scoped read" ON public.import_batches;
CREATE POLICY "Imports: site-scoped read"
  ON public.import_batches FOR SELECT
  USING (auth.role() = 'authenticated' AND site_uuid = public.get_my_site_uuid());

DROP POLICY IF EXISTS "Imports: admin write" ON public.import_batches;
CREATE POLICY "Imports: admin write"
  ON public.import_batches FOR ALL
  USING (public.get_my_role() = 'ADMIN' AND site_uuid = public.get_my_site_uuid())
  WITH CHECK (public.get_my_role() = 'ADMIN' AND site_uuid = public.get_my_site_uuid());

DROP POLICY IF EXISTS "Import rows: via batch" ON public.import_rows;
CREATE POLICY "Import rows: via batch"
  ON public.import_rows FOR ALL
  USING (EXISTS (SELECT 1 FROM public.import_batches b
                  WHERE b.id = batch_id AND b.site_uuid = public.get_my_site_uuid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.import_batches b
                       WHERE b.id = batch_id AND b.site_uuid = public.get_my_site_uuid()));

GRANT EXECUTE ON FUNCTION public.validate_import_batch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.promote_import_batch(uuid) TO authenticated;

COMMIT;


-- ==========================================
-- MIGRATION: 20260820a_work_items.sql
-- ==========================================
-- ═══════════════════════════════════════════════════════════════════════════
-- 20260820_work_items.sql
-- DCIMe V2 — the work item spine
--
-- WHY ONE TABLE INSTEAD OF FIVE FEATURES
-- The V1 audit found the same hole five times over: no assignee (G-01), no SLA
-- (G-02), no PM calendar (G-03), no work order (G-04), no change process
-- (G-05). Those are not five gaps. They are one missing primitive —
--
--     something to do, with an OWNER, a DUE TIME and a STATE MACHINE.
--
-- Build it once and the threshold alarm, the maintenance schedule, the SLA
-- clock, the contractor findings loop and planned work all become rows in the
-- same table rather than four disconnected features that never agree.
--
-- This is also what turns DCIMe from a system of RECORD into a system of
-- ENGAGEMENT: V1 faithfully records what a human tells it, but never tells a
-- human what to do next and never holds anyone to a deadline.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. SLA TARGETS
--    V1 has severity but nothing maps it to a response. Severity that implies
--    no obligation is decoration; this table is what gives it teeth.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.sla_targets (
  severity        text PRIMARY KEY,
  label           text NOT NULL,
  respond_minutes integer NOT NULL,
  resolve_minutes integer NOT NULL,
  description     text,

  CONSTRAINT sla_targets_severity_check CHECK (severity IN ('P1','P2','P3','P4')),
  CONSTRAINT sla_targets_order_check    CHECK (resolve_minutes >= respond_minutes)
);

INSERT INTO public.sla_targets (severity, label, respond_minutes, resolve_minutes, description)
VALUES
  ('P1','Critical',   15,   240, 'Service affecting or imminent. Redundancy lost or load at risk.'),
  ('P2','High',       60,  1440, 'Degraded but holding. A second failure would be service affecting.'),
  ('P3','Medium',    240,  4320, 'Needs attention within the working week.'),
  ('P4','Low',      1440, 20160, 'Housekeeping, cosmetic, or opportunistic.')
ON CONFLICT (severity) DO UPDATE
  SET label = EXCLUDED.label,
      respond_minutes = EXCLUDED.respond_minutes,
      resolve_minutes = EXCLUDED.resolve_minutes,
      description = EXCLUDED.description;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. WORK ITEMS
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.work_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_uuid   uuid        NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,

  title       text        NOT NULL,
  detail      text,
  kind        text        NOT NULL,
  severity    text        NOT NULL REFERENCES public.sla_targets(severity),

  -- ── The three things V1 never had ──────────────────────────────────────
  -- NULL assignee is a real state: unassigned work belongs to the queue, and
  -- pretending otherwise hides it. What must never happen is work with no
  -- assignee AND no due time — that is a note, not a job.
  assignee_id uuid        REFERENCES public.employees(id) ON DELETE SET NULL,
  due_at      timestamptz,
  state       text        NOT NULL DEFAULT 'OPEN',

  -- ── Where it came from ─────────────────────────────────────────────────
  -- A technician must be able to see WHY a job appeared, and an auditor must
  -- be able to tell machine-raised work from hand-typed work.
  origin      text        NOT NULL DEFAULT 'SYSTEM',
  source_kind text,
  source_ref  text,

  -- ── The SLA clock ──────────────────────────────────────────────────────
  respond_by      timestamptz,
  resolve_by      timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  resolved_at     timestamptz,
  resolved_by     uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  resolution_note text,

  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid,
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT work_items_kind_check CHECK (
    kind IN ('FAULT','INSPECTION','PREVENTIVE','FINDING','CHANGE')),

  -- OPEN -> ACKNOWLEDGED -> IN_PROGRESS -> RESOLVED -> CLOSED, or CANCELLED.
  CONSTRAINT work_items_state_check CHECK (
    state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS','RESOLVED','CLOSED','CANCELLED')),

  CONSTRAINT work_items_origin_check CHECK (
    origin IN ('SYSTEM','TECHNICIAN','CONTRACTOR','ADMIN')),

  -- Resolved work must say what happened. A ticket closed with no note is the
  -- commonest way an operations history becomes worthless.
  CONSTRAINT work_items_resolution_check CHECK (
    state NOT IN ('RESOLVED','CLOSED') OR resolution_note IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_work_items_queue
  ON public.work_items (site_uuid, state, due_at)
  WHERE state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS');

CREATE INDEX IF NOT EXISTS idx_work_items_assignee
  ON public.work_items (assignee_id, state)
  WHERE state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS');

-- ── Idempotency for machine-raised work ───────────────────────────────────
-- Threshold evaluation runs continuously. Without this, one hot room raises a
-- fresh ticket every cycle and the queue becomes unusable within a day — the
-- classic way automated alerting gets switched off and never switched back on.
--
-- Partial, so the same source CAN raise a new item once the previous one is
-- closed. A fault that recurs next month is genuinely new work.
CREATE UNIQUE INDEX IF NOT EXISTS uq_work_items_open_source
  ON public.work_items (site_uuid, source_kind, source_ref)
  WHERE source_kind IS NOT NULL
    AND state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS');


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. STATE MACHINE
--    Enforced in a trigger rather than trusted to callers: three different code
--    paths already close incidents in V1, each with its own rules, and the
--    ledger is inconsistent as a result (audit C-04).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.work_items_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- SLA clocks are derived, never supplied. A caller that sets its own
    -- deadline can quietly grant itself a week.
    SELECT now() + make_interval(mins => s.respond_minutes),
           now() + make_interval(mins => s.resolve_minutes)
      INTO NEW.respond_by, NEW.resolve_by
      FROM public.sla_targets s WHERE s.severity = NEW.severity;

    IF NEW.due_at IS NULL THEN NEW.due_at := NEW.resolve_by; END IF;
    RETURN NEW;
  END IF;

  NEW.updated_at := now();

  IF NEW.state IS DISTINCT FROM OLD.state THEN
    v_ok := CASE OLD.state
      WHEN 'OPEN'         THEN NEW.state IN ('ACKNOWLEDGED','IN_PROGRESS','CANCELLED')
      WHEN 'ACKNOWLEDGED' THEN NEW.state IN ('IN_PROGRESS','RESOLVED','CANCELLED')
      WHEN 'IN_PROGRESS'  THEN NEW.state IN ('RESOLVED','CANCELLED')
      WHEN 'RESOLVED'     THEN NEW.state IN ('CLOSED','IN_PROGRESS')  -- reopen if it recurs
      WHEN 'CLOSED'       THEN false                                  -- terminal
      WHEN 'CANCELLED'    THEN false
      ELSE false
    END;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'Invalid work item transition: % -> %', OLD.state, NEW.state;
    END IF;

    -- Timestamps are stamped by the machine, so "acknowledged" always means a
    -- person actually did, at a time that can be measured against the SLA.
    IF NEW.state = 'ACKNOWLEDGED' AND NEW.acknowledged_at IS NULL THEN
      NEW.acknowledged_at := now();
    END IF;
    IF NEW.state = 'RESOLVED' AND NEW.resolved_at IS NULL THEN
      NEW.resolved_at := now();
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_work_items_guard ON public.work_items;
CREATE TRIGGER trg_work_items_guard
  BEFORE INSERT OR UPDATE ON public.work_items
  FOR EACH ROW EXECUTE FUNCTION public.work_items_guard();


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. RAISING WORK
--    The single entry point for every producer. Returns the existing item when
--    one is already open for the same source, so a caller can fire freely
--    without checking first.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.raise_work_item(
  p_site_uuid   uuid,
  p_title       text,
  p_severity    text,
  p_kind        text    DEFAULT 'FAULT',
  p_detail      text    DEFAULT NULL,
  p_origin      text    DEFAULT 'SYSTEM',
  p_source_kind text    DEFAULT NULL,
  p_source_ref  text    DEFAULT NULL,
  p_assignee    uuid    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER   -- callable from a scheduled job with no user session
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_source_kind IS NOT NULL THEN
    SELECT id INTO v_id FROM public.work_items
     WHERE site_uuid = p_site_uuid
       AND source_kind = p_source_kind
       AND source_ref IS NOT DISTINCT FROM p_source_ref
       AND state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS')
     LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN v_id;   -- already raised and still open
    END IF;
  END IF;

  INSERT INTO public.work_items
    (site_uuid, title, detail, kind, severity, origin,
     source_kind, source_ref, assignee_id)
  VALUES
    (p_site_uuid, p_title, p_detail, p_kind, p_severity, p_origin,
     p_source_kind, p_source_ref, p_assignee)
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.raise_work_item IS
  'The single entry point for creating work. Idempotent per (site, source_kind, '
  'source_ref) while an item is still open, so producers can fire on every cycle.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. THE QUEUE
--    What a technician opens. Ordered by what is most overdue, because a list
--    ordered by creation date teaches people to work on the wrong thing.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.work_queue AS
SELECT w.id, w.site_uuid, w.title, w.detail, w.kind, w.severity, w.state,
       w.origin, w.source_kind, w.source_ref,
       w.assignee_id, e.full_name AS assignee_name,
       w.due_at, w.respond_by, w.resolve_by,
       w.acknowledged_at, w.created_at,
       s.label AS severity_label,

       -- Minutes past the resolution target. Negative means time remaining.
       EXTRACT(EPOCH FROM (now() - w.resolve_by)) / 60      AS overdue_minutes,
       (now() > w.resolve_by)                               AS is_breached,
       -- Response is a separate obligation: unacknowledged work is nobody's,
       -- and measuring it separately is what makes MTTA possible.
       (w.acknowledged_at IS NULL AND now() > w.respond_by) AS response_breached,

       CASE
         WHEN w.state IN ('RESOLVED','CLOSED','CANCELLED') THEN 'done'
         WHEN now() > w.resolve_by                          THEN 'breached'
         WHEN now() > w.resolve_by - interval '1 hour'      THEN 'due-soon'
         ELSE 'on-track'
       END AS sla_status
  FROM public.work_items w
  JOIN public.sla_targets s ON s.severity = w.severity
  LEFT JOIN public.employees e ON e.id = w.assignee_id;

COMMENT ON VIEW public.work_queue IS
  'Work with its SLA position resolved. Order by is_breached DESC, resolve_by ASC '
  'for a queue that puts the most overdue work first.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. RLS
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.work_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SLA targets: authenticated read" ON public.sla_targets;
CREATE POLICY "SLA targets: authenticated read"
  ON public.sla_targets FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "SLA targets: admin write" ON public.sla_targets;
CREATE POLICY "SLA targets: admin write"
  ON public.sla_targets FOR ALL
  USING (public.get_my_role() = 'ADMIN')
  WITH CHECK (public.get_my_role() = 'ADMIN');

-- Everyone at the site sees the whole queue. Work you cannot see is work you
-- cannot pick up, and hiding unassigned items is how a queue silently stalls.
DROP POLICY IF EXISTS "Work items: site-scoped read" ON public.work_items;
CREATE POLICY "Work items: site-scoped read"
  ON public.work_items FOR SELECT
  USING (auth.role() = 'authenticated' AND site_uuid = public.get_my_site_uuid());

DROP POLICY IF EXISTS "Work items: site-scoped insert" ON public.work_items;
CREATE POLICY "Work items: site-scoped insert"
  ON public.work_items FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND site_uuid = public.get_my_site_uuid());

DROP POLICY IF EXISTS "Work items: site-scoped update" ON public.work_items;
CREATE POLICY "Work items: site-scoped update"
  ON public.work_items FOR UPDATE
  USING (auth.role() = 'authenticated' AND site_uuid = public.get_my_site_uuid())
  WITH CHECK (site_uuid = public.get_my_site_uuid());

GRANT EXECUTE ON FUNCTION public.raise_work_item(uuid,text,text,text,text,text,text,text,uuid)
  TO authenticated;

COMMIT;


-- ==========================================
-- MIGRATION: 20260820b_threshold_alarms.sql
-- ==========================================
-- ═══════════════════════════════════════════════════════════════════════════
-- 20260820_threshold_alarms.sql
-- DCIMe V2 — readings become work
--
-- This is the Infrastructure -> Technical link from the V2 document: a sensor
-- reads badly, the system works out it matters, and a PERSON is given a job.
--
-- V1 has no rules engine at all (audit C-06, G-10). Every "Active Alarm" on the
-- admin screen is something a human noticed and typed up. A fault the
-- technician doesn't spot, or spots and doesn't file, does not exist.
--
-- The thresholds already exist — Stage 1 put min_value and max_value on every
-- parameter, and Stage 6 made the forms enforce them on entry. This closes the
-- loop by evaluating what was actually recorded and raising work from it.
--
-- Depends on: 20260820_work_items.sql, the parameter registry
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. SEVERITY FROM DISTANCE
--
--    How far outside its band a reading sits, as a fraction of the band width.
--    Using distance rather than a fixed table means one rule serves every
--    parameter: 2 °C over on a 20 °C band is not the same event as 2 V over on
--    a 0.5 V band, and a fixed mapping cannot tell them apart.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.severity_from_excursion(
  p_value double precision,
  p_min   double precision,
  p_max   double precision
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_band double precision;
  v_over double precision;
BEGIN
  IF p_value IS NULL THEN RETURN NULL; END IF;

  IF p_max IS NOT NULL AND p_value > p_max THEN
    v_over := p_value - p_max;
  ELSIF p_min IS NOT NULL AND p_value < p_min THEN
    v_over := p_min - p_value;
  ELSE
    RETURN NULL;   -- inside its band
  END IF;

  v_band := NULLIF(COALESCE(p_max,0) - COALESCE(p_min,0), 0);
  -- With only one bound there is no band to measure against, so fall back to a
  -- mid severity rather than inventing a scale.
  IF v_band IS NULL THEN RETURN 'P3'; END IF;

  RETURN CASE
    WHEN v_over > v_band * 0.25 THEN 'P1'
    WHEN v_over > v_band * 0.10 THEN 'P2'
    WHEN v_over > v_band * 0.02 THEN 'P3'
    ELSE 'P4'
  END;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. EVALUATION
--
--    Reads the most recent telemetry for a site, compares each value against
--    its registered band, and raises work for every breach.
--
--    Only the LATEST reading per parameter is considered. Evaluating history
--    would raise work for excursions that were resolved weeks ago.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.evaluate_thresholds(p_site_uuid uuid DEFAULT NULL)
RETURNS TABLE (
  out_equipment  text,
  out_parameter  text,
  out_value      double precision,
  out_severity   text,
  out_raised     boolean,
  -- The stable identity of this breach. Recovery matches on THIS, never on
  -- title text: two parameters on one device produce near-identical titles, and
  -- a LIKE match would close the wrong ticket.
  out_source_ref text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r        record;
  v_id     uuid;
  v_before int;
  v_after  int;
BEGIN
  FOR r IN
    WITH latest AS (
      -- One row per (equipment, parameter): the newest reading.
      -- Ordered by target_hour, not submission time. A reading backdated to
      -- 06:00 and typed at noon describes 06:00 — treating it as the latest
      -- state would let a late entry overwrite a more recent one.
      SELECT DISTINCT ON (t.site_uuid, t.asset_id, kv.key)
             t.site_uuid, t.asset_id, kv.key AS param, kv.value AS raw,
             t.target_hour
        FROM public.telemetry_logs t
        CROSS JOIN LATERAL jsonb_each_text(t.metrics) AS kv(key, value)
       WHERE (p_site_uuid IS NULL OR t.site_uuid = p_site_uuid)
         AND t.target_hour > now() - interval '48 hours'
       ORDER BY t.site_uuid, t.asset_id, kv.key, t.target_hour DESC
    )
    SELECT l.site_uuid, l.asset_id, l.param, l.raw,
           e.name AS equipment_name,
           p.display_label, p.unit, p.min_value, p.max_value,
           -- Text metrics ('OK', 'YES') are not comparable to a band; only
           -- something that parses as a number is evaluated.
           CASE WHEN l.raw ~ '^-?[0-9]+\.?[0-9]*$'
                THEN l.raw::double precision END AS num
      FROM latest l
      JOIN public.equipment_registry e
        ON e.equipment_id = l.asset_id AND e.site_uuid = l.site_uuid
      JOIN public.equipment_parameters p
        ON (p.equipment_id = e.equipment_id
            OR p.template_id = e.template_id)
       AND l.param = COALESCE(e.metric_prefix, e.equipment_id) || '_' || p.parameter_name
     WHERE p.is_active
       AND (p.min_value IS NOT NULL OR p.max_value IS NOT NULL)
  LOOP
    CONTINUE WHEN r.num IS NULL;

    out_equipment  := r.equipment_name;
    out_parameter  := COALESCE(r.display_label, r.param);
    out_value      := r.num;
    out_severity   := public.severity_from_excursion(r.num, r.min_value, r.max_value);
    out_raised     := false;
    out_source_ref := r.asset_id || '.' || r.param;

    CONTINUE WHEN out_severity IS NULL;   -- within band

    SELECT count(*) INTO v_before FROM public.work_items
     WHERE site_uuid = r.site_uuid AND source_kind = 'THRESHOLD'
       AND source_ref = r.asset_id || '.' || r.param
       AND state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS');

    v_id := public.raise_work_item(
      p_site_uuid   => r.site_uuid,
      -- Written as an instruction, not a measurement. "Inspect X" tells someone
      -- what to do; "temperature 38" leaves them to work it out.
      p_title       => 'Inspect ' || r.equipment_name || ' — '
                       || COALESCE(r.display_label, r.param) || ' out of range',
      p_severity    => out_severity,
      p_kind        => 'FAULT',
      p_detail      => 'Recorded ' || r.num || COALESCE(' ' || r.unit, '')
                       || ', expected '
                       || COALESCE(r.min_value::text, '–') || ' to '
                       || COALESCE(r.max_value::text, '–')
                       || COALESCE(' ' || r.unit, '')
                       || '. Raised automatically from the reading logged for '
                       || r.equipment_name || '.',
      p_origin      => 'SYSTEM',
      p_source_kind => 'THRESHOLD',
      p_source_ref  => r.asset_id || '.' || r.param
    );

    SELECT count(*) INTO v_after FROM public.work_items
     WHERE site_uuid = r.site_uuid AND source_kind = 'THRESHOLD'
       AND source_ref = r.asset_id || '.' || r.param
       AND state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS');

    out_raised := (v_after > v_before);
    RETURN NEXT;
  END LOOP;
END $$;

COMMENT ON FUNCTION public.evaluate_thresholds(uuid) IS
  'Compares the latest reading of every bounded parameter against its band and '
  'raises work for breaches. Idempotent: a breach that is still open is not '
  'raised again.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. AUTO-RESOLUTION
--
--    A reading that returns to normal closes its own ticket, with a note saying
--    why. Without this, a technician has to manually clear alarms the plant
--    already fixed, and within a week they stop trusting the queue.
--
--    Deliberately NOT applied to acknowledged or in-progress work: once a
--    person has picked something up, closing it under them destroys the record
--    of what they did.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.resolve_recovered_thresholds(p_site_uuid uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closed int := 0;
BEGIN
  -- Materialised first: evaluate_thresholds() has side effects (it raises work),
  -- so it must run exactly once rather than being re-executed per candidate row
  -- by the planner.
  CREATE TEMP TABLE IF NOT EXISTS _breached (source_ref text PRIMARY KEY) ON COMMIT DROP;
  DELETE FROM _breached;

  INSERT INTO _breached (source_ref)
  SELECT DISTINCT r.out_source_ref
    FROM public.evaluate_thresholds(p_site_uuid) r
   WHERE r.out_severity IS NOT NULL AND r.out_source_ref IS NOT NULL;

  UPDATE public.work_items w
     SET state = 'RESOLVED',
         resolved_at = now(),
         resolution_note = 'Reading returned to its expected range. Closed automatically.'
   WHERE w.source_kind = 'THRESHOLD'
     -- OPEN only. Once someone has acknowledged or started work, closing it
     -- under them destroys the record of what they did.
     AND w.state = 'OPEN'
     AND w.origin = 'SYSTEM'
     AND (p_site_uuid IS NULL OR w.site_uuid = p_site_uuid)
     AND w.source_ref IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM _breached b WHERE b.source_ref = w.source_ref);

  GET DIAGNOSTICS v_closed = ROW_COUNT;
  RETURN v_closed;
END $$;

GRANT EXECUTE ON FUNCTION public.evaluate_thresholds(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_recovered_thresholds(uuid) TO authenticated;

COMMIT;


-- ==========================================
-- MIGRATION: 20260821_sla_rollup.sql
-- ==========================================
-- ═══════════════════════════════════════════════════════════════════════════
-- 20260821_sla_rollup.sql
-- DCIMe V2 — Technical -> Admin
--
-- The second missing link from the V2 document: a technician's work becomes
-- management's numbers. V1 has incidents and it has an executive dashboard, but
-- nothing between them — nobody's fault ever became anybody's cost (audit G-02).
--
-- Everything here reads the work item spine. No new source of truth: if the
-- queue and the boardroom ever disagree, one of them is lying, and the surest
-- way to prevent that is to give them one table.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
-- It does not invent a currency figure. Cost needs vendor rates, labour rates
-- and parts, none of which exist yet (audit A-06). Reporting engineer-hours and
-- letting a manager apply their own rate is honest; inventing "$4,200" is not.
--
-- Depends on: 20260820_work_items.sql
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. SLA PERFORMANCE
--
--    MTTA and MTTR are reported SEPARATELY because they fail for different
--    reasons and have different fixes. Slow acknowledgement is a staffing or
--    notification problem; slow resolution is a skills, parts or access
--    problem. A single blended "response time" hides which one you have.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_sla_performance(
  p_site_uuid uuid    DEFAULT NULL,
  p_since     timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH scope AS (
    SELECT w.*
      FROM public.work_items w
     WHERE (p_site_uuid IS NULL OR w.site_uuid = p_site_uuid)
       AND w.created_at >= COALESCE(p_since, now() - interval '30 days')
  ),
  closed AS (
    SELECT * FROM scope WHERE state IN ('RESOLVED','CLOSED')
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'window_from',  COALESCE(p_since, now() - interval '30 days'),

    'open_total',    (SELECT count(*) FROM scope WHERE state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS')),
    'unassigned',    (SELECT count(*) FROM scope WHERE assignee_id IS NULL
                                              AND state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS')),
    -- Unacknowledged work is nobody's. Counted separately because it is the
    -- number that says whether anyone is actually watching the queue.
    'unacknowledged',(SELECT count(*) FROM scope WHERE acknowledged_at IS NULL
                                              AND state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS')),

    'breached_now',  (SELECT count(*) FROM scope
                       WHERE state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS')
                         AND now() > resolve_by),

    'by_severity', COALESCE((
      SELECT jsonb_object_agg(sev, cnt) FROM (
        SELECT severity AS sev, count(*) AS cnt FROM scope
         WHERE state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS')
         GROUP BY severity) x), '{}'::jsonb),

    -- Minutes to first acknowledgement.
    'mtta_minutes', (SELECT round(avg(EXTRACT(EPOCH FROM (acknowledged_at - created_at))/60)::numeric, 1)
                       FROM scope WHERE acknowledged_at IS NOT NULL),
    -- Minutes to resolution.
    'mttr_minutes', (SELECT round(avg(EXTRACT(EPOCH FROM (resolved_at - created_at))/60)::numeric, 1)
                       FROM closed WHERE resolved_at IS NOT NULL),

    'resolved_in_window', (SELECT count(*) FROM closed),
    'met_target',         (SELECT count(*) FROM closed WHERE resolved_at <= resolve_by),
    'compliance_pct', COALESCE((
      SELECT round(100.0 * count(*) FILTER (WHERE resolved_at <= resolve_by)
                   / NULLIF(count(*), 0), 1) FROM closed), NULL),

    -- Engineer-hours, not currency. See the header.
    'engineer_hours', COALESCE((
      SELECT round(sum(EXTRACT(EPOCH FROM (resolved_at - COALESCE(acknowledged_at, created_at)))/3600)::numeric, 1)
        FROM closed WHERE resolved_at IS NOT NULL), 0),

    'origin_mix', COALESCE((
      SELECT jsonb_object_agg(o, c) FROM (
        SELECT origin AS o, count(*) AS c FROM scope GROUP BY origin) y), '{}'::jsonb)
  );
$$;

COMMENT ON FUNCTION public.get_sla_performance(uuid, timestamptz) IS
  'Management view of the work queue. Reads work_items only, so the queue and '
  'the boardroom cannot disagree.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. WHAT IS BREACHING, AND WHY
--
--    A count tells a manager there is a problem. This tells them which one, so
--    the dashboard produces a decision rather than a feeling.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_sla_breaches(p_site_uuid uuid DEFAULT NULL)
RETURNS TABLE (
  out_id            uuid,
  out_title         text,
  out_severity      text,
  out_state         text,
  out_assignee      text,
  out_overdue_hours numeric,
  out_origin        text,
  out_kind          text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT w.id, w.title, w.severity, w.state,
         COALESCE(e.full_name, 'Unassigned'),
         round((EXTRACT(EPOCH FROM (now() - w.resolve_by)) / 3600)::numeric, 1),
         w.origin, w.kind
    FROM public.work_items w
    LEFT JOIN public.employees e ON e.id = w.assignee_id
   WHERE (p_site_uuid IS NULL OR w.site_uuid = p_site_uuid)
     AND w.state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS')
     AND now() > w.resolve_by
   -- Worst breach first: a manager reading three rows should be reading the
   -- three that matter.
   ORDER BY (now() - w.resolve_by) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_sla_performance(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sla_breaches(uuid) TO authenticated;

COMMIT;


-- ==========================================
-- MIGRATION: 20260822_contractor_findings.sql
-- ==========================================
-- ═══════════════════════════════════════════════════════════════════════════
-- 20260822_contractor_findings.sql
-- DCIMe V2 — contractor findings become trackable work
--
-- V1 records a contractor visit correctly — purpose, target, who logged it —
-- and rightly refuses to close a ticket just because someone looked at it
-- (audit A-04, a distinction most systems get wrong). But what the contractor
-- FOUND lands in one free-text notes blob (audit A-05).
--
-- A contractor who identifies three new defects during a service visit produces
-- one paragraph. Nothing becomes trackable, nothing gets a severity, nothing
-- appears on any list of outstanding work, and nobody is accountable for any of
-- it. The next visit rediscovers the same defects.
--
-- A finding is a defect somebody must act on — which is a work item. So this
-- adds a thin findings table that raises work through the same spine, rather
-- than a second parallel system with its own states and its own queue.
--
-- Also adds the vendor registry (audit A-06): contractors are currently
-- free-text, so "Cummins", "Cummins Zambia" and "cummins engineers" are three
-- different companies to the system, and "how often has this vendor been out
-- this quarter" is unanswerable.
--
-- Depends on: 20260820_work_items.sql
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. VENDOR REGISTRY
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.vendors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  -- Lowercased, punctuation stripped. This is what makes "Cummins Zambia" and
  -- "cummins  zambia" the same company without forcing anyone to type exactly.
  normalised    text NOT NULL,
  contact_name  text,
  contact_phone text,
  contact_email text,
  speciality    text,
  -- Contracted response target in hours. NULL means no agreement exists, which
  -- is different from an agreement of zero and must stay distinguishable.
  sla_hours     integer,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vendors_normalised ON public.vendors (normalised);

CREATE OR REPLACE FUNCTION public.normalise_vendor(p_name text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(lower(trim(coalesce(p_name,''))), '[^a-z0-9]+', '', 'g');
$$;

-- Backfill from the free-text names already recorded, so the registry starts
-- populated rather than empty and ignored.
INSERT INTO public.vendors (name, normalised)
SELECT DISTINCT ON (public.normalise_vendor(v.contractor))
       trim(v.contractor), public.normalise_vendor(v.contractor)
  FROM public.contractor_visits v
 WHERE coalesce(trim(v.contractor),'') <> ''
   AND public.normalise_vendor(v.contractor) <> ''
 ORDER BY public.normalise_vendor(v.contractor), trim(v.contractor)
ON CONFLICT (normalised) DO NOTHING;

-- Link visits to the registry without breaking the existing free-text column:
-- old rows keep working, new rows resolve to a real company.
ALTER TABLE public.contractor_visits
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL;

UPDATE public.contractor_visits v
   SET vendor_id = ven.id
  FROM public.vendors ven
 WHERE v.vendor_id IS NULL
   AND ven.normalised = public.normalise_vendor(v.contractor);


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. FINDINGS
--
--    Deliberately thin. A finding is the OBSERVATION — what was seen, where,
--    how bad. The response to it is a work item, so severity, ownership,
--    deadlines and state live in one place instead of being modelled twice
--    and drifting apart.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.contractor_findings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id     uuid NOT NULL REFERENCES public.contractor_visits(id) ON DELETE CASCADE,
  site_uuid    uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,

  summary      text NOT NULL,
  detail       text,
  severity     text NOT NULL REFERENCES public.sla_targets(severity),
  equipment_id text REFERENCES public.equipment_registry(equipment_id) ON DELETE SET NULL,

  -- The work raised from it. Nullable: an observation worth recording is not
  -- always work worth scheduling, and forcing one would either fabricate jobs
  -- or suppress observations.
  work_item_id uuid REFERENCES public.work_items(id) ON DELETE SET NULL,

  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid
);

CREATE INDEX IF NOT EXISTS idx_findings_visit ON public.contractor_findings (visit_id);
CREATE INDEX IF NOT EXISTS idx_findings_site  ON public.contractor_findings (site_uuid, created_at DESC);


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. RECORDING A FINDING
--    One call: record the observation and raise the work it implies.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.record_contractor_finding(
  p_visit_id     uuid,
  p_summary      text,
  p_severity     text DEFAULT 'P3',
  p_detail       text DEFAULT NULL,
  p_equipment_id text DEFAULT NULL,
  p_raise_work    boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_site uuid; v_vendor text; v_finding uuid; v_work uuid;
BEGIN
  SELECT v.site_uuid, COALESCE(ven.name, v.contractor)
    INTO v_site, v_vendor
    FROM public.contractor_visits v
    LEFT JOIN public.vendors ven ON ven.id = v.vendor_id
   WHERE v.id = p_visit_id;

  IF v_site IS NULL THEN
    RAISE EXCEPTION 'No such contractor visit: %', p_visit_id;
  END IF;

  INSERT INTO public.contractor_findings
    (visit_id, site_uuid, summary, detail, severity, equipment_id)
  VALUES (p_visit_id, v_site, p_summary, p_detail, p_severity, p_equipment_id)
  RETURNING id INTO v_finding;

  IF p_raise_work THEN
    v_work := public.raise_work_item(
      p_site_uuid   => v_site,
      p_title       => p_summary,
      p_severity    => p_severity,
      p_kind        => 'FINDING',
      -- Attribution matters: work that came from an outside engineer should say
      -- so, because whoever picks it up has not seen what they saw.
      p_detail      => COALESCE(p_detail || E'\n\n', '')
                       || 'Raised from a finding by ' || COALESCE(v_vendor, 'a contractor')
                       || ' during a site visit.',
      p_origin      => 'CONTRACTOR',
      p_source_kind => 'FINDING',
      p_source_ref  => v_finding::text
    );
    UPDATE public.contractor_findings SET work_item_id = v_work WHERE id = v_finding;
  END IF;

  RETURN v_finding;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. VENDOR HISTORY
--    Answers "how often has this contractor been out, and what did they find" —
--    a question V1 cannot answer at all because vendors are typed by hand.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.vendor_activity AS
SELECT ven.id            AS vendor_id,
       ven.name          AS vendor_name,
       ven.speciality,
       ven.sla_hours,
       count(DISTINCT v.id)                                   AS visits,
       count(f.id)                                            AS findings,
       count(f.id) FILTER (WHERE f.severity IN ('P1','P2'))   AS serious_findings,
       count(w.id) FILTER (WHERE w.state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS'))
                                                              AS open_work,
       max(v.created_at)                                      AS last_visit
  FROM public.vendors ven
  LEFT JOIN public.contractor_visits    v ON v.vendor_id = ven.id
  LEFT JOIN public.contractor_findings  f ON f.visit_id  = v.id
  LEFT JOIN public.work_items           w ON w.id        = f.work_item_id
 GROUP BY ven.id, ven.name, ven.speciality, ven.sla_hours;


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. RLS
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.vendors             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_findings ENABLE ROW LEVEL SECURITY;

-- Vendors are shared reference data: the same company serves several sites.
DROP POLICY IF EXISTS "Vendors: authenticated read" ON public.vendors;
CREATE POLICY "Vendors: authenticated read"
  ON public.vendors FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Vendors: admin write" ON public.vendors;
CREATE POLICY "Vendors: admin write"
  ON public.vendors FOR ALL
  USING (public.get_my_role() = 'ADMIN')
  WITH CHECK (public.get_my_role() = 'ADMIN');

DROP POLICY IF EXISTS "Findings: site-scoped read" ON public.contractor_findings;
CREATE POLICY "Findings: site-scoped read"
  ON public.contractor_findings FOR SELECT
  USING (auth.role() = 'authenticated' AND site_uuid = public.get_my_site_uuid());

DROP POLICY IF EXISTS "Findings: site-scoped insert" ON public.contractor_findings;
CREATE POLICY "Findings: site-scoped insert"
  ON public.contractor_findings FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND site_uuid = public.get_my_site_uuid());

GRANT EXECUTE ON FUNCTION public.record_contractor_finding(uuid,text,text,text,text,boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalise_vendor(text) TO authenticated;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. KEEPING THE REGISTRY ALIVE
--
--    The backfill above only fixes history. Without this, every visit logged
--    afterwards carries a null vendor_id and the registry decays back into the
--    free-text mess it was built to replace — which is how vendor registries
--    usually die: populated once, never maintained.
--
--    Resolving on write rather than asking the technician to pick from a list
--    keeps the field exactly as forgiving as it is today, while still producing
--    one row per real company.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.resolve_visit_vendor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_norm text;
  v_id   uuid;
BEGIN
  IF NEW.vendor_id IS NOT NULL THEN RETURN NEW; END IF;

  v_norm := public.normalise_vendor(NEW.contractor);
  IF v_norm = '' THEN RETURN NEW; END IF;

  SELECT id INTO v_id FROM public.vendors WHERE normalised = v_norm;

  IF v_id IS NULL THEN
    -- First sighting of this company. Created with only a name: a registry that
    -- demands contact details up front is one a technician routes around.
    INSERT INTO public.vendors (name, normalised)
    VALUES (trim(NEW.contractor), v_norm)
    ON CONFLICT (normalised) DO UPDATE SET name = public.vendors.name
    RETURNING id INTO v_id;
  END IF;

  NEW.vendor_id := v_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_resolve_visit_vendor ON public.contractor_visits;
CREATE TRIGGER trg_resolve_visit_vendor
  BEFORE INSERT OR UPDATE OF contractor ON public.contractor_visits
  FOR EACH ROW EXECUTE FUNCTION public.resolve_visit_vendor();

-- Link anything logged between the backfill and this trigger.
UPDATE public.contractor_visits v
   SET vendor_id = ven.id
  FROM public.vendors ven
 WHERE v.vendor_id IS NULL
   AND ven.normalised = public.normalise_vendor(v.contractor);


-- ==========================================
-- MIGRATION: 20260823_preventive_schedules.sql
-- ==========================================
-- ═══════════════════════════════════════════════════════════════════════════
-- 20260823_preventive_schedules.sql
-- DCIMe V2 — planned maintenance raises itself
--
-- The audit's G-03: no PM calendar, no service intervals, no run-hour triggers
-- — "despite collecting cumulative_hrs hourly". Every generator here reports
-- its cumulative run hours on every round, and nothing has ever read them.
--
-- So a 250-hour service depends on somebody remembering. It is the clearest
-- case in the whole system of data captured but never governed.
--
-- RUN HOURS, NOT THE CALENDAR. A generator that ran 400 hours in a month needs
-- servicing sooner than one that ran 12, and a monthly reminder is wrong in
-- both directions — early enough to waste a visit, late enough to miss a
-- failure. Calendar intervals are supported too, for things that genuinely age
-- with time rather than use.
--
-- Depends on: 20260820_work_items.sql
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. SCHEDULES
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.maintenance_schedules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_uuid     uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,

  -- Attach to one machine, or to every instance of a template. A "250-hour
  -- generator service" is a property of the model, not of one unit, and
  -- writing it per machine guarantees the fleet drifts out of step.
  equipment_id  text REFERENCES public.equipment_registry(equipment_id) ON DELETE CASCADE,
  template_id   text REFERENCES public.equipment_templates(template_id) ON DELETE CASCADE,

  task          text NOT NULL,
  detail        text,
  severity      text NOT NULL DEFAULT 'P3' REFERENCES public.sla_targets(severity),

  -- ── The trigger ────────────────────────────────────────────────────────
  --   RUN_HOURS : fires when the meter passes last_done + interval_hours
  --   CALENDAR  : fires when interval_days have elapsed
  basis         text NOT NULL,
  interval_hours integer,
  interval_days  integer,
  -- The metric carrying the running total, e.g. 'cumulative_hrs'. Suffixed onto
  -- the equipment's metric prefix, so it survives equipment being renamed.
  hours_metric  text,

  -- ── Last completion ────────────────────────────────────────────────────
  last_done_at    timestamptz,
  last_done_hours double precision,

  -- Raise the job before it is due, so it can be planned rather than scrambled.
  lead_hours    integer NOT NULL DEFAULT 24,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sched_basis_check CHECK (basis IN ('RUN_HOURS','CALENDAR')),
  -- Exactly one target: both would double-raise, neither is unattached.
  CONSTRAINT sched_target_check CHECK (num_nonnulls(equipment_id, template_id) = 1),
  -- A basis with no interval is a schedule that can never fire.
  CONSTRAINT sched_interval_check CHECK (
    (basis = 'RUN_HOURS' AND interval_hours IS NOT NULL AND hours_metric IS NOT NULL)
    OR (basis = 'CALENDAR' AND interval_days IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_schedules_site
  ON public.maintenance_schedules (site_uuid) WHERE is_active;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. WHAT IS DUE
--
--    Resolves template schedules onto every matching machine, reads each one's
--    latest meter, and reports how much life is left.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.maintenance_due AS
WITH expanded AS (
  -- One row per (schedule, machine): a template schedule fans out across the
  -- fleet, an equipment schedule stays as one.
  SELECT s.*, e.equipment_id AS target_equipment, e.name AS equipment_name,
         COALESCE(e.metric_prefix, e.equipment_id) AS prefix
    FROM public.maintenance_schedules s
    JOIN public.equipment_registry e
      ON (s.equipment_id = e.equipment_id
          OR (s.template_id IS NOT NULL AND e.template_id = s.template_id
              AND e.site_uuid = s.site_uuid))
   WHERE s.is_active AND e.is_active
),
metered AS (
  SELECT x.*,
         (SELECT (t.metrics ->> (x.prefix || '_' || x.hours_metric))::double precision
            FROM public.telemetry_logs t
           WHERE t.site_uuid = x.site_uuid
             AND t.asset_id = x.target_equipment
             AND t.metrics ? (x.prefix || '_' || x.hours_metric)
             -- Latest by the hour it describes, so a backdated entry cannot
             -- masquerade as the current meter reading.
           ORDER BY t.target_hour DESC LIMIT 1) AS current_hours
    FROM expanded x
   WHERE x.basis = 'RUN_HOURS'
  UNION ALL
  SELECT x.*, NULL::double precision FROM expanded x WHERE x.basis = 'CALENDAR'
)
SELECT m.id AS schedule_id, m.site_uuid, m.target_equipment, m.equipment_name,
       m.task, m.detail, m.severity, m.basis, m.lead_hours,
       m.current_hours,
       m.last_done_hours, m.last_done_at,

       CASE WHEN m.basis = 'RUN_HOURS'
            -- Never serviced: treat the meter itself as elapsed life.
            THEN COALESCE(m.last_done_hours, 0) + m.interval_hours
       END AS due_at_hours,

       CASE WHEN m.basis = 'RUN_HOURS' AND m.current_hours IS NOT NULL
            THEN (COALESCE(m.last_done_hours, 0) + m.interval_hours) - m.current_hours
       END AS hours_remaining,

       CASE WHEN m.basis = 'CALENDAR'
            THEN COALESCE(m.last_done_at, m.created_at) + make_interval(days => m.interval_days)
       END AS due_date,

       CASE
         WHEN m.basis = 'RUN_HOURS' AND m.current_hours IS NULL THEN 'no-meter'
         WHEN m.basis = 'RUN_HOURS'
              AND m.current_hours >= COALESCE(m.last_done_hours,0) + m.interval_hours THEN 'due'
         WHEN m.basis = 'RUN_HOURS'
              AND m.current_hours >= COALESCE(m.last_done_hours,0) + m.interval_hours - m.lead_hours THEN 'due-soon'
         WHEN m.basis = 'CALENDAR'
              AND now() >= COALESCE(m.last_done_at, m.created_at) + make_interval(days => m.interval_days) THEN 'due'
         WHEN m.basis = 'CALENDAR'
              AND now() >= COALESCE(m.last_done_at, m.created_at) + make_interval(days => m.interval_days)
                          - make_interval(hours => m.lead_hours) THEN 'due-soon'
         ELSE 'ok'
       END AS status
  FROM metered m;

COMMENT ON VIEW public.maintenance_due IS
  'Every schedule resolved onto its machine with remaining life. status is '
  'ok | due-soon | due | no-meter. no-meter means the schedule is blind, which '
  'is a data problem, not a healthy machine.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. RAISING PLANNED WORK
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.raise_due_maintenance(p_site_uuid uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d       record;
  v_count int := 0;
  v_id    uuid;
BEGIN
  FOR d IN
    SELECT * FROM public.maintenance_due
     WHERE status IN ('due','due-soon')
       AND (p_site_uuid IS NULL OR site_uuid = p_site_uuid)
  LOOP
    -- Keyed on schedule + machine, so a fleet-wide schedule raises one job per
    -- generator rather than one job for all of them.
    v_id := public.raise_work_item(
      p_site_uuid   => d.site_uuid,
      p_title       => d.task || ' — ' || d.equipment_name,
      p_severity    => d.severity,
      p_kind        => 'PREVENTIVE',
      p_detail      => COALESCE(d.detail || E'\n\n', '')
                       || CASE
                            WHEN d.basis = 'RUN_HOURS' THEN
                              'Meter reads ' || round(d.current_hours::numeric, 1)
                              || ' hours; service due at ' || round(d.due_at_hours::numeric, 1) || '.'
                            ELSE
                              'Scheduled every ' || d.lead_hours || 'h lead, due ' || d.due_date::date || '.'
                          END,
      p_origin      => 'SYSTEM',
      p_source_kind => 'SCHEDULE',
      p_source_ref  => d.schedule_id::text || '.' || d.target_equipment
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. COMPLETION RESETS THE CLOCK
--
--    Without this the schedule fires forever: the job is closed, the meter is
--    still past the threshold, and the next evaluation raises it again. The
--    completion has to move the baseline, which is the whole point of recording
--    that a service happened.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.complete_maintenance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_sched uuid;
  v_equip text;
  v_hours double precision;
BEGIN
  IF NEW.state <> 'RESOLVED' OR OLD.state = 'RESOLVED' THEN RETURN NEW; END IF;
  IF NEW.source_kind <> 'SCHEDULE' OR NEW.source_ref IS NULL THEN RETURN NEW; END IF;

  v_sched := split_part(NEW.source_ref, '.', 1)::uuid;
  v_equip := split_part(NEW.source_ref, '.', 2);

  SELECT d.current_hours INTO v_hours
    FROM public.maintenance_due d
   WHERE d.schedule_id = v_sched AND d.target_equipment = v_equip;

  UPDATE public.maintenance_schedules
     SET last_done_at    = now(),
         -- Baselined against the meter AT COMPLETION, not the threshold that
         -- triggered it. A service done 40 hours late must not silently shorten
         -- the next interval by 40 hours.
         last_done_hours = COALESCE(v_hours, last_done_hours)
   WHERE id = v_sched;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_complete_maintenance ON public.work_items;
CREATE TRIGGER trg_complete_maintenance
  AFTER UPDATE OF state ON public.work_items
  FOR EACH ROW EXECUTE FUNCTION public.complete_maintenance();


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. RLS
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.maintenance_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Schedules: site-scoped read" ON public.maintenance_schedules;
CREATE POLICY "Schedules: site-scoped read"
  ON public.maintenance_schedules FOR SELECT
  USING (auth.role() = 'authenticated' AND site_uuid = public.get_my_site_uuid());

DROP POLICY IF EXISTS "Schedules: admin write" ON public.maintenance_schedules;
CREATE POLICY "Schedules: admin write"
  ON public.maintenance_schedules FOR ALL
  USING (public.get_my_role() = 'ADMIN' AND site_uuid = public.get_my_site_uuid())
  WITH CHECK (public.get_my_role() = 'ADMIN' AND site_uuid = public.get_my_site_uuid());

GRANT EXECUTE ON FUNCTION public.raise_due_maintenance(uuid) TO authenticated;

COMMIT;


-- ==========================================
-- MIGRATION: 20260824_scheduled_jobs.sql
-- ==========================================
-- ═══════════════════════════════════════════════════════════════════════════
-- 20260824_scheduled_jobs.sql
-- DCIMe V2 — the automatic behaviour actually runs
--
-- Threshold evaluation, maintenance due-dates and the silence alarm all work,
-- and none of them run on their own. A capability nobody triggers is a
-- capability nobody has: the system would still only notice a problem when a
-- human went looking, which is exactly the V1 behaviour all of it replaces.
--
-- pg_cron runs inside the database, so there is no server to keep alive, no
-- token to rotate, and nothing to forget to redeploy.
--
-- CADENCE. Each of these reads recent rows and writes at most a handful of work
-- items, so cost is not the constraint — usefulness is:
--   thresholds   every 15 min  · readings arrive hourly at best, so this is
--                               responsive without being pointless
--   maintenance  daily 06:00   · a service due date does not move hour to hour,
--                               and a job appearing before the shift starts is
--                               more useful than one appearing at 03:00
--   silence      every 15 min  · matches the shortest grace window a site can
--                               sensibly configure
--
-- SAFE TO RE-RUN: each schedule is unscheduled before being recreated, so this
-- migration cannot accumulate duplicate jobs.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- pg_cron lives in its own schema and must be enabled once per database.
-- On Supabase this requires the extension to be available to the project; if it
-- is not, everything below is skipped rather than failing the migration, and
-- the functions can still be called by hand or from an external scheduler.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not available on this database.';
    RAISE NOTICE 'The evaluation functions still work; schedule them externally:';
    RAISE NOTICE '  SELECT public.evaluate_thresholds();          -- every 15 min';
    RAISE NOTICE '  SELECT public.resolve_recovered_thresholds(); -- every 15 min';
    RAISE NOTICE '  SELECT public.raise_due_maintenance();        -- daily';
    RAISE NOTICE '  SELECT public.check_ingestion_health();       -- every 15 min';
    RETURN;
  END IF;

  CREATE EXTENSION IF NOT EXISTS pg_cron;

  -- ── Thresholds ────────────────────────────────────────────────────────
  -- Recovery runs BEFORE evaluation in the same statement: a reading that has
  -- returned to normal should clear its job in the same cycle that would
  -- otherwise leave it sitting in the queue looking unresolved.
  PERFORM cron.unschedule('dcime_thresholds')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dcime_thresholds');
  PERFORM cron.schedule(
    'dcime_thresholds',
    '*/15 * * * *',
    $job$
      SELECT public.resolve_recovered_thresholds();
      SELECT count(*) FROM public.evaluate_thresholds();
    $job$
  );

  -- ── Preventive maintenance ────────────────────────────────────────────
  PERFORM cron.unschedule('dcime_maintenance')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dcime_maintenance');
  PERFORM cron.schedule(
    'dcime_maintenance',
    '0 6 * * *',
    $job$ SELECT public.raise_due_maintenance(); $job$
  );

  -- ── Silence ───────────────────────────────────────────────────────────
  PERFORM cron.unschedule('dcime_ingestion_health')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dcime_ingestion_health');
  PERFORM cron.schedule(
    'dcime_ingestion_health',
    '*/15 * * * *',
    $job$ SELECT public.check_ingestion_health(); $job$
  );

  RAISE NOTICE 'Scheduled: thresholds (15 min), maintenance (daily 06:00), silence (15 min).';
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- VISIBILITY
--
-- A scheduled job that silently stops is worse than one that never existed —
-- the system looks like it is watching when it is not. This view makes the
-- schedule and its last outcome inspectable from the application.
-- ═══════════════════════════════════════════════════════════════════════════
-- Built with EXECUTE and guarded: cron.job does not exist when pg_cron is
-- unavailable, and a plain CREATE VIEW would fail at parse time — undoing the
-- graceful handling above and taking the whole migration down with it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'cron' AND table_name = 'job') THEN
    EXECUTE $view$
      CREATE OR REPLACE VIEW public.scheduled_job_status AS
      SELECT j.jobname, j.schedule, j.active,
             r.status AS last_status, r.start_time AS last_run, r.return_message
        FROM cron.job j
        LEFT JOIN LATERAL (
          SELECT status, start_time, return_message
            FROM cron.job_run_details d
           WHERE d.jobid = j.jobid
           ORDER BY d.start_time DESC LIMIT 1
        ) r ON true
       WHERE j.jobname LIKE 'dcime_%';
    $view$;
  ELSE
    -- A stand-in with the same shape, so the application can query one name
    -- regardless. No rows means nothing is scheduled — which is the truth.
    EXECUTE $view$
      CREATE OR REPLACE VIEW public.scheduled_job_status AS
      SELECT NULL::text AS jobname, NULL::text AS schedule, NULL::boolean AS active,
             NULL::text AS last_status, NULL::timestamptz AS last_run,
             NULL::text AS return_message
       WHERE false;
    $view$;
  END IF;
END $$;

COMMENT ON VIEW public.scheduled_job_status IS
  'The DCIMe background jobs and their last outcome. Empty means pg_cron is not '
  'enabled and the evaluation functions are being triggered externally, if at all.';

COMMIT;


-- ==========================================
-- MIGRATION: 20260825_neutral_identifiers.sql
-- ==========================================
-- ═══════════════════════════════════════════════════════════════════════════
-- 20260825_neutral_identifiers.sql
-- DCIMe V2 — remove the last operator-specific identifiers
--
-- The display layer was made neutral early on: every label a person reads comes
-- through branding.ts. What survived were WIRE VALUES — identifiers stored in
-- rows and matched by code — which were left alone at the time because renaming
-- them orphans the data that references them.
--
-- This renames the data too, so nothing operator-specific is left anywhere:
--
--   sites.site_code                'NTC' -> 'SITE_01', 'WTC' -> 'SITE_02', 'KTC' -> 'SITE_03'
--   telemetry_logs.asset_id        'AIRTEL_DAILY_CHECKLIST' -> 'DAILY_CHECKLIST'
--   telemetry_logs.metrics key     'airtelSpoc' -> 'clientSpoc'
--
-- ORDER MATTERS. The data moves first and the code follows in the same change;
-- deploying either alone leaves the application looking for identifiers that no
-- longer exist.
--
-- Everything is keyed on uuid rather than these strings, so no foreign key is
-- affected — site_code is a human-facing code, not a join key.
--
-- Idempotent: safe to re-run, and safe on a database where some or all of the
-- renames have already happened.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Site codes ─────────────────────────────────────────────────────────
-- Guarded individually: a database may hold any subset of these.
UPDATE public.sites SET site_code = 'SITE_01' WHERE site_code = 'NTC';
UPDATE public.sites SET site_code = 'SITE_02' WHERE site_code = 'WTC';
UPDATE public.sites SET site_code = 'SITE_03' WHERE site_code = 'KTC';

-- Legacy free-text site references on employees, from before site_uuid existed.
UPDATE public.employees SET site_id = 'Site 1' WHERE site_id IN ('NTC', 'NTC ZM 0874', 'NTC ZM-0874');
UPDATE public.employees SET site_id = 'Site 2' WHERE site_id IN ('WTC', 'WTC ZM 0875');
UPDATE public.employees SET site_id = 'Site 3' WHERE site_id IN ('KTC', 'KTC ZM 0876');


-- ── 2. The daily checklist asset id ───────────────────────────────────────
-- Every archived checklist is stored against this id. Renaming the constant in
-- code without moving the rows would hide the entire history.
UPDATE public.telemetry_logs
   SET asset_id = 'DAILY_CHECKLIST'
 WHERE asset_id = 'AIRTEL_DAILY_CHECKLIST';

UPDATE public.equipment_registry
   SET equipment_id = 'DAILY_CHECKLIST'
 WHERE equipment_id = 'AIRTEL_DAILY_CHECKLIST';


-- ── 3. The SPOC signature block ───────────────────────────────────────────
-- Newer checklists already write clientSpoc; older ones carry airtelSpoc. This
-- moves the old key across so the read no longer needs a fallback, and drops
-- the old one only after the copy succeeds.
UPDATE public.telemetry_logs
   SET metrics = (metrics - 'airtelSpoc')
                 || jsonb_build_object('clientSpoc', metrics -> 'airtelSpoc')
 WHERE metrics ? 'airtelSpoc'
   AND NOT metrics ? 'clientSpoc';

-- Rows carrying BOTH: the newer key wins and the stale one is dropped.
UPDATE public.telemetry_logs
   SET metrics = metrics - 'airtelSpoc'
 WHERE metrics ? 'airtelSpoc' AND metrics ? 'clientSpoc';


-- ── 4. Report ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_sites int; v_checklists int; v_spoc int;
BEGIN
  SELECT count(*) INTO v_sites FROM public.sites
   WHERE site_code IN ('NTC','WTC','KTC');
  SELECT count(*) INTO v_checklists FROM public.telemetry_logs
   WHERE asset_id = 'AIRTEL_DAILY_CHECKLIST';
  SELECT count(*) INTO v_spoc FROM public.telemetry_logs
   WHERE metrics ? 'airtelSpoc';

  RAISE NOTICE 'Remaining operator-specific identifiers:';
  RAISE NOTICE '  site codes      : %', v_sites;
  RAISE NOTICE '  checklist rows  : %', v_checklists;
  RAISE NOTICE '  airtelSpoc keys : %', v_spoc;

  IF v_sites + v_checklists + v_spoc > 0 THEN
    RAISE EXCEPTION 'Rename incomplete — % identifier(s) still present',
      v_sites + v_checklists + v_spoc;
  END IF;

  RAISE NOTICE 'Clean.';
END $$;

COMMIT;


-- ==========================================
-- MIGRATION: 20260827_signatures.sql
-- ==========================================
-- ═══════════════════════════════════════════════════════════════════════════
-- 20260827_signatures.sql
-- DCIMe V2 — handwritten signatures
--
-- V1 recorded a signature as a checkbox plus SIG-{timestamp}-{random}, and the
-- success screen told the technician their records had been "signed digitally
-- and archived into the immutable ledger". Neither half was true: nothing was
-- signed, and shift_reports rows stay UPDATE-able (audit C-03).
--
-- This stores the actual mark. It is still not a cryptographic signature and
-- the copy has been corrected to stop claiming otherwise — but a drawing a
-- person made, with a timestamp, is evidence a checkbox never was, and it can
-- be shown on a printed handover.
--
-- STORED AS A DATA URL IN A TEXT COLUMN. A signature is a few kilobytes of
-- PNG, so a column keeps it in the same row as the record it signs — no bucket
-- to configure, no second fetch, and no way for the image to go missing while
-- the record survives. Move it to object storage if signatures ever grow.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.shift_reports
  ADD COLUMN IF NOT EXISTS signature_image text,
  ADD COLUMN IF NOT EXISTS signed_at       timestamptz;

COMMENT ON COLUMN public.shift_reports.signature_image IS
  'Handwritten signature as a PNG data URL. NULL for records predating capture.';
COMMENT ON COLUMN public.shift_reports.signed_at IS
  'When the signature was drawn — distinct from the row timestamp, which is '
  'when the report was submitted.';

-- The daily checklist carries two signatories: the maintenance partner and the
-- client representative. Both were free-text names.
ALTER TABLE public.telemetry_logs
  ADD COLUMN IF NOT EXISTS signature_image text,
  ADD COLUMN IF NOT EXISTS signed_at       timestamptz;

-- Work items are signed off on completion, so a resolution can be attributed
-- to a person rather than to an account.
ALTER TABLE public.work_items
  ADD COLUMN IF NOT EXISTS signature_image text;

COMMIT;


