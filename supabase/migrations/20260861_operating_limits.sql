-- ═══════════════════════════════════════════════════════════════════════════
-- 20260861_operating_limits.sql
-- DCIMe V2.1 — giving the RAG status something to check against.
--
-- THE PROBLEM THIS ANSWERS
-- One parameter of 187 carries limits, so reading_status() returns 'unknown'
-- almost everywhere, every screen shows grey, evaluate_thresholds() has nothing
-- to compare and has never raised a work item. It also blocks the zeros
-- finding: a min_value is what separates "the generator did not run" from "the
-- box was left empty and saved as 0".
--
-- WHERE THESE NUMBERS COME FROM — AND WHERE THEY DO NOT
-- Not invented, and not fitted to the observed data either. Fitting limits to
-- what a plant already does is circular: it declares current behaviour correct
-- by construction and can never flag a long-standing fault.
--
-- Air temperature and humidity use ASHRAE TC9.9, the published thermal
-- guideline for data-hall equipment intake. Electrical limits use nominal
-- voltage with the IEC 60038 tolerance for supply systems. Both are standards
-- somebody else defends.
--
-- The observed data is used only as a SANITY CHECK — if a proposed band would
-- put most of normal operation outside it, that is a sign the nominal was
-- wrong, not that the plant is broken. Each row below records which it is.
--
-- WHAT WILL HAPPEN WHEN THIS LANDS
-- Readings already in the database become retrospective breaches. That is
-- intended — those excursions really did happen — but it is worth naming
-- because the dashboards will change the moment the rollups refresh. The known
-- transcription errors that will light up:
--
--     battery_voltage    min 53.4 against a 543 mean   — a decimal slip
--     load_amps_c        max 1,141 against a 121 mean  — a decimal slip
--     pr1_ambient_temp   max 79.2 °C                   — implausible
--     grid_voltage_*     p01 ~235 in a 400 V field     — phase typed as line
--
-- Catching exactly these is what the limits are for.
--
-- REVIEW THIS. These are a starting point set by an engineer who has never
-- stood in the building. Every one is a single UPDATE to change.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TEMP TABLE proposed_limits (
  measure   text PRIMARY KEY,
  min_value double precision,
  warn_min  double precision,
  warn_max  double precision,
  max_value double precision,
  basis     text
) ON COMMIT DROP;

INSERT INTO proposed_limits VALUES
  -- ── Air temperature ──────────────────────────────────────────────────────
  -- ASHRAE TC9.9 recommended envelope for equipment intake is 18–27 °C. Warn
  -- band pulled in to 20–25 so a drift is visible before it is a breach.
  -- Observed here: mean 19.5, p01 11.3, p99 24.7 — normal operation sits inside
  -- the band and the cold excursions are real.
  ('return_temp_actual',      18, 20, 25, 27, 'ASHRAE TC9.9 recommended intake envelope'),
  ('server_ambient_temp',     18, 20, 25, 27, 'ASHRAE TC9.9 recommended intake envelope'),
  ('hq_ambient_temp',         18, 20, 25, 27, 'ASHRAE TC9.9 recommended intake envelope'),
  ('it1_ambient_temp',        18, 20, 25, 27, 'ASHRAE TC9.9 recommended intake envelope'),
  ('it2_ambient_temp',        18, 20, 25, 27, 'ASHRAE TC9.9 recommended intake envelope'),
  ('pr1_ambient_temp',        18, 20, 25, 27, 'ASHRAE TC9.9 recommended intake envelope'),
  ('pr2_ambient_temp',        18, 20, 25, 27, 'ASHRAE TC9.9 recommended intake envelope'),
  ('data_ambient_temp',       18, 20, 25, 27, 'ASHRAE TC9.9 recommended intake envelope'),

  -- ── Relative humidity ────────────────────────────────────────────────────
  -- ASHRAE recommends 8–60% RH non-condensing; 40–60 is the usual operating
  -- target. This plant runs DRY — observed 27 to 50, mean around 32 — so a
  -- 40–60 band would mark almost every reading a breach on day one. Widened to
  -- 20–60 hard with a 30–50 warn, which brackets how the site actually runs
  -- while still catching condensation and static risk.
  -- ⚠ This one is a judgement rather than a standard. Worth a second opinion.
  ('server_ambient_humidity', 20, 30, 50, 60, 'ASHRAE upper bound; lower widened to observed operation'),
  ('hq_ambient_humidity',     20, 30, 50, 60, 'ASHRAE upper bound; lower widened to observed operation'),
  ('it1_ambient_humidity',    20, 30, 50, 60, 'ASHRAE upper bound; lower widened to observed operation'),
  ('it2_ambient_humidity',    20, 30, 50, 60, 'ASHRAE upper bound; lower widened to observed operation'),
  ('pr1_ambient_humidity',    20, 30, 50, 60, 'ASHRAE upper bound; lower widened to observed operation'),
  ('pr2_ambient_humidity',    20, 30, 50, 60, 'ASHRAE upper bound; lower widened to observed operation'),
  ('data_ambient_humidity',   20, 30, 50, 60, 'ASHRAE upper bound; lower widened to observed operation'),

  -- ── Grid line voltage, 400 V nominal ─────────────────────────────────────
  -- IEC 60038 allows ±10% on a low-voltage supply. Warn at ±5%.
  ('grid_voltage_r',         360, 380, 420, 440, 'IEC 60038: 400 V nominal ±10%'),
  ('grid_voltage_y',         360, 380, 420, 440, 'IEC 60038: 400 V nominal ±10%'),
  ('grid_voltage_b',         360, 380, 420, 440, 'IEC 60038: 400 V nominal ±10%'),

  -- ── Grid phase-to-neutral voltage, 230 V nominal ─────────────────────────
  ('grid_phase_voltage_rn',  207, 218, 242, 253, 'IEC 60038: 230 V nominal ±10%'),
  ('grid_phase_voltage_yn',  207, 218, 242, 253, 'IEC 60038: 230 V nominal ±10%'),
  ('grid_phase_voltage_bn',  207, 218, 242, 253, 'IEC 60038: 230 V nominal ±10%'),

  -- ── UPS output voltage, 230 V nominal ────────────────────────────────────
  -- Tighter than mains: a UPS regulates its own output, so ±6% hard / ±3% warn.
  ('output_voltage_a',       216, 223, 237, 244, 'UPS regulated output: 230 V ±6%'),
  ('output_voltage_b',       216, 223, 237, 244, 'UPS regulated output: 230 V ±6%'),
  ('output_voltage_c',       216, 223, 237, 244, 'UPS regulated output: 230 V ±6%'),

  -- ── Grid frequency, 50 Hz nominal ────────────────────────────────────────
  ('grid_frequency',        49.5, 49.8, 50.2, 50.5, 'IEC 60038: 50 Hz nominal ±1%'),

  -- ── DC plant, 48 V nominal telecom string ────────────────────────────────
  -- Float voltage for a 48 V lead-acid string is 54.0–54.5. Below 48 the string
  -- is discharging; above 58 it is being overcharged.
  ('dc_voltage',              48,  52,  56,  58, '48 V nominal telecom float band'),

  -- ── UPS battery string ───────────────────────────────────────────────────
  -- Observed 529–554 across both units, consistent with a 480 V nominal string
  -- on float. Band set around that rather than a published figure, because the
  -- string configuration is not recorded anywhere in the registry.
  -- ⚠ Confirm the nominal string voltage and this can be tightened properly.
  ('battery_voltage',        480, 520, 560, 580, 'Inferred from observed float; nominal not recorded'),

  -- ── Battery state of charge ──────────────────────────────────────────────
  -- A UPS battery below 90% has lost meaningful runtime; below 80 is a fault.
  ('battery_charge_percent',  80,  95, 100, 100, 'Runtime reserve: below 90% is degraded'),

  -- ── Loading ──────────────────────────────────────────────────────────────
  -- 90% is the practical ceiling before N+1 redundancy stops being true; warn
  -- at 75 to leave time to act.
  ('used_percentage',       NULL, NULL,  75,  90, 'N+1 headroom: 90% ceiling'),
  ('used_capacity',         NULL, NULL,  75,  90, 'N+1 headroom: 90% ceiling'),
  ('load_phase_percent_a',  NULL, NULL,  75,  90, 'N+1 headroom: 90% ceiling'),
  ('load_phase_percent_b',  NULL, NULL,  75,  90, 'N+1 headroom: 90% ceiling'),
  ('load_phase_percent_c',  NULL, NULL,  75,  90, 'N+1 headroom: 90% ceiling');

-- ── Apply ──────────────────────────────────────────────────────────────────
-- By measure, so every asset recording the same thing gets the same band —
-- 24 air conditioners in one statement rather than 24 decisions.
UPDATE public.equipment_parameters p
   SET min_value = l.min_value,
       warn_min  = l.warn_min,
       warn_max  = l.warn_max,
       max_value = l.max_value
  FROM proposed_limits l
 WHERE p.measure = l.measure
   AND p.capture_mode = 'CAPTURED';

COMMIT;


-- ── Refresh and report ─────────────────────────────────────────────────────
DO $$
DECLARE
  v_msg      text;
  v_params   bigint;
  v_breach   bigint;
  v_warn     bigint;
  v_total    bigint;
  r          record;
BEGIN
  SELECT count(*) INTO v_params
    FROM public.equipment_parameters
   WHERE min_value IS NOT NULL OR max_value IS NOT NULL;

  SELECT public.refresh_reading_rollups() INTO v_msg;

  SELECT sum(n_breach), sum(n_warn), sum(n_numeric)
    INTO v_breach, v_warn, v_total
    FROM public.readings_daily;

  RAISE NOTICE '% parameters now carry limits', v_params;
  RAISE NOTICE 'against existing readings: % breaches, % warnings, of % numeric',
    v_breach, v_warn, v_total;

  RAISE NOTICE 'Worst offenders:';
  FOR r IN
    SELECT d.parameter_name, sum(d.n_breach) b
      FROM public.readings_daily d
     GROUP BY d.parameter_name HAVING sum(d.n_breach) > 0
     ORDER BY 2 DESC LIMIT 8
  LOOP
    RAISE NOTICE '  % — % breaching readings', r.parameter_name, r.b;
  END LOOP;
END $$;
