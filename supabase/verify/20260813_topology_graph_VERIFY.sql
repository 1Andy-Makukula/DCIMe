-- ═══════════════════════════════════════════════════════════════════════════
-- 20260813_topology_graph_VERIFY.sql
--
-- Stage 2 acceptance check. Run in the Supabase SQL editor AFTER
-- 20260813_topology_graph.sql and the sandbox seed.
--
-- Read the `verdict` column: everything should say PASS.
-- Sections 7 and 8 write a temporary row and clean it up after themselves.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Node columns ────────────────────────────────────────────────────────
SELECT '1. node columns' AS check_name,
       CASE WHEN count(*) = 4 THEN 'PASS' ELSE 'FAIL - found ' || count(*) || ' of 4' END AS verdict,
       string_agg(column_name, ', ' ORDER BY column_name) AS detail
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='equipment_registry'
   AND column_name IN ('engine_type','dynamic_parameters','input_policy','provenance');

-- ── 2. Edge columns ────────────────────────────────────────────────────────
SELECT '2. edge columns' AS check_name,
       CASE WHEN count(*) = 6 THEN 'PASS' ELSE 'FAIL - found ' || count(*) || ' of 6' END AS verdict,
       string_agg(column_name, ', ' ORDER BY column_name) AS detail
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='equipment_connections'
   AND column_name IN ('source_port','target_port','input_priority','render_path_id','provenance','updated_at');

-- ── 3. Sandbox seeded to the expected shape ────────────────────────────────
--     49 edges = 44 copied from directFeederMap + 5 reconstructed generator
--     feeds. (47 is the count of map ENTRIES, not edges — a distinction worth
--     keeping straight.)
SELECT '3. sandbox shape' AS check_name,
       CASE WHEN n = 48 AND e = 49 THEN 'PASS'
            ELSE 'FAIL - got ' || n || ' nodes / ' || e || ' edges' END AS verdict,
       n || ' nodes, ' || e || ' edges' AS detail
  FROM (
    SELECT (SELECT count(*) FROM public.equipment_registry
             WHERE site_uuid=(SELECT id FROM public.sites WHERE site_code='SANDBOX')) AS n,
           (SELECT count(*) FROM public.equipment_connections c
              JOIN public.equipment_registry r ON r.equipment_id=c.source_equipment_id
             WHERE r.site_uuid=(SELECT id FROM public.sites WHERE site_code='SANDBOX')) AS e
  ) x;

-- ── 4. Graph integrity ─────────────────────────────────────────────────────
SELECT '4. graph integrity' AS check_name,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS verdict,
       coalesce(string_agg(equipment_id || ' (' || issue || ')', ', '), 'no issues') AS detail
  FROM public.topology_graph_issues
 WHERE site_uuid = (SELECT id FROM public.sites WHERE site_code='SANDBOX');

-- ── 5. The contract payload ────────────────────────────────────────────────
SELECT '5. contract payload' AS check_name,
       CASE WHEN jsonb_array_length(j->'nodes') = 48
             AND jsonb_array_length(j->'edges') = 49 THEN 'PASS' ELSE 'FAIL' END AS verdict,
       jsonb_array_length(j->'nodes') || ' nodes, ' ||
       jsonb_array_length(j->'edges') || ' edges in get_topology_graph()' AS detail
  FROM (SELECT public.get_topology_graph(
          (SELECT id FROM public.sites WHERE site_code='SANDBOX')) AS j) g;

-- ── 6. Redundancy is modelled, not just drawn ──────────────────────────────
--     The two server boards must each have TWO feeders under ANY policy — that
--     is what keeps the load up when one UPS trips. The changeovers must be
--     PRIORITY, which is what a TCO physically does.
SELECT '6. redundancy modelled' AS check_name,
       CASE WHEN count(*) FILTER (WHERE target LIKE '%server-db' AND policy='ANY') = 2
             AND count(*) FILTER (WHERE target LIKE 'node-tco-%' AND policy='PRIORITY') = 2
            THEN 'PASS' ELSE 'FAIL' END AS verdict,
       string_agg(target || '=' || feeders || ':' || policy, ', ' ORDER BY target) AS detail
  FROM (
    SELECT c.target_equipment_id AS target, count(*) AS feeders, e.input_policy AS policy
      FROM public.equipment_connections c
      JOIN public.equipment_registry e ON e.equipment_id=c.target_equipment_id
     WHERE e.site_uuid=(SELECT id FROM public.sites WHERE site_code='SANDBOX')
     GROUP BY c.target_equipment_id, e.input_policy HAVING count(*) > 1
  ) t;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. THE ECOSYSTEM FIREWALL
--    A BMS-asserted edge must be storable but must NOT reach the physics
--    engine until a human promotes it. This is Part 2.D of the V2 document as
--    an enforced mechanism rather than a line on a diagram.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.equipment_connections
  (source_equipment_id, source_port, target_equipment_id, target_port,
   connection_type, provenance, is_active)
VALUES ('node-grid-tx','VERIFY_BMS','node-ups-1','VERIFY_BMS','POWER','BMS',true)
ON CONFLICT (source_equipment_id, source_port, target_equipment_id, target_port)
  DO NOTHING;

SELECT '7. BMS quarantine' AS check_name,
       CASE WHEN raw = engine + 1 THEN 'PASS'
            ELSE 'FAIL - BMS edge leaked into the engine payload' END AS verdict,
       raw || ' edges stored, ' || engine || ' reach the engine' AS detail
  FROM (
    SELECT (SELECT count(*) FROM public.equipment_connections c
              JOIN public.equipment_registry r ON r.equipment_id=c.source_equipment_id
             WHERE r.site_uuid=(SELECT id FROM public.sites WHERE site_code='SANDBOX')) AS raw,
           (SELECT jsonb_array_length(public.get_topology_graph(
              (SELECT id FROM public.sites WHERE site_code='SANDBOX'))->'edges')) AS engine
  ) x;

-- ── 8. Promotion path: MANUAL makes it authoritative ───────────────────────
UPDATE public.equipment_connections SET provenance='MANUAL'
 WHERE source_port='VERIFY_BMS' AND target_port='VERIFY_BMS';

SELECT '8. promotion works' AS check_name,
       CASE WHEN raw = engine THEN 'PASS'
            ELSE 'FAIL - promoted edge did not reach the engine' END AS verdict,
       'after promotion: ' || engine || ' of ' || raw || ' edges reach the engine' AS detail
  FROM (
    SELECT (SELECT count(*) FROM public.equipment_connections c
              JOIN public.equipment_registry r ON r.equipment_id=c.source_equipment_id
             WHERE r.site_uuid=(SELECT id FROM public.sites WHERE site_code='SANDBOX')) AS raw,
           (SELECT jsonb_array_length(public.get_topology_graph(
              (SELECT id FROM public.sites WHERE site_code='SANDBOX'))->'edges')) AS engine
  ) x;

DELETE FROM public.equipment_connections
 WHERE source_port='VERIFY_BMS' AND target_port='VERIFY_BMS';

-- ── 9. Structural guards actually reject bad data ──────────────────────────
DO $$
DECLARE self_loop_blocked boolean := false;
        dup_edge_blocked  boolean := false;
        bad_json_blocked  boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.equipment_connections
      (source_equipment_id,target_equipment_id,connection_type)
    VALUES ('node-ups-1','node-ups-1','POWER');
  EXCEPTION WHEN check_violation THEN self_loop_blocked := true;
  END;

  BEGIN
    INSERT INTO public.equipment_connections
      (source_equipment_id,source_port,target_equipment_id,target_port,connection_type)
    VALUES ('node-grid-tx','OUT','node-main-main-db','GRID_IN','POWER');
  EXCEPTION WHEN unique_violation THEN dup_edge_blocked := true;
  END;

  -- The Rule 2 / section 6.2 guard: a string where the engine expects a float
  -- is exactly what would crash the WASM module at parse time.
  BEGIN
    UPDATE public.equipment_registry
       SET dynamic_parameters = '{"capacity":"400"}'::jsonb
     WHERE equipment_id='node-ups-1';
  EXCEPTION WHEN check_violation THEN bad_json_blocked := true;
  END;

  IF self_loop_blocked AND dup_edge_blocked AND bad_json_blocked THEN
    RAISE NOTICE '9. structural guards: PASS (self-loop, duplicate edge and string-as-number all rejected)';
  ELSE
    RAISE EXCEPTION '9. structural guards: FAIL - self_loop=% dup=% bad_json=%',
      self_loop_blocked, dup_edge_blocked, bad_json_blocked;
  END IF;
END $$;

-- ── 10. RLS repairs present ────────────────────────────────────────────────
--     equipment_connections previously had SELECT and INSERT only. With RLS on
--     and no UPDATE/DELETE policy those are denied by default, so a miswired
--     cable could never be corrected — and the Stage 10 editor is impossible.
SELECT '10. connection RLS' AS check_name,
       CASE WHEN count(*) FILTER (WHERE cmd='UPDATE') > 0
             AND count(*) FILTER (WHERE cmd='DELETE') > 0
             AND count(*) FILTER (WHERE cmd='SELECT' AND qual LIKE '%target_equipment_id%') > 0
            THEN 'PASS' ELSE 'FAIL' END AS verdict,
       string_agg(DISTINCT cmd, ', ') AS detail
  FROM pg_policies
 WHERE schemaname='public' AND tablename='equipment_connections';

-- ── 11. Contract function is SECURITY INVOKER ──────────────────────────────
--     INVOKER keeps RLS applying to the caller. DEFINER would turn this into a
--     cross-site data leak.
SELECT '11. contract security' AS check_name,
       CASE WHEN NOT p.prosecdef THEN 'PASS' ELSE 'FAIL - is SECURITY DEFINER' END AS verdict,
       'get_topology_graph, secdef=' || p.prosecdef AS detail
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='get_topology_graph';

-- ── 12. Template inheritance resolved through to instances ─────────────────
--     The Stage 1 resolver could not be exercised until instances carried a
--     template_id. They do now.
SELECT '12. param inheritance' AS check_name,
       CASE WHEN count(*) > 0 THEN 'PASS' ELSE 'FAIL - resolver returned nothing' END AS verdict,
       count(*) || ' parameter(s) resolved for node-dg-1, source=' ||
         coalesce(string_agg(DISTINCT source, '/'), 'none') AS detail
  FROM public.resolve_equipment_parameters('node-dg-1');
