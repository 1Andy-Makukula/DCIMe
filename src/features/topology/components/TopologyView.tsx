import { useMemo, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, Info, Zap, ZapOff, Flame, RotateCcw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { siteLabel } from "@/shared/utils/branding";
import {
  useTopologyGraph,
  type TopologyNode
} from "@/features/topology/hooks/useTopologyGraph";
import { useTopologyEngine } from "@/features/topology/hooks/useTopologyEngine";
import { TopologyCanvas } from "./TopologyCanvas";

// ─────────────────────────────────────────────────────────────────────────────
// The topology route.
//
// Replaces the standalone page previously reached by
// window.open("/topology_engine/renderer/index.html"). Mounting it inside the
// admin shell means it inherits authentication, site context and navigation
// instead of being a demo bolted to the side of the product.
//
// Stage 5 supplies the `runtime` map from the WASM engine; until then this
// renders the static graph, which is the correct intermediate state — the
// drawing is already fully database-driven.
// ─────────────────────────────────────────────────────────────────────────────

/** Optional site override, so the sandbox can be inspected without switching
 *  the whole app's site context. */
export interface TopologyViewProps {
  siteUuid?: string;
}

/** A simulation toggle. Active state is a deliberate colour change, not just a
 *  label swap — an operator must see at a glance what they have broken. */
function SimButton({
  onClick, active, icon: Icon, label, disabled
}: {
  onClick: () => void;
  active: boolean;
  icon: LucideIcon;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={[
        "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors",
        disabled ? "cursor-not-allowed border-slate-800 text-slate-600"
                 : active ? "border-brand-500/50 bg-brand-500/15 text-brand-300"
                          : "border-slate-700 text-slate-300 hover:bg-slate-800"
      ].join(" ")}
    >
      <Icon size={13} /> {label}
    </button>
  );
}

export function TopologyView({ siteUuid }: TopologyViewProps) {
  const { currentSite } = useCurrentSite();
  const { graph, simulated, isLoading, error, refresh } = useTopologyGraph(siteUuid);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Stage 5: live state from the C++ engine, running in this browser tab.
  const { runtime, globals, graphIssues, isReady, error: engineError, controls } =
    useTopologyEngine(graph);

  const faulted = useMemo(
    () => new Set(Object.entries(runtime).filter(([, s]) => s.is_faulted).map(([id]) => id)),
    [runtime]
  );

  const selected: TopologyNode | undefined = useMemo(
    () => graph?.nodes.find(n => n.id === selectedId),
    [graph, selectedId]
  );

  const stats = useMemo(() => {
    if (!graph) return null;
    const drawn = graph.nodes.filter(n => n.x !== null).length;
    const routed = graph.edges.filter(e => e.d !== null).length;
    return {
      nodes: graph.nodes.length,
      drawn,
      simulated: simulated.length,
      edges: graph.edges.length,
      routed
    };
  }, [graph, simulated]);

  if (isLoading) {
    return (
      <div className="flex h-full min-h-[24rem] items-center justify-center text-slate-400">
        <Loader2 size={18} className="mr-2 animate-spin" />
        <span className="text-[12px] font-bold uppercase tracking-wider">
          Loading topology…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full min-h-[24rem] flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle size={22} className="text-danger-500" />
        <p className="text-[13px] font-bold text-slate-200">Could not load the topology</p>
        <p className="max-w-md text-[12px] text-slate-400">{error}</p>
        <button
          onClick={refresh}
          className="mt-2 flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300 transition-colors hover:bg-slate-800"
        >
          <RefreshCw size={13} /> Retry
        </button>
      </div>
    );
  }

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="flex h-full min-h-[24rem] flex-col items-center justify-center gap-3 p-6 text-center">
        <Info size={22} className="text-slate-500" />
        <p className="text-[13px] font-bold text-slate-200">No topology for this site</p>
        <p className="max-w-md text-[12px] text-slate-400">
          Equipment appears here as soon as it is added to the registry with
          layout coordinates. Nothing needs deploying.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[30rem] flex-col gap-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-black uppercase tracking-wider text-slate-100">
            Power Topology
          </h2>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">
            {siteLabel(currentSite?.site_name)} · {stats?.simulated} simulated of{" "}
            {stats?.nodes} nodes · {stats?.edges} connections
          </p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300 transition-colors hover:bg-slate-800"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Simulation controls — the A/B redundancy demo */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">
          Simulate
        </span>
        <SimButton
          onClick={() => controls.setGrid(!(globals?.gridActive ?? true))}
          active={globals ? !globals.gridActive : false}
          icon={globals?.gridActive ? ZapOff : Zap}
          label={globals?.gridActive ? "Kill grid" : "Restore grid"}
          disabled={!isReady}
        />
        <SimButton
          onClick={() => controls.toggleFault("ups_1", !faulted.has("ups_1"))}
          active={faulted.has("ups_1")}
          icon={ZapOff} label="Fault UPS 1" disabled={!isReady}
        />
        <SimButton
          onClick={() => controls.toggleFault("ups_2", !faulted.has("ups_2"))}
          active={faulted.has("ups_2")}
          icon={ZapOff} label="Fault UPS 2" disabled={!isReady}
        />
        <SimButton
          onClick={() => controls.setFireAlarm(!(globals?.fireAlarm ?? false))}
          active={globals?.fireAlarm ?? false}
          icon={Flame} label="Fire alarm" disabled={!isReady}
        />
        <SimButton
          onClick={controls.reset}
          active={false} icon={RotateCcw} label="Reset" disabled={!isReady}
        />

        {globals && (
          <div className="ml-auto flex flex-wrap items-center gap-4 font-mono text-[10px] text-slate-400">
            <span>FUEL <b className="text-slate-200">{globals.fuelLiters.toFixed(0)}L</b></span>
            <span>BATT <b className="text-slate-200">{globals.batterySoc.toFixed(0)}%</b></span>
            <span>TEMP <b className="text-slate-200">{globals.ambientTemp.toFixed(1)}°C</b></span>
            <span>DG <b className="text-slate-200">{globals.dgPairStatus}</b></span>
          </div>
        )}
      </div>

      {(engineError || graphIssues.length > 0) && (
        <div className="rounded-xl border border-warn-500/30 bg-warn-500/10 px-3 py-2 text-[11px] text-warn-300">
          {engineError
            ? `Simulation engine unavailable — showing the static graph. ${engineError}`
            : `${graphIssues.length} graph issue(s): ${graphIssues.slice(0, 3).join("; ")}`}
        </div>
      )}

      {/* Canvas */}
      <div className="relative min-h-[26rem] flex-1 overflow-hidden rounded-2xl border border-slate-800">
        <TopologyCanvas
          graph={graph}
          runtime={runtime}
          selectedNodeId={selectedId}
          onSelectNode={setSelectedId}
        />

        {selected && (
          <div className="absolute bottom-3 left-3 max-w-xs rounded-xl border border-slate-700 bg-slate-900/95 p-3 backdrop-blur">
            <p className="text-[12px] font-black text-slate-100">{selected.name}</p>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">
              {selected.id}
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px] text-slate-400">
              <dt>Type</dt><dd className="text-slate-200">{selected.type ?? "decorative"}</dd>
              <dt>Policy</dt><dd className="text-slate-200">{selected.input_policy}</dd>
              <dt>Capacity</dt><dd className="text-slate-200">{selected.capacity}</dd>
              <dt>Voltage</dt><dd className="text-slate-200">{selected.voltage} V</dd>
              <dt>State</dt>
              <dd className={runtime[selected.id]?.energised === false ? "text-danger-400" : "text-ok-400"}>
                {runtime[selected.id]?.status ?? "—"}
              </dd>
              <dt>Load</dt>
              <dd className="text-slate-200">
                {runtime[selected.id]?.load_pct != null
                  ? `${runtime[selected.id].load_pct!.toFixed(1)}%` : "—"}
              </dd>
            </dl>
          </div>
        )}
      </div>

      {/* Provenance line. The drawing is data now — worth saying so on the screen
          that used to be hand-authored markup. */}
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-slate-600">
        {stats?.drawn} drawn · {stats?.routed} hand-routed cables · rendered from
        the equipment registry · {isReady ? "C++ engine live" : "engine loading"}
      </p>
    </div>
  );
}
