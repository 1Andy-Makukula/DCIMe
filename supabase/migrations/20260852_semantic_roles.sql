-- ═══════════════════════════════════════════════════════════════════════════
-- 20260852_semantic_roles.sql
-- DCIMe V2.1 — Stage 5: how a calculation finds the reading it needs.
--
-- THE PROBLEM THIS SOLVES
-- Once an administrator can add parameters through the Inventory screen, a
-- calculation can no longer know what to look for. Fuel consumption needs "the
-- burn rate of this generator". If that is a row somebody typed and called
-- "Burn rate", or "burn_rate_lph", or "Fuel/hr", nothing can find it.
--
-- Matching on the NAME is exactly the fragility the last five stages removed:
--   media_ambient_temp             a Data Room sensor answering to no room
--   asset_id = 'facility_wide'     an equipment join that matched nothing, ever
--   equipment_id || '_' || param   a key rebuilt from a shape that never existed
-- Each was a string standing in for a relationship. Adding another would undo
-- the work.
--
-- A ROLE IS THE RELATIONSHIP, WRITTEN DOWN
-- semantic_role names what a parameter IS FOR, from a vocabulary the code
-- knows. Calculations ask for the role; the name becomes free text an admin can
-- write in whatever way makes sense on the floor.
--
-- The vocabulary below is deliberately small: every entry has a consumer in the
-- code TODAY, verified by reading it. A role nothing reads is a comment
-- pretending to be a constraint, so new ones arrive when a calculation needs
-- them, not in anticipation.
--
-- NAMEPLATE FACTS NEED NO NEW MACHINERY
-- capture_mode = 'CONSTANT' already means "not typed by a technician, has a
-- fixed value". A generator's burn rate is a CONSTANT parameter with the role
-- FUEL_BURN_RATE — the same table, the same editor, no special case. Which is
-- why 20260851's dedicated fuel_burn_rate_lph column is dropped below: it was
-- written before this was understood, and two ways to express one kind of fact
-- is how the drift started.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Retire the special case ─────────────────────────────────────────────
ALTER TABLE public.equipment_registry
  DROP CONSTRAINT IF EXISTS equipment_registry_burn_rate_check;
ALTER TABLE public.equipment_registry
  DROP COLUMN IF EXISTS fuel_burn_rate_lph;

-- ── 2. The role ────────────────────────────────────────────────────────────
ALTER TABLE public.equipment_parameters
  ADD COLUMN IF NOT EXISTS semantic_role text;

COMMENT ON COLUMN public.equipment_parameters.semantic_role IS
  'What this parameter is FOR, from a vocabulary the code reads. NULL for the '
  'great majority — a reading only needs a role when a calculation has to find '
  'it without knowing its name. Unique per asset: one generator has one burn '
  'rate.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'equipment_parameters_semantic_role_check') THEN
    ALTER TABLE public.equipment_parameters
      ADD CONSTRAINT equipment_parameters_semantic_role_check
      CHECK (semantic_role IS NULL OR semantic_role IN (
        -- Fuel: useExecutiveSummary derives consumption from run hours.
        'FUEL_BURN_RATE', 'RUN_HOURS_START', 'RUN_HOURS_STOP', 'FUEL_BURN_ACTUAL',
        -- PUE: facility load over IT load, per the workbook's definition.
        'FACILITY_LOAD_KW', 'UPS_OUTPUT_KW',
        'RECTIFIER_DC_VOLTAGE', 'RECTIFIER_DC_CURRENT',
        -- Rooms: the per-room figures this platform exists to produce.
        'AMBIENT_TEMP', 'AMBIENT_HUMIDITY',
        -- UPS health, shown on the executive summary.
        'UPS_BATTERY_PERCENT', 'UPS_USED_CAPACITY',
        -- Utility state.
        'GRID_STATUS'
      ));
  END IF;
END $$;

-- One asset cannot have two burn rates. Partial, because NULL is the norm.
CREATE UNIQUE INDEX IF NOT EXISTS uq_equipment_parameters_role
  ON public.equipment_parameters (equipment_id, semantic_role)
  WHERE semantic_role IS NOT NULL AND equipment_id IS NOT NULL;

-- ── 3. Tag what the code already reads ─────────────────────────────────────
-- Not guesswork: each name below was read out of the consuming code, and each
-- is unambiguous. ups_1_output_load_kw is the UPS 1 output in kW; there is
-- nothing to infer.
UPDATE public.equipment_parameters p
   SET semantic_role = v.role
  FROM (VALUES
    ('grid_total_site_load',         'FACILITY_LOAD_KW'),
    ('ups_1_output_load_kw',         'UPS_OUTPUT_KW'),
    ('ups_2_output_load_kw',         'UPS_OUTPUT_KW'),
    ('ups_1_battery_charge_percent', 'UPS_BATTERY_PERCENT'),
    ('ups_2_battery_charge_percent', 'UPS_BATTERY_PERCENT'),
    ('ups_1_used_capacity',          'UPS_USED_CAPACITY'),
    ('ups_2_used_capacity',          'UPS_USED_CAPACITY'),
    ('rectifier_1_dc_voltage',       'RECTIFIER_DC_VOLTAGE'),
    ('rectifier_2_dc_voltage',       'RECTIFIER_DC_VOLTAGE'),
    ('rectifier_1_amps',             'RECTIFIER_DC_CURRENT'),
    ('rectifier_2_amps',             'RECTIFIER_DC_CURRENT'),
    ('grid_status',                  'GRID_STATUS')
  ) AS v(param, role)
 WHERE p.parameter_name = v.param
   AND p.semantic_role IS DISTINCT FROM v.role;

-- Room ambient readings, by suffix — every one belongs to an ENVIRONMENT asset
-- and there is exactly one of each per room.
UPDATE public.equipment_parameters p
   SET semantic_role = CASE
         WHEN p.parameter_name LIKE '%\_ambient\_temp'     THEN 'AMBIENT_TEMP'
         ELSE 'AMBIENT_HUMIDITY' END
  FROM public.equipment_registry e
 WHERE e.equipment_id = p.equipment_id
   AND e.category = 'ENVIRONMENT'
   AND (p.parameter_name LIKE '%\_ambient\_temp' OR p.parameter_name LIKE '%\_ambient\_humidity')
   AND p.semantic_role IS NULL;

-- Generator run-hour meters, from which fuel consumption is derived.
UPDATE public.equipment_parameters p
   SET semantic_role = CASE
         WHEN p.parameter_name LIKE '%\_hr\_meter\_start'      THEN 'RUN_HOURS_START'
         WHEN p.parameter_name LIKE '%\_hr\_meter\_stop'       THEN 'RUN_HOURS_STOP'
         ELSE 'FUEL_BURN_ACTUAL' END
  FROM public.equipment_registry e
 WHERE e.equipment_id = p.equipment_id
   AND e.category = 'GENERATOR'
   AND (p.parameter_name LIKE '%\_hr\_meter\_start'
     OR p.parameter_name LIKE '%\_hr\_meter\_stop'
     OR p.parameter_name LIKE '%\_calculated\_fuel\_burn')
   AND p.semantic_role IS NULL;

-- FUEL_BURN_RATE is deliberately left unset. No such parameter exists yet — the
-- figure has been a hardcoded 150 L/h in the application, described in its own
-- comment as a placeholder. An administrator adds it per machine through the
-- Inventory screen, and until they do the platform says its fuel numbers are
-- estimates rather than presenting a guess as a measurement.

COMMIT;

-- ── 4. Finding a parameter by what it is for ───────────────────────────────
BEGIN;

CREATE OR REPLACE FUNCTION public.parameter_for_role(
  p_equipment_id text,
  p_role         text
)
RETURNS public.equipment_parameters
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT * FROM public.equipment_parameters
   WHERE equipment_id = p_equipment_id
     AND semantic_role = p_role
     AND is_active
   LIMIT 1
$$;

COMMENT ON FUNCTION public.parameter_for_role(text, text) IS
  'The parameter playing a given role on a given asset, or nothing. The one way '
  'a calculation should locate a reading it needs — never by name.';

GRANT EXECUTE ON FUNCTION public.parameter_for_role(text, text) TO authenticated;

COMMIT;

-- ── 5. Self-check ──────────────────────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  RAISE NOTICE 'roles assigned:';
  FOR r IN SELECT semantic_role, count(*) AS n
             FROM public.equipment_parameters
            WHERE semantic_role IS NOT NULL
            GROUP BY 1 ORDER BY 1
  LOOP
    RAISE NOTICE '  % : %', rpad(r.semantic_role, 22), r.n;
  END LOOP;

  RAISE NOTICE 'generators with a FUEL_BURN_RATE parameter: % of %',
    (SELECT count(DISTINCT p.equipment_id) FROM public.equipment_parameters p
      WHERE p.semantic_role = 'FUEL_BURN_RATE'),
    (SELECT count(*) FROM public.equipment_registry WHERE category = 'GENERATOR'
       AND site_uuid = (SELECT id FROM public.sites WHERE site_code = 'SITE_01'));
END $$;
