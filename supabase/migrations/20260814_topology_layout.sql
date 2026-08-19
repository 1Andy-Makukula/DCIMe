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
