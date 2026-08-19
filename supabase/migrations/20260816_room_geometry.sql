-- ═══════════════════════════════════════════════════════════════════════════
-- 20260816_room_geometry.sql
-- DCIMe V2 — Stage 3c: rooms become spatial
--
-- WHY THIS EXISTS
-- The old renderer draws 7 translucent floor plates — THE SERVER ROOM, POWER
-- ROOM 1, EXTERIOR YARD — that tell an operator WHERE they are looking. They
-- are the ground plane the equipment sits on.
--
-- The Stage 3 extraction missed them: it looked for elements carrying an `id`
-- or a `data-path-id`, and the plates are bare <rect> elements with inline
-- styling and neither. So the React canvas draws equipment floating in a void.
--
-- These could have been dumped in as raw SVG, but a room is a real thing in
-- this system — it already has a row, and equipment already references it. So
-- geometry goes on that row, and a room becomes as editable as anything else.
--
-- Depends on: 20260814_topology_layout.sql
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS layout_x      double precision,
  ADD COLUMN IF NOT EXISTS layout_y      double precision,
  ADD COLUMN IF NOT EXISTS layout_w      double precision,
  ADD COLUMN IF NOT EXISTS layout_h      double precision,
  -- Display name on the plate. Deliberately separate from room_name: the
  -- drawing says "THE SERVER ROOM" while the record says "Server Room", and
  -- both are correct for their audience.
  ADD COLUMN IF NOT EXISTS layout_label  text,
  ADD COLUMN IF NOT EXISTS label_x       double precision,
  ADD COLUMN IF NOT EXISTS label_y       double precision,
  ADD COLUMN IF NOT EXISTS label_size    integer,
  -- Faint wash distinguishing zones. Two rooms in the source drawing are
  -- tinted (green for Power Room 1, cyan for Power Room 2); the rest are
  -- neutral white at 1% opacity.
  ADD COLUMN IF NOT EXISTS layout_tint   text;

COMMENT ON COLUMN public.rooms.layout_x IS
  'Floor plate origin in topology SVG user units. NULL = room not drawn.';

-- All four or none: a plate with a width but no height is a drawing bug that
-- would render as an invisible zero-area rectangle.
ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_layout_complete_check;
ALTER TABLE public.rooms
  ADD CONSTRAINT rooms_layout_complete_check CHECK (
    num_nonnulls(layout_x, layout_y, layout_w, layout_h) IN (0, 4)
  );

ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_layout_positive_check;
ALTER TABLE public.rooms
  ADD CONSTRAINT rooms_layout_positive_check CHECK (
    (layout_w IS NULL OR layout_w > 0) AND (layout_h IS NULL OR layout_h > 0)
  );

-- ── Rooms need to reach the client ────────────────────────────────────────
-- The deployed policy set gives rooms a SELECT policy but no write policies,
-- so under RLS an admin cannot reposition one. The Stage 10 editor needs this;
-- same gap as equipment_connections had.
DROP POLICY IF EXISTS "Rooms: admin insert" ON public.rooms;
CREATE POLICY "Rooms: admin insert"
  ON public.rooms FOR INSERT
  WITH CHECK (public.get_my_role() = 'ADMIN' AND site_id = public.get_my_site_uuid());

DROP POLICY IF EXISTS "Rooms: admin update" ON public.rooms;
CREATE POLICY "Rooms: admin update"
  ON public.rooms FOR UPDATE
  USING (public.get_my_role() = 'ADMIN' AND site_id = public.get_my_site_uuid())
  WITH CHECK (public.get_my_role() = 'ADMIN' AND site_id = public.get_my_site_uuid());

DROP POLICY IF EXISTS "Rooms: admin delete" ON public.rooms;
CREATE POLICY "Rooms: admin delete"
  ON public.rooms FOR DELETE
  USING (public.get_my_role() = 'ADMIN' AND site_id = public.get_my_site_uuid());


-- ═══════════════════════════════════════════════════════════════════════════
-- The contract carries rooms alongside nodes and edges
--
-- One request returns everything needed to draw the facility. The renderer
-- paints rooms first, then cables, then equipment — back to front.
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
  graph_rooms AS (
    SELECT r.id, r.room_name, r.layout_x, r.layout_y, r.layout_w, r.layout_h,
           r.layout_label, r.label_x, r.label_y, r.label_size, r.layout_tint,
           r.sort_order
      FROM public.rooms r, target_site s
     WHERE r.site_id = s.id
       AND r.layout_x IS NOT NULL
  ),
  graph_nodes AS (
    SELECT e.equipment_id, e.engine_type, e.name, e.category, e.room_id,
           e.is_active, e.input_policy, e.dynamic_parameters, e.sort_order,
           e.layout_x, e.layout_y, e.render_shape
      FROM public.equipment_registry e, target_site s
     WHERE e.site_uuid = s.id
       AND (e.engine_type IS NOT NULL OR e.layout_x IS NOT NULL)
  ),
  graph_edges AS (
    SELECT c.source_equipment_id, c.source_port,
           c.target_equipment_id, c.target_port,
           c.input_priority, c.connection_type,
           c.render_path_id, c.render_path_d
      FROM public.equipment_connections c
     WHERE c.is_active
       AND c.provenance IN ('MANUAL','IMPORT')
       AND c.source_equipment_id IN (SELECT equipment_id FROM graph_nodes)
       AND c.target_equipment_id IN (SELECT equipment_id FROM graph_nodes)
  )
  SELECT jsonb_build_object(
    'site_uuid',    (SELECT id FROM target_site),
    'generated_at', now(),
    'rooms', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id',    r.id,
               'name',  r.room_name,
               'label', COALESCE(r.layout_label, upper(r.room_name)),
               'x',     r.layout_x,
               'y',     r.layout_y,
               'w',     r.layout_w,
               'h',     r.layout_h,
               'label_x', COALESCE(r.label_x, r.layout_x + 30),
               'label_y', COALESCE(r.label_y, r.layout_y + 60),
               'label_size', COALESCE(r.label_size, 28),
               'tint',  r.layout_tint
             ) ORDER BY r.sort_order NULLS LAST, r.room_name)
        FROM graph_rooms r), '[]'::jsonb),
    'nodes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id',           n.equipment_id,
               'type',         n.engine_type,
               'name',         COALESCE(n.name, n.equipment_id),
               'category',     n.category,
               'room_id',      n.room_id,
               'is_active',    COALESCE(n.is_active, true),
               'input_policy', n.input_policy,
               'simulated',    (n.engine_type IS NOT NULL),
               'shape',        n.render_shape,
               'x',            n.layout_x,
               'y',            n.layout_y,
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
  'The topology contract: {rooms[], nodes[], edges[]}. Rooms are the ground '
  'plane, drawn first. Nodes carry `simulated` — the renderer draws all, the '
  'engine loads only simulated. SECURITY INVOKER; do not change.';

REVOKE ALL ON FUNCTION public.get_topology_graph(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_topology_graph(uuid) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- Equipment should sit inside the room it belongs to
--
-- Cheap to check, and it catches both a mistyped coordinate and a node whose
-- room_id no longer matches where it is drawn.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.topology_layout_issues AS
  SELECT e.site_uuid,
         e.equipment_id,
         'OUTSIDE_ROOM'::text AS issue,
         format('%s is drawn at (%s, %s), outside %s',
                e.equipment_id, e.layout_x, e.layout_y, r.room_name) AS detail
    FROM public.equipment_registry e
    JOIN public.rooms r ON r.id = e.room_id
   WHERE e.layout_x IS NOT NULL
     AND r.layout_x IS NOT NULL
     AND NOT (e.layout_x BETWEEN r.layout_x AND r.layout_x + r.layout_w
          AND e.layout_y BETWEEN r.layout_y AND r.layout_y + r.layout_h);

COMMENT ON VIEW public.topology_layout_issues IS
  'Equipment drawn outside the room it is assigned to. Either the coordinates '
  'or the room_id is wrong.';

COMMIT;
