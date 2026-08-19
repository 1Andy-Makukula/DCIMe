import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState
} from "react";
import {
  computeViewBox,
  fallbackPath,
  ISO_TRANSFORM,
  type RenderShape,
  type TopologyEdge,
  type TopologyGraph,
  type TopologyNode
} from "@/features/topology/utils/topologyGeometry";
import "./topology-canvas.css";

// ─────────────────────────────────────────────────────────────────────────────
// Generates the topology SVG from the graph payload.
//
// This replaces the 49 hand-authored <g> groups in
// public/topology_engine/renderer/index.html. The geometry is identical —
// layout_x/layout_y and render_path_d were lifted verbatim out of that file by
// scripts/extract_topology_layout.py — so a node added in the database now
// appears here without anyone touching markup.
//
// Every node is the same isometric cube: two polygons (left/right faces) and a
// rect (top face), differing only by position and a face-<shape> class. The one
// exception is the generator paralleling busbar, which is drawn as a line.
// ─────────────────────────────────────────────────────────────────────────────

/** Live state per node, supplied by the WASM engine. Stage 5 wires this up;
 *  until then the canvas renders the static graph. */
export interface NodeRuntimeState {
  status?:     string;
  is_faulted?: boolean;
  energised?:  boolean;
  load_pct?:   number;
}

export interface TopologyCanvasProps {
  graph:          TopologyGraph;
  runtime?:       Record<string, NodeRuntimeState>;
  selectedNodeId?: string | null;
  onSelectNode?:  (nodeId: string | null) => void;
  className?:     string;
}

// Cube half-extent. Matches the hand-drawn polygons so generated nodes line up
// with the original artwork exactly.
const H = 80;
const D = 160;

/** Cooling units carry a fan; the grid transformer carries cooling fins. */
const HAS_FAN  = new Set<RenderShape>(["aircon"]);
const HAS_FINS = new Set<RenderShape>(["transformer"]);

function statusClass(state: NodeRuntimeState | undefined): string {
  if (!state) return "";
  if (state.is_faulted) return "is-faulted";
  if (state.energised === false) return "is-dead";
  if (typeof state.load_pct === "number" && state.load_pct > 90) return "is-overloaded";
  return "is-live";
}

function statusText(node: TopologyNode, state: NodeRuntimeState | undefined): string {
  if (!node.simulated) return "MONITOR";
  if (!state) return node.is_active ? "ONLINE" : "STANDBY";
  if (state.is_faulted) return "FAULTED";
  if (state.energised === false) return "NO VOLTAGE";
  return state.status ?? "ONLINE";
}

/** One isometric cube. */
function NodeGlyph({
  node, state, selected, onSelect
}: {
  node: TopologyNode;
  state?: NodeRuntimeState;
  selected: boolean;
  onSelect?: (id: string | null) => void;
}) {
  const shape = node.shape ?? "db";
  const cls = [
    "node-group",
    `shape-${shape}`,
    statusClass(state),
    selected ? "is-selected" : "",
    node.simulated ? "" : "is-decorative"
  ].filter(Boolean).join(" ");

  return (
    <g
      id={node.id}
      className={cls}
      transform={`translate(${node.x}, ${node.y})`}
      onClick={e => { e.stopPropagation(); onSelect?.(selected ? null : node.id); }}
      role="button"
      tabIndex={0}
      aria-label={`${node.name}, ${statusText(node, state)}`}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(selected ? null : node.id);
        }
      }}
    >
      <polygon
        points={`0,${D}  ${D},${D}  ${H},${H}  -${H},${H}`}
        className={`cube-face face-left face-${shape}`}
      />
      <polygon
        points={`${D},0  ${D},${D}  ${H},${H}  ${H},-${H}`}
        className={`cube-face face-right face-${shape}`}
      />
      <rect
        x={-H} y={-H} width={D} height={D}
        className={`cube-face face-top face-${shape}`}
      />

      {HAS_FAN.has(shape) && (
        <circle cx={0} cy={0} r={36} className="cooling-fan" />
      )}
      {HAS_FINS.has(shape) && [30, 65, 100, 130].map(x1 => (
        <line key={x1} x1={x1} y1={D} x2={x1 - 80} y2={H} className="cooling-fin" />
      ))}

      <text className="node-label" x={0} y={5}>{node.name}</text>
      <text className="node-status" x={0} y={28}>{statusText(node, state)}</text>
    </g>
  );
}

/** The generator paralleling busbar — a line, not a box. */
function BusGlyph({ node }: { node: TopologyNode }) {
  return (
    <g id={node.id} className="node-group shape-bus">
      <path d={`M 300 150 L 1700 150`} className="power-line line-backup bus-bar" />
      <text className="node-label bus-label" x={node.x ?? 0} y={(node.y ?? 0) - 30}>
        {node.name}
      </text>
    </g>
  );
}

export function TopologyCanvas({
  graph,
  runtime = {},
  selectedNodeId = null,
  onSelectNode,
  className = ""
}: TopologyCanvasProps) {
  const byId = useMemo(
    () => new Map(graph.nodes.map(n => [n.id, n])),
    [graph.nodes]
  );

  // Derived from the data, never hardcoded. The legacy page pinned
  // viewBox="0 0 7400 4000", which stopped containing the drawing the moment
  // equipment was added below y=4000.
  const vb = useMemo(
    () => computeViewBox(graph.nodes, graph.rooms ?? []),
    [graph.nodes, graph.rooms]
  );

  const drawable = useMemo(
    () => graph.nodes.filter(n => n.x !== null && n.y !== null),
    [graph.nodes]
  );

  // ── Viewport ──────────────────────────────────────────────────────────────
  // Under the isometric projection the scene is roughly 2:1 LANDSCAPE
  // (~6800 x 3400 units), because rotating the grid 45 degrees and halving Y
  // turns a portrait plan into a wide diamond. That fits a wide panel well, so
  // the default is fit-to-all rather than fit-to-width.
  //
  // The viewBox still tracks the container in CSS pixels with the content
  // transformed inside it, which is what gives cursor-anchored zoom and drag to
  // pan. preserveAspectRatio alone would allow neither.
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const r = entries[0].contentRect;
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback((mode: "all" | "width" = "all") => {
    if (!size.w || !size.h || vb.w <= 0) return;
    const pad = 0.94;
    const k = mode === "all"
      ? Math.min(size.w / vb.w, size.h / vb.h) * pad
      : (size.w / vb.w) * pad;
    setView({
      x: (size.w - vb.w * k) / 2 - vb.x * k,
      y: mode === "all" ? (size.h - vb.h * k) / 2 - vb.y * k : -vb.y * k + 24,
      k
    });
  }, [size.w, size.h, vb]);

  // Fit once the container is measured, and again if the bounds move.
  useEffect(() => { fit("all"); }, [size.w, size.h, vb.w, vb.h]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wheel zoom needs a non-passive listener or preventDefault is ignored and
  // the page scrolls instead of the canvas zooming.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      const py = ev.clientY - rect.top;
      setView(v => {
        const k = Math.min(4, Math.max(0.02, v.k * (ev.deltaY < 0 ? 1.12 : 1 / 1.12)));
        // Hold the point under the cursor still while scaling.
        return { k, x: px - (px - v.x) * (k / v.k), y: py - (py - v.y) * (k / v.k) };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setView(v => ({ ...v, x: d.vx + (e.clientX - d.x), y: d.vy + (e.clientY - d.y) }));
  };
  const endDrag = (e: React.PointerEvent) => {
    if (!drag.current) return;
    (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    drag.current = null;
  };

  const edgeClass = (edge: TopologyEdge, src: TopologyNode | undefined) => {
    const state = runtime[edge.source];
    const dead  = state?.energised === false || state?.is_faulted;
    const kind =
      src?.type === "generator" || src?.id === "node-dg-bus" ? "line-backup"
      : src?.type === "grid_tx"                              ? "line-grid"
      : edge.target_port?.endsWith("_B") || edge.source_port?.endsWith("_B")
                                                             ? "line-active-b"
      : "line-active-a";
    return ["power-line", kind, dead ? "is-dead" : "animated-flow"].join(" ");
  };

  return (
    <div ref={wrapRef} className={`topology-viewport ${className}`}>
      <svg
        className="topology-canvas"
        viewBox={`0 0 ${size.w || 1} ${size.h || 1}`}
        onClick={() => onSelectNode?.(null)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
      <g transform={`translate(${view.x}, ${view.y}) scale(${view.k})`}>
      {/*
        THE ISOMETRIC PROJECTION.

        Every node, cable and room below is authored in plain top-down grid
        coordinates — the same coordinates stored in layout_x / layout_y. This
        single wrapper turns the whole scene 2.5D, exactly as index.html does at
        line 123:

            transform="translate(4200, 200) scale(1, 0.5) rotate(45)"

        rotate(45) turns the grid onto its diagonal; scale(1, 0.5) squashes it
        vertically to a 2:1 ratio. That is what makes a flat square read as the
        top face of a cube, and the two polygons beneath it read as its sides.

        Keeping the projection here rather than baking it into every glyph means
        the stored coordinates stay human-readable, the Stage 10 editor can drag
        in grid space, and swapping to a plan view later is a one-line change.
      */}
      <g className="isometric-scene" transform={ISO_TRANSFORM}>
      {/* Rooms first — the ground plane everything else sits on. */}
      <g className="layer-rooms">
        {(graph.rooms ?? []).map(r => (
          <g key={r.id} className="room-plate">
            <rect
              x={r.x} y={r.y} width={r.w} height={r.h}
              style={r.tint ? { fill: r.tint } : undefined}
            />
            <text x={r.label_x} y={r.label_y} style={{ fontSize: `${r.label_size}px` }}>
              {r.label}
            </text>
          </g>
        ))}
      </g>

      {/* Cables next, so nodes sit on top of them. */}
      <g className="layer-edges">
        {graph.edges.map(edge => {
          const src = byId.get(edge.source);
          const d = edge.d ?? fallbackPath(src, byId.get(edge.target));
          if (!d) return null;
          return (
            <path
              key={`${edge.source}:${edge.source_port}->${edge.target}:${edge.target_port}`}
              d={d}
              data-path-id={edge.render_path_id ?? undefined}
              className={edgeClass(edge, src)}
            />
          );
        })}
      </g>

      <g className="layer-nodes">
        {drawable.map(node =>
          node.shape === "bus"
            ? <BusGlyph key={node.id} node={node} />
            : <NodeGlyph
                key={node.id}
                node={node}
                state={runtime[node.id]}
                selected={selectedNodeId === node.id}
                onSelect={onSelectNode}
              />
        )}
      </g>
      </g>
      </g>
      </svg>

      {/* A 4650 x 6450 drawing is unusable without these. */}
      <div className="topology-controls">
        <button
          onClick={e => { e.stopPropagation(); setView(v => ({ ...v, k: Math.min(4, v.k * 1.25) })); }}
          title="Zoom in" aria-label="Zoom in"
        >+</button>
        <button
          onClick={e => { e.stopPropagation(); setView(v => ({ ...v, k: Math.max(0.02, v.k / 1.25) })); }}
          title="Zoom out" aria-label="Zoom out"
        >&minus;</button>
        <button
          onClick={e => { e.stopPropagation(); fit("width"); }}
          title="Fit width" aria-label="Fit width"
        >&#8596;</button>
        <button
          onClick={e => { e.stopPropagation(); fit("all"); }}
          title="Fit all" aria-label="Fit all"
        >&#9744;</button>
        <span className="topology-zoom">{Math.round(view.k * 100)}%</span>
      </div>
    </div>
  );
}
