-- ═══════════════════════════════════════════════════════════════════════════
-- 20260873_parameter_units.sql
-- DCIMe V2.1 — putting units on the numbers.
--
-- Not one parameter carried a unit. Every figure on every screen and in every
-- printed report read as a bare number: "19.5" with nothing after it. On a
-- signed compliance document that is not a small thing — 54 volts and 54
-- degrees are the same character string.
--
-- USING THE UNIT REGISTER THAT ALREADY EXISTS
-- unit_definitions holds 36 units with dimensions and conversion factors, and
-- equipment_parameters.unit is a foreign key into it. So the codes below are
-- ITS codes — degC, not '°C'; hr, not 'h'; L/hr, not 'L/h'. A first pass at
-- this used the pretty forms and was correctly rejected by the constraint.
--
-- The register is also more precise than the obvious choice in two places:
--   %RH  distinguishes relative humidity from a bare percentage
--   pf   makes power factor a dimensioned ratio rather than a naked number
--
-- WHERE THESE COME FROM
-- The measure name plus the observed range, which together are decisive for
-- almost everything: a measure called *_temp averaging 19.5 across 24,236
-- readings is degrees Celsius and nothing else. Assigned by pattern so a new
-- parameter matching an existing measure inherits the unit rather than starting
-- blank again.
--
-- WHAT IS DELIBERATELY LEFT BLANK
-- oil_pressure. Genset gauges use bar and psi about equally, and all 3,191
-- readings are 0.0 so the data cannot cast a vote. Both codes exist in the
-- register, so this is one answer from site away — and it matters, because the
-- two differ by a factor of 14.5, which is the gap between a healthy engine
-- and a seized one.
--
-- Idempotent: safe to re-run. Existing non-null units are never overwritten, so
-- anything set by hand in Inventory wins over this pass.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TEMP TABLE unit_rules (pattern text, unit text, note text) ON COMMIT DROP;

-- Ordered most specific first; the UPDATE takes one match per parameter.
INSERT INTO unit_rules VALUES
  -- Thermal
  ('%humidity%',          '%RH', 'Relative humidity, observed 26-50'),
  ('%temp%',              'degC','Observed 9-26 across 24k readings'),

  -- Electrical: potential
  ('%phase_voltage%',     'V',   '230 V nominal phase-to-neutral'),
  ('%voltage%',           'V',   '400 V line, 230 V UPS output, 54 V DC'),

  -- Electrical: current
  ('%amps%',              'A',   'Observed 79-1,404'),
  ('%current%',           'A',   NULL),

  -- Electrical: power, energy, quality
  ('%power_factor%',      'pf',  'A dimensioned ratio, not a bare number'),
  ('%_kw',                'kW',  'Observed 64-75 on UPS output'),
  ('%site_load%',         'kW',  'Observed 48-536'),
  ('%energy_meter%',      'kWh', 'Cumulative import register'),
  ('%kwh_meter%',         'kWh', 'The same register under another name'),
  ('%frequency%',         'Hz',  '50 Hz nominal'),

  -- Proportions
  ('%percent%',           '%',   NULL),
  ('%percentage%',        '%',   NULL),
  ('%used_capacity%',     '%',   'Observed 36-44'),

  -- Time
  ('%hr_meter%',          'hr',  'Cumulative engine hour meter'),
  ('%run_hrs%',           'hr',  NULL),
  ('%cumulative_hrs%',    'hr',  NULL),

  -- Volume
  ('%fuel_consumed%',     'L',   NULL),
  ('%fuel_received%',     'L',   NULL),
  ('%fuel_balance%',      'L',   'Tank contents, observed 29,421'),
  ('%brought_forward%',   'L',   'Opening tank reading carried from the day before'),
  ('%burn_rate%',         'L/hr',NULL),

  -- Mechanical
  ('%rpm%',               'rpm', 'Defined in the register, so not unitless');

UPDATE public.equipment_parameters p
   SET unit = (
     SELECT r.unit FROM unit_rules r
      WHERE p.measure ILIKE r.pattern
      LIMIT 1
   )
 WHERE (p.unit IS NULL OR p.unit = '')
   AND p.data_type <> 'string'
   AND p.measure IS NOT NULL
   AND EXISTS (SELECT 1 FROM unit_rules r WHERE p.measure ILIKE r.pattern)
   -- bar or psi is not knowable from here. See the header.
   AND p.measure <> 'oil_pressure';

COMMIT;

DO $$
DECLARE r record; v_set int; v_blank int;
BEGIN
  SELECT count(*) FILTER (WHERE unit IS NOT NULL AND unit <> ''),
         count(*) FILTER (WHERE unit IS NULL OR unit = '')
    INTO v_set, v_blank
    FROM public.equipment_parameters
   WHERE capture_mode = 'CAPTURED' AND data_type <> 'string';

  RAISE NOTICE '% captured numeric parameters carry a unit, % still blank', v_set, v_blank;
  RAISE NOTICE 'Still blank, by measure:';
  FOR r IN
    SELECT measure, count(*) n FROM public.equipment_parameters
     WHERE capture_mode = 'CAPTURED' AND data_type <> 'string'
       AND (unit IS NULL OR unit = '')
     GROUP BY measure ORDER BY 2 DESC LIMIT 10
  LOOP
    RAISE NOTICE '  % (% parameters)', r.measure, r.n;
  END LOOP;
END $$;
