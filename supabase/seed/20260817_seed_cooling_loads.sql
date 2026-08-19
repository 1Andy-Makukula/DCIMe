-- ═══════════════════════════════════════════════════════════════════════════
-- 20260817_seed_cooling_loads.sql
-- DCIMe V2 — electrical draw for cooling equipment
--
-- WHY THIS IS NOT A ONE-LINE UPDATE
--
-- TPL_PAC carries capacity 30.0 and btu_hr 102000. Both describe COOLING
-- capacity — heat removed — not electrical draw. A precision air conditioner
-- rated 30 kW thermal does not consume 30 kW of electricity; it consumes what
-- the compressor and fans need to MOVE that heat.
--
--     electrical draw  =  cooling capacity / COP
--
-- Setting kw_load = 30 for 25 units would put 750 kW of cooling on a 750 kVA
-- grid feed, and report a PUE near 19. The distinction is load-bearing.
--
-- THE NUMBERS BELOW ARE ESTIMATES, NOT NAMEPLATE DATA.
--   102,000 BTU/hr           = 29.9 kW thermal
--   COP 2.8                  typical for DX precision cooling at design conditions
--   -> ~10.7 kW electrical at full load
--   -> ~7.5 kW at a typical ~70% duty
--
-- Cross-check against the facility's own readings: the site runs ~480 kW total
-- against ~275 kW IT (UPS output + rectifier DC), leaving ~205 kW for cooling
-- and losses. Spread across 25 units that is ~8 kW each — consistent with the
-- 7.5 derived above, which is the only reason these are worth seeding at all.
--
-- REPLACE WITH NAMEPLATE FIGURES when someone can read the units. Each row is a
-- single UPDATE, and the capacity ledger improves the moment they land.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TEMP TABLE _sb ON COMMIT DROP AS
  SELECT id AS site_uuid FROM public.sites WHERE site_code = 'SITE_01';

-- capacity  = rated ELECTRICAL input, so load_pct means something for a board
-- kw_load   = operating electrical draw
-- btu_hr    = retained: the thermal rating, which is a different quantity
UPDATE public.equipment_registry
   SET dynamic_parameters = dynamic_parameters
        || jsonb_build_object('capacity', 12.0, 'kw_load', 7.5,
                              'load_basis', 'ESTIMATED_FROM_COP')
 WHERE site_uuid = (SELECT site_uuid FROM _sb)
   AND engine_type = 'cooling';

-- ── What this changes ─────────────────────────────────────────────────────
DO $$
DECLARE
  v_site uuid; v_units int; v_cool double precision; v_it double precision;
BEGIN
  SELECT site_uuid INTO v_site FROM _sb;

  SELECT count(*),
         sum((dynamic_parameters->>'kw_load')::double precision)
    INTO v_units, v_cool
    FROM public.equipment_registry
   WHERE site_uuid = v_site AND engine_type = 'cooling';

  SELECT COALESCE(sum(carried_load_kw), 0) INTO v_it
    FROM public.get_load_accumulation(v_site)
   WHERE engine_type IN ('ups','rectifier');

  RAISE NOTICE 'Cooling load seeded: % units, % kW total (estimated)', v_units, v_cool;
  RAISE NOTICE 'IT load at the conversion tier: % kW', round(v_it::numeric, 1);
  RAISE NOTICE '';
  RAISE NOTICE 'NOTE: this sandbox carries only the 10 demonstration racks (% kW).', round(v_it::numeric,1);
  RAISE NOTICE 'The real facility runs ~275 kW IT, so any PUE derived from THIS';
  RAISE NOTICE 'topology is demo-scale and wrong. PUE must come from telemetry';
  RAISE NOTICE '(UPS output + rectifier DC), which useExecutiveSummary already does.';
  RAISE NOTICE 'These figures improve CAPACITY and N+1 analysis, not PUE.';
END $$;

COMMIT;
