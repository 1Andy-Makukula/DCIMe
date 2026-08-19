import { useEffect, useRef, useState, useCallback } from "react";
import type { TopologyGraph } from "@/features/topology/utils/topologyGeometry";
import type { NodeRuntimeState } from "@/features/topology/components/TopologyCanvas";

// ─────────────────────────────────────────────────────────────────────────────
// Drives the C++ PowerMatrix engine (compiled to WASM) from a database-loaded
// topology, and reports live node state back for rendering.
//
// The engine runs IN THE BROWSER. There is no server round-trip per simulation
// tick, no shared mutable state between users, and no way for one operator's
// "what if" to touch anyone else's session.
//
// Lifecycle mirrors the C++ contract exactly:
//   beginLoad() -> addNode()* -> addEdge()* -> buildGraph() -> [frozen]
// after which only state mutates. Reloading the graph means starting over.
// ─────────────────────────────────────────────────────────────────────────────

/** Global facility state the engine tracks outside the node graph. */
export interface EngineGlobals {
  gridActive:    boolean;
  fireAlarm:     boolean;
  fuelLiters:    number;
  batterySoc:    number;
  ambientTemp:   number;
  dgPairStatus:  string;
  dgRunHours:    number[];
}

export interface EngineControls {
  toggleFault:  (nodeId: string, faulted: boolean) => void;
  setGrid:      (active: boolean) => void;
  setFireAlarm: (active: boolean) => void;
  setCooling:   (active: boolean) => void;
  clearFaults:  () => void;
  reset:        () => void;
}

export interface UseTopologyEngineResult {
  runtime:    Record<string, NodeRuntimeState>;
  globals:    EngineGlobals | null;
  graphIssues: string[];
  isReady:    boolean;
  /** true when the WASM module failed and no simulation is running. */
  error:      string | null;
  controls:   EngineControls;
}

// The compiled module is served from public/, so it is fetched at runtime
// rather than bundled. @vite-ignore stops Vite trying to resolve it at build
// time — it is an emitted artifact of build_wasm.ps1, not a source dependency.
const WASM_URL = "/topology_engine/renderer/topology_engine.js";

let modulePromise: Promise<any> | null = null;

/** Loads the WASM module once per page, not once per component. */
function loadEngineModule(): Promise<any> {
  if (!modulePromise) {
    modulePromise = import(/* @vite-ignore */ WASM_URL)
      .then((m: any) => (m.default ?? m)())
      .catch(err => {
        modulePromise = null;   // allow a retry on the next mount
        throw err;
      });
  }
  return modulePromise;
}

/** embind returns C++ vectors that must be read then freed explicitly. */
function drainVector<T>(vec: any): T[] {
  const out: T[] = [];
  if (!vec) return out;
  const n = vec.size();
  for (let i = 0; i < n; i++) out.push(vec.get(i));
  vec.delete();
  return out;
}

const TICK_MS = 1000;   // one simulated second per real second

export function useTopologyEngine(
  graph: TopologyGraph | null,
  running: boolean = true
): UseTopologyEngineResult {
  const engineRef  = useRef<any>(null);
  const [runtime, setRuntime]         = useState<Record<string, NodeRuntimeState>>({});
  const [globals, setGlobals]         = useState<EngineGlobals | null>(null);
  const [graphIssues, setGraphIssues] = useState<string[]>([]);
  const [isReady, setIsReady]         = useState(false);
  const [error, setError]             = useState<string | null>(null);

  // ── Load the graph into the engine ────────────────────────────────────────
  useEffect(() => {
    if (!graph) return;
    let cancelled = false;

    loadEngineModule()
      .then(Module => {
        if (cancelled) return;

        // Replace any previous instance; embind objects are not GC'd.
        if (engineRef.current) { engineRef.current.delete(); engineRef.current = null; }
        const pm = new Module.PowerMatrix();

        pm.beginLoad();

        // Only simulated nodes enter the physics. Decorative equipment (fire
        // suppression) is drawn by the canvas but has no place in a cascade.
        const simulated = graph.nodes.filter(n => n.simulated);
        for (const n of simulated) {
          pm.addNode({
            id:              n.id,
            type:            n.type ?? "main_db",
            name:            n.name,
            is_active:       n.is_active,
            is_faulted:      false,
            capacity:        n.capacity,
            load_pct:        0,
            voltage:         n.voltage,
            current:         n.current,
            // The RATED draw. buildGraph() snapshots this before the per-type
            // passes overwrite kw_load with the current draw.
            kw_load:         n.kw_load,
            runtime_minutes: 0,
            status:          "ONLINE"
          });
        }

        const known = new Set(simulated.map(n => n.id));
        for (const e of graph.edges) {
          if (!known.has(e.source) || !known.has(e.target)) continue;
          // embind ignores C++ default arguments — all five are required.
          pm.addEdge(e.source, e.target, e.priority, e.source_port, e.target_port);
        }
        for (const n of simulated) {
          pm.setInputPolicy(n.id, n.input_policy);
        }

        pm.buildGraph();
        setGraphIssues(drainVector<string>(pm.getGraphIssues()));

        engineRef.current = pm;
        setError(null);
        setIsReady(true);
      })
      .catch(err => {
        if (cancelled) return;
        // A missing or stale WASM build must not blank the topology — the
        // canvas still renders the graph, just without live state.
        setError(err?.message ?? "Simulation engine unavailable");
        setIsReady(false);
      });

    return () => {
      cancelled = true;
      if (engineRef.current) { engineRef.current.delete(); engineRef.current = null; }
      setIsReady(false);
    };
  }, [graph]);

  // ── Read one frame of state out of the engine ─────────────────────────────
  //
  // Guarded deliberately. This runs from an interval, so an exception here is
  // not caught by the promise chain above — it propagates into React and
  // unmounts the whole panel. That is how a WASM string-marshalling fault
  // (TextDecoder vs resizable ArrayBuffer) blanked the entire topology view
  // rather than merely stopping the simulation.
  //
  // A broken engine must degrade to "static graph, no live state", never to a
  // blank screen: the drawing is useful on its own.
  const sample = useCallback(() => {
    const pm = engineRef.current;
    if (!pm) return;

    try {
      const nodes = drainVector<any>(pm.getNodes());
      const next: Record<string, NodeRuntimeState> = {};
      for (const n of nodes) {
        next[n.id] = {
          status:     n.status,
          is_faulted: n.is_faulted,
          energised:  n.is_active,
          load_pct:   n.load_pct
        };
      }
      setRuntime(next);

      setGlobals({
        gridActive:   pm.getGridActive(),
        fireAlarm:    pm.getFireAlarmActive(),
        fuelLiters:   pm.getFuelLiters(),
        batterySoc:   pm.getBatterySoc(),
        ambientTemp:  pm.getAmbientTemp(),
        dgPairStatus: pm.getDgPairStatus(),
        dgRunHours:   [0, 1, 2, 3].map(i => pm.getDgRunHours(i))
      });
    } catch (err: any) {
      // Stop the engine rather than fault every tick from here on.
      console.error("[topology engine] sample failed, falling back to static graph:", err);
      engineRef.current = null;
      setIsReady(false);
      setRuntime({});
      setGlobals(null);
      setError(err?.message ?? "Simulation engine stopped");
    }
  }, []);

  // ── Tick ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isReady) return;

    // Sample immediately so the graph is coloured before the first interval.
    const pm = engineRef.current;
    if (pm) { pm.runMatrixUpdate(); sample(); }

    if (!running) return;
    const id = window.setInterval(() => {
      const e = engineRef.current;
      if (!e) return;
      e.updateState(TICK_MS / 1000);
      e.runMatrixUpdate();
      sample();
    }, TICK_MS);

    return () => window.clearInterval(id);
  }, [isReady, running, sample]);

  // ── Controls ──────────────────────────────────────────────────────────────
  const act = useCallback((fn: (pm: any) => void) => {
    const pm = engineRef.current;
    if (!pm) return;
    fn(pm);
    pm.runMatrixUpdate();
    sample();
  }, [sample]);

  const controls: EngineControls = {
    toggleFault:  useCallback((id, f) => act(pm => pm.toggleNodeFault(id, f)), [act]),
    setGrid:      useCallback(a => act(pm => pm.setGridActive(a)),      [act]),
    setFireAlarm: useCallback(a => act(pm => pm.setFireAlarmActive(a)), [act]),
    setCooling:   useCallback(a => act(pm => pm.setCoolingActive(a)),   [act]),
    clearFaults:  useCallback(() => act(pm => pm.clearAllFaults()),     [act]),
    reset:        useCallback(() => act(pm => pm.resetAll()),           [act])
  };

  return { runtime, globals, graphIssues, isReady, error, controls };
}
