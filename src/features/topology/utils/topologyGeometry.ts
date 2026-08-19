// ─────────────────────────────────────────────────────────────────────────────
// The topology contract types, and pure geometry helpers.
//
// Deliberately free of any network or React dependency: the renderer needs the
// shapes and the maths, not a Supabase client. Keeping these here means
// TopologyCanvas can be rendered — and tested — without a database, and that
// importing a coordinate helper never drags an auth token into the bundle.
//
// The types mirror get_topology_graph() one-for-one. See
// supabase/migrations/20260814_topology_layout.sql — that function is the
// contract; if it changes, this file changes with it and nothing else has to.
// ─────────────────────────────────────────────────────────────────────────────

/** Node types the WASM PowerMatrix engine understands. */
export type EngineType =
  | "grid_tx" | "tco" | "main_db" | "ups"
  | "rectifier" | "cooling" | "server" | "generator";

/** Isometric cube variant to draw. Independent of engine_type, because
 *  decorative equipment (fire suppression) is drawn but never simulated, and
 *  the two server distribution boards are drawn in rack colours despite being
 *  distribution boards electrically. */
export type RenderShape =
  | "transformer" | "generator" | "tco" | "db" | "ups"
  | "rectifier" | "server" | "aircon" | "fss" | "bus";

/** How a node combines multiple upstream feeds. */
export type InputPolicy = "ANY" | "ALL" | "PRIORITY";

export interface TopologyNode {
  id:           string;
  type:         EngineType | null;
  name:         string;
  category:     string;
  room_id:      string | null;
  is_active:    boolean;
  input_policy: InputPolicy;
  /** false = draw it, but keep it out of the physics. */
  simulated:    boolean;
  shape:        RenderShape | null;
  x:            number | null;
  y:            number | null;
  capacity:     number;
  voltage:      number;
  current:      number;
  kw_load:      number;
}

export interface TopologyEdge {
  source:         string;
  source_port:    string;
  target:         string;
  target_port:    string;
  /** Lower wins at a PRIORITY-policy target. */
  priority:       number;
  type:           string;
  render_path_id: string | null;
  /** Hand-routed SVG path. NULL → renderer falls back to a straight line. */
  d:              string | null;
}

/** A room floor plate — the ground plane equipment is drawn on. Without these
 *  the canvas shows equipment floating in a void with no sense of place. */
export interface TopologyRoom {
  id:         string;
  name:       string;
  label:      string;
  x:          number;
  y:          number;
  w:          number;
  h:          number;
  label_x:    number;
  label_y:    number;
  label_size: number;
  /** Faint zone wash, e.g. "rgba(16, 185, 129, 0.01)". */
  tint:       string | null;
}

export interface TopologyGraph {
  site_uuid:    string;
  generated_at: string;
  rooms:        TopologyRoom[];
  nodes:        TopologyNode[];
  edges:        TopologyEdge[];
}

export interface ViewBox { x: number; y: number; w: number; h: number }

// ─────────────────────────────────────────────────────────────────────────────
// The isometric projection.
//
// Equipment is stored in plain top-down grid coordinates. The canvas wraps the
// entire scene in one transform that turns it 2.5D — matching index.html:
//
//     transform="translate(4200, 200) scale(1, 0.5) rotate(45)"
//
// rotate(45) puts the grid on its diagonal; scale(1, 0.5) squashes it to the
// classic 2:1 isometric ratio. A flat square then reads as the top face of a
// cube and the polygons beneath it as its sides.
//
// The translate is omitted here: the old page needed it to push a fixed viewBox
// into frame, whereas computeViewBox derives the frame from the data.
// ─────────────────────────────────────────────────────────────────────────────
export const ISO_ROTATION_DEG = 45;
export const ISO_Y_SCALE      = 0.5;
export const ISO_TRANSFORM    = `scale(1, ${ISO_Y_SCALE}) rotate(${ISO_ROTATION_DEG})`;

const ISO_COS = Math.cos((ISO_ROTATION_DEG * Math.PI) / 180);
const ISO_SIN = Math.sin((ISO_ROTATION_DEG * Math.PI) / 180);

/**
 * Projects a grid point into screen space through the same matrix the canvas
 * applies. Bounds MUST be computed in projected space — a 45° rotation moves
 * every corner, so measuring the flat grid would frame the wrong rectangle and
 * clip the scene.
 */
export function projectIso(x: number, y: number): { x: number; y: number } {
  return {
    x: x * ISO_COS - y * ISO_SIN,
    y: (x * ISO_SIN + y * ISO_COS) * ISO_Y_SCALE
  };
}

/**
 * Derives a viewBox from the node coordinates.
 *
 * The legacy renderer hardcodes viewBox="0 0 7400 4000", which no longer
 * contains the drawing — equipment now extends to y=5800. Computing it from the
 * data means anything added later is in frame automatically, with no constant
 * anyone has to remember to update.
 *
 * `pad` clears the cube glyph, which extends roughly ±240 around its origin.
 */
export function computeViewBox(
  nodes: TopologyNode[],
  rooms: TopologyRoom[] = [],
  pad = 300
): ViewBox {
  const placed = nodes.filter(n => n.x !== null && n.y !== null);
  if (placed.length === 0 && rooms.length === 0) return { x: 0, y: 0, w: 1000, h: 1000 };

  // Every point is projected before measuring. A 45° rotation moves all four
  // corners of the drawing, so bounds taken in grid space would frame the wrong
  // rectangle and clip the scene badly.
  const pts: { x: number; y: number }[] = [];

  for (const n of placed) {
    pts.push(projectIso(n.x as number, n.y as number));
  }

  // All FOUR corners of each room plate: under rotation the extremes of a
  // rectangle are no longer just its opposite corners.
  for (const r of rooms) {
    pts.push(projectIso(r.x,       r.y));
    pts.push(projectIso(r.x + r.w, r.y));
    pts.push(projectIso(r.x,       r.y + r.h));
    pts.push(projectIso(r.x + r.w, r.y + r.h));
  }

  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);

  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const maxX = Math.max(...xs) + pad;
  const maxY = Math.max(...ys) + pad;

  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Straight-line fallback for a cable that was never hand-routed. */
export function fallbackPath(
  from: TopologyNode | undefined,
  to:   TopologyNode | undefined
): string | null {
  if (!from || !to) return null;
  if (from.x === null || from.y === null || to.x === null || to.y === null) return null;
  return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
}
