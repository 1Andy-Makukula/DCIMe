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
