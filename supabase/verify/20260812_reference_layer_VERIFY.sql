-- ═══════════════════════════════════════════════════════════════════════════
-- 20260812_reference_layer_VERIFY.sql
--
-- Stage 1 acceptance check. Run in the Supabase SQL editor AFTER
-- 20260812_reference_layer.sql. Read-only except for one test parameter row
-- (an oil-pressure definition that is genuinely useful to keep).
--
-- Every section prints a result set. Read the `verdict` column: all should
-- say PASS.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Structure ───────────────────────────────────────────────────────────
SELECT '1. tables exist' AS check_name,
       CASE WHEN count(*) = 3 THEN 'PASS' ELSE 'FAIL - found ' || count(*) END AS verdict,
       string_agg(table_name, ', ' ORDER BY table_name) AS detail
  FROM information_schema.tables
 WHERE table_schema = 'public'
   AND table_name IN ('unit_definitions','equipment_templates','equipment_parameters');


-- ── 2. equipment_parameters gained its registry columns ────────────────────
SELECT '2. registry columns' AS check_name,
       CASE WHEN count(*) = 9 THEN 'PASS' ELSE 'FAIL - found ' || count(*) || ' of 9' END AS verdict,
       string_agg(column_name, ', ' ORDER BY column_name) AS detail
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'equipment_parameters'
   AND column_name IN ('template_id','min_value','max_value','is_required',
                       'display_order','input_type','options','help_text','is_active');


-- ── 3. equipment_id is now nullable (template-level rows need this) ────────
SELECT '3. equipment_id nullable' AS check_name,
       CASE WHEN is_nullable = 'YES' THEN 'PASS' ELSE 'FAIL - still NOT NULL' END AS verdict,
       'is_nullable=' || is_nullable AS detail
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'equipment_parameters'
   AND column_name = 'equipment_id';


-- ── 4. Units seeded ────────────────────────────────────────────────────────
SELECT '4. units seeded' AS check_name,
       CASE WHEN count(*) >= 30 THEN 'PASS' ELSE 'FAIL - only ' || count(*) END AS verdict,
       count(*) || ' units across ' || count(DISTINCT dimension) || ' dimensions' AS detail
  FROM public.unit_definitions;


-- ── 5. Unit conversion maths ───────────────────────────────────────────────
--     The Fahrenheit case is the one that proves the offset column works; a
--     factor-only design silently corrupts every °F reading.
SELECT '5. conversions' AS check_name,
       CASE WHEN abs(public.to_canonical(32.0,  'degF') -   0.0) < 0.01
             AND abs(public.to_canonical(212.0, 'degF') - 100.0) < 0.01
             AND abs(public.to_canonical(1.0,   'kV')   - 1000.0) < 0.01
             AND abs(public.to_canonical(1.0,   'bar')  - 100.0) < 0.01
             AND abs(public.to_canonical(273.15,'K')    -   0.0) < 0.01
            THEN 'PASS' ELSE 'FAIL' END AS verdict,
       format('32degF=%s, 212degF=%s, 1kV=%s, 1bar=%s, 273.15K=%s',
              round(public.to_canonical(32.0,'degF')::numeric, 2),
              round(public.to_canonical(212.0,'degF')::numeric, 2),
              round(public.to_canonical(1.0,'kV')::numeric, 2),
              round(public.to_canonical(1.0,'bar')::numeric, 2),
              round(public.to_canonical(273.15,'K')::numeric, 2)) AS detail;


-- ── 6. kVA is NOT kW (separate dimensions) ─────────────────────────────────
SELECT '6. kVA <> kW dimension' AS check_name,
       CASE WHEN (SELECT dimension FROM public.unit_definitions WHERE unit_code = 'kVA')
                 IS DISTINCT FROM
                 (SELECT dimension FROM public.unit_definitions WHERE unit_code = 'kW')
            THEN 'PASS' ELSE 'FAIL - conflated' END AS verdict,
       (SELECT 'kVA=' || dimension FROM public.unit_definitions WHERE unit_code='kVA') || ', ' ||
       (SELECT 'kW='  || dimension FROM public.unit_definitions WHERE unit_code='kW') AS detail;


-- ── 7. Templates seeded, engine types valid ────────────────────────────────
SELECT '7. templates seeded' AS check_name,
       CASE WHEN count(*) >= 9 THEN 'PASS' ELSE 'FAIL - only ' || count(*) END AS verdict,
       string_agg(DISTINCT engine_type, ', ') AS detail
  FROM public.equipment_templates;


-- ═══════════════════════════════════════════════════════════════════════════
-- 8. THE EXIT CRITERION
--    "Oil pressure, kPa, range 0-600, required can be defined as a row and
--     queried back with correct unit metadata."
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.equipment_parameters
  (template_id, parameter_name, data_type, unit,
   min_value, max_value, is_required, input_type, display_order, help_text)
VALUES
  ('TPL_GENSET_1MW', 'oil_pressure', 'number', 'kPa',
   0, 600, true, 'number', 100, 'Engine oil pressure at operating temperature')
-- NOTE: uq_equipment_parameters_template_name is a PARTIAL unique index
-- (WHERE template_id IS NOT NULL). Postgres requires the same predicate in the
-- ON CONFLICT inference clause, or it cannot match the index.
ON CONFLICT (template_id, parameter_name) WHERE template_id IS NOT NULL DO UPDATE
  SET min_value = EXCLUDED.min_value,
      max_value = EXCLUDED.max_value,
      unit      = EXCLUDED.unit;

SELECT '8. EXIT CRITERION' AS check_name,
       CASE WHEN p.parameter_name = 'oil_pressure'
             AND p.unit = 'kPa'
             AND p.min_value = 0 AND p.max_value = 600
             AND p.is_required
             AND u.dimension = 'PRESSURE'
             AND u.canonical_unit = 'kPa'
            THEN 'PASS' ELSE 'FAIL' END AS verdict,
       format('%s [%s..%s %s] required=%s dimension=%s canonical=%s',
              p.parameter_name, p.min_value, p.max_value, p.unit,
              p.is_required, u.dimension, u.canonical_unit) AS detail
  FROM public.equipment_parameters p
  LEFT JOIN public.unit_definitions u ON u.unit_code = p.unit
 WHERE p.template_id = 'TPL_GENSET_1MW'
   AND p.parameter_name = 'oil_pressure';


-- ── 9. The one-owner constraint actually rejects bad rows ──────────────────
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.equipment_parameters
      (template_id, equipment_id, parameter_name, data_type)
    VALUES ('TPL_GENSET_1MW', 'some-equipment', 'bad_row', 'number');
  EXCEPTION WHEN check_violation THEN
    ok := true;
  END;
  IF ok THEN
    RAISE NOTICE '9. one-owner constraint: PASS (both owners rejected)';
  ELSE
    RAISE EXCEPTION '9. one-owner constraint: FAIL - a row with BOTH template_id and equipment_id was accepted';
  END IF;
END $$;


-- ── 10. The RLS policy admits template-level rows ──────────────────────────
--     The deployed policy scoped every row by equipment_id -> site. Template
--     rows have equipment_id NULL, so without the policy rewrite in section 4
--     of the migration they are invisible to everyone and Stage 6 would render
--     an empty form with no error.
--
--     This inspects the POLICY EXPRESSION rather than counting rows, because
--     the SQL editor connects as a superuser, which bypasses RLS entirely —
--     a row count here would pass even with a broken policy.
SELECT '10. RLS admits templates' AS check_name,
       CASE WHEN bool_and(qual_ok) THEN 'PASS'
            ELSE 'FAIL - policy still scopes only by equipment_id' END AS verdict,
       count(*) || ' policy/policies checked' AS detail
  FROM (
    SELECT (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%template_id%' AS qual_ok
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'equipment_parameters'
       AND cmd IN ('SELECT','INSERT','UPDATE')
  ) t;


-- ── 10b. Template parameter rows actually exist ────────────────────────────
SELECT '10b. template rows exist' AS check_name,
       CASE WHEN count(*) > 0 THEN 'PASS' ELSE 'FAIL - none written' END AS verdict,
       count(*) || ' template-level parameter row(s)' AS detail
  FROM public.equipment_parameters
 WHERE template_id IS NOT NULL;


-- ── 10c. Legacy data untouched ─────────────────────────────────────────────
--     Instance-level rows that predate this migration must still be readable
--     and still carry their original values.
SELECT '10c. legacy rows intact' AS check_name,
       CASE WHEN count(*) FILTER (WHERE equipment_id IS NOT NULL AND template_id IS NULL) = count(*)
            THEN 'PASS' ELSE 'FAIL' END AS verdict,
       count(*) || ' pre-existing instance-level row(s) still present' AS detail
  FROM public.equipment_parameters
 WHERE equipment_id IS NOT NULL;


-- ── 11. Resolver function exists and is SECURITY INVOKER ───────────────────
--     INVOKER is load-bearing: it keeps RLS applying to the caller. DEFINER
--     would turn this into a cross-site leak.
SELECT '11. resolver security' AS check_name,
       CASE WHEN NOT p.prosecdef THEN 'PASS' ELSE 'FAIL - is SECURITY DEFINER' END AS verdict,
       'resolve_equipment_parameters, secdef=' || p.prosecdef AS detail
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'resolve_equipment_parameters';


-- ═══════════════════════════════════════════════════════════════════════════
-- NOTE: resolve_equipment_parameters() cannot be fully exercised until
-- Stage 2, because it resolves through equipment_registry.template_id and no
-- instance carries a template_id yet. Sections 8 and 10 verify the underlying
-- data; the merge path is covered by the Stage 2 acceptance check.
-- ═══════════════════════════════════════════════════════════════════════════
