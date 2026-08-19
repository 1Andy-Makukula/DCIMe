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
