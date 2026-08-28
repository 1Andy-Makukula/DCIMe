-- ═══════════════════════════════════════════════════════════════════════════
-- 20260874_it_rack_parameters.sql
-- DCIMe V2.1 — what to measure on an equipment rack.
--
-- A CORRECTION FIRST
-- The audit said "the ten IT_LOAD racks have no parameters". Checked properly,
-- all ten belong to SANDBOX, which has now been retired. SITE_01 has NO IT_LOAD
-- assets at all — the category is not under-configured, it is unpopulated.
--
-- So there is nothing to attach parameters to yet, and registering racks needs
-- site knowledge nobody here has: how many, in which rooms, on what feeds.
-- What CAN be settled now is what a rack should measure once one is registered,
-- which is the part that was delegated: "whatever is measured in IT, use your
-- data on the industry".
--
-- WHERE THIS SET COMES FROM
-- ASHRAE TC9.9 governs the thermal side and is unambiguous: the number that
-- matters is air temperature AT THE RACK INLET, not room ambient. A hall
-- averaging 21 °C can still have a rack drawing 32 °C off a hot aisle, and the
-- room sensor will never say so. Recommended envelope 18-27 °C, 8-60% RH.
--
-- The electrical side follows ordinary rack-PDU practice: load, current,
-- voltage. Capacity follows TIA-942 space accounting: U used against U fitted.
--
-- ONE DELIBERATE DEPARTURE FROM BEST PRACTICE
-- ASHRAE measures inlet at THREE heights per rack — top, middle, bottom —
-- because vertical stratification is the whole problem it is trying to catch.
-- This site captures by hand, on a walking round, hourly. Tripling the thermal
-- readings per rack is how a round stops getting completed, and a missed round
-- measures nothing at all.
--
-- So: inlet at mid-height (the ASHRAE minimum) plus exhaust. The difference
-- between them is delta-T, which is the single most useful rack number — it
-- says whether the rack is getting the air it needs. If racks are later
-- instrumented rather than read by hand, add top and bottom then.
--
-- CARRY_FORWARD ON U_USED
-- Rack space does not change hourly. It is marked carry_forward so a technician
-- confirms rather than retypes it, which is how the existing CONSTANT-style
-- parameters behave.
--
-- Idempotent: safe to re-run. Applying to a rack that already has these
-- parameters changes nothing.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.seed_it_rack_parameters(p_equipment_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category text;
  v_added    int := 0;
BEGIN
  SELECT category INTO v_category
    FROM public.equipment_registry WHERE equipment_id = p_equipment_id;

  IF v_category IS NULL THEN
    RAISE EXCEPTION 'No such asset: %', p_equipment_id;
  END IF;
  IF v_category <> 'IT_LOAD' THEN
    RAISE EXCEPTION 'Asset % is %, not IT_LOAD', p_equipment_id, v_category
      USING HINT = 'This parameter set is for equipment racks.';
  END IF;

  INSERT INTO public.equipment_parameters (
    equipment_id, parameter_name, display_label, data_type, input_type,
    unit, min_value, warn_min, warn_max, max_value,
    is_graphable, is_required, carry_forward, capture_mode,
    display_order, frequency, help_text)
  SELECT p_equipment_id, p_equipment_id || '_' || d.suffix, d.label,
         'number'::parameter_data_type, 'number',
         d.unit, d.min_v, d.warn_lo, d.warn_hi, d.max_v,
         true, d.required, d.carry, 'CAPTURED',
         d.ord, 'hourly', d.help
    FROM (VALUES
      -- ── Thermal: ASHRAE TC9.9 recommended envelope ───────────────────────
      ('inlet_temp',    'Inlet Temp',     'degC', 18::float8, 20::float8, 25::float8, 27::float8,
       true,  false, 10,
       'Air temperature at the rack inlet, mid-height. This is the number ASHRAE bands, not room ambient.'),
      ('exhaust_temp',  'Exhaust Temp',   'degC', NULL::float8, NULL::float8, 40::float8, 45::float8,
       true,  false, 20,
       'Air leaving the rack. Inlet subtracted from this is delta-T.'),
      ('inlet_humidity','Inlet Humidity', '%RH',  20::float8, 30::float8, 50::float8, 60::float8,
       false, false, 30,
       'Relative humidity at the inlet. Below 20% risks static; above 60% risks condensation.'),

      -- ── Electrical: rack PDU ─────────────────────────────────────────────
      ('load_kw',       'Rack Load',      'kW',   NULL::float8, NULL::float8, NULL::float8, NULL::float8,
       true,  false, 40,
       'Total draw from the rack PDU. Limits are per-rack and set once the design capacity is known.'),
      ('load_current',  'Rack Current',   'A',    NULL::float8, NULL::float8, NULL::float8, NULL::float8,
       true,  false, 50,
       'Current at the rack PDU.'),
      ('supply_voltage','Supply Voltage', 'V',    207::float8, 218::float8, 242::float8, 253::float8,
       false, false, 60,
       'Voltage at the rack PDU. Banded for a 230 V single-phase feed; widen if the rack is three-phase.'),

      -- ── Capacity: TIA-942 space accounting ───────────────────────────────
      ('u_used',        'U Space Used',   NULL,   NULL::float8, NULL::float8, NULL::float8, NULL::float8,
       false, true,  70,
       'Rack units occupied. Changes rarely, so it is carried forward for confirmation rather than retyped.')
    ) AS d(suffix, label, unit, min_v, warn_lo, warn_hi, max_v, required, carry, ord, help)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.equipment_parameters ep
      WHERE ep.equipment_id = p_equipment_id
        AND ep.parameter_name = p_equipment_id || '_' || d.suffix
   );

  GET DIAGNOSTICS v_added = ROW_COUNT;
  RETURN format('%s parameters added to %s', v_added, p_equipment_id);
END $$;

COMMENT ON FUNCTION public.seed_it_rack_parameters(text) IS
  'Applies the standard equipment-rack measurement set to an IT_LOAD asset: '
  'ASHRAE inlet and exhaust temperature, inlet humidity, PDU load, current and '
  'voltage, and U space used. Idempotent.';

REVOKE ALL ON FUNCTION public.seed_it_rack_parameters(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.seed_it_rack_parameters(text) TO authenticated;

COMMIT;


-- ── Report, and prove it against a throwaway rack ──────────────────────────
DO $$
DECLARE
  v_site uuid;
  v_msg  text;
  v_n    int;
BEGIN
  SELECT id INTO v_site FROM public.sites WHERE site_code = 'SITE_01';

  SELECT count(*) INTO v_n FROM public.equipment_registry
   WHERE site_uuid = v_site AND category = 'IT_LOAD';
  RAISE NOTICE 'SITE_01 currently has % IT_LOAD assets', v_n;

  -- Exercised on a temporary asset so the set is known to apply cleanly,
  -- then removed. Better to find a broken definition here than the first time
  -- somebody registers a real rack.
  INSERT INTO public.equipment_registry
    (equipment_id, site_uuid, name, category, location, is_active, provenance)
  VALUES ('_tmp_rack_check', v_site, 'Template check', 'IT_LOAD', 'n/a', false, 'MANUAL')
  ON CONFLICT (equipment_id) DO NOTHING;

  SELECT public.seed_it_rack_parameters('_tmp_rack_check') INTO v_msg;
  RAISE NOTICE '%', v_msg;

  DELETE FROM public.equipment_parameters WHERE equipment_id = '_tmp_rack_check';
  DELETE FROM public.equipment_registry   WHERE equipment_id = '_tmp_rack_check';
  RAISE NOTICE 'check asset removed; run seed_it_rack_parameters(id) on each rack once registered';
END $$;
