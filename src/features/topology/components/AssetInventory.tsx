import React, { useState, useMemo, useEffect } from "react";
import { ParameterLimits } from "./ParameterLimits";
import { CreateRoomModal, CreateEquipmentModal, AddParameterForm } from "./InventoryCreate";
import { EquipmentSchedules } from "./EquipmentSchedules";
import { AssetHistory } from "./AssetHistory";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { toast } from "sonner";
import { TelemetryChart } from "./TelemetryChart";
import {
  Search,
  Filter,
  Plus,
  Download,
  Zap,
  Thermometer,
  Network,
  Cpu,
  X,
  Loader2,
  Database,
  Activity,
  ChevronDown,
  ArrowUpDown
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type AssetStatus = "ONLINE" | "DEGRADED" | "OFFLINE" | "DECOMMISSIONED";
type AssetCategory = string;

interface Asset {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  category: AssetCategory;
  categoryDb?: string;
  ip: string;
  firmware: string;
  location: string;
  rack: string;
  status: AssetStatus;
  liveMetric: string;
  metricUnit: string;
  lastSeen: string;
  room_id?: string | null;
  is_active: boolean;
  /** Present when deployed from a template — enables fleet-wide scheduling. */
  template_id?: string | null;
}


// ── Category icon map ─────────────────────────────────────────────────────────
function categoryIcon(cat: string): React.ReactNode {
  const c = cat?.toUpperCase() ?? "";
  if (c === "AIRCON")    return <Thermometer size={13} className="text-info-400" />;
  if (c === "UPS")       return <Zap size={13} className="text-warn-500" />;
  if (c === "GENERATOR") return <Zap size={13} className="text-warn-400" />;
  if (c === "MAINS")     return <Network size={13} className="text-series-5" />;
  if (c === "RECTIFIER") return <Cpu size={13} className="text-ok-500" />;
  return <Activity size={13} className="text-neutral-400" />;
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: AssetStatus }) {
  const styles: Record<AssetStatus, string> = {
    ONLINE:         "bg-ok-100  text-ok-700",
    DEGRADED:       "bg-warn-100 text-warn-700",
    OFFLINE:        "bg-danger-100    text-danger-700",
    DECOMMISSIONED: "bg-neutral-100   text-neutral-500",
  };
  const dots: Record<AssetStatus, string> = {
    ONLINE:         "bg-ok-500",
    DEGRADED:       "bg-warn-400",
    OFFLINE:        "bg-danger-500",
    DECOMMISSIONED: "bg-neutral-400",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${styles[status] ?? "bg-neutral-100 text-neutral-500"}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dots[status] ?? "bg-neutral-400"}`} />
      {status}
    </span>
  );
}

// ── Dropdown helper ───────────────────────────────────────────────────────────
function FilterDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleClose = () => setIsOpen(false);
    window.addEventListener("click", handleClose);
    return () => window.removeEventListener("click", handleClose);
  }, [isOpen]);

  const activeLabel = value || label;

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 h-9 px-3.5 rounded-xl border border-neutral-200 bg-white text-[11px] font-black text-neutral-700 uppercase tracking-wider cursor-pointer hover:border-neutral-300 focus:outline-none transition-all"
      >
        <span>{activeLabel}</span>
        <ChevronDown
          size={12}
          className={`text-neutral-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 z-20 bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden min-w-[120px] w-max max-w-[200px]">
          {/* Reset option */}
          <button
            type="button"
            onClick={() => {
              onChange("");
              setIsOpen(false);
            }}
            className={`w-full text-left px-4 py-2.5 text-[11px] font-black uppercase tracking-wider transition-colors ${
              value === "" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            All {label}s
          </button>
          {options.map((o) => (
            <button
              type="button"
              key={o}
              onClick={() => {
                onChange(o);
                setIsOpen(false);
              }}
              className={`w-full text-left px-4 py-2.5 text-[11px] font-black uppercase tracking-wider transition-colors ${
                value === o ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Table header cell ─────────────────────────────────────────────────────────
function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-3 text-left text-xs font-black text-neutral-400 uppercase tracking-widest whitespace-nowrap ${className}`}
    >
      {children}
    </th>
  );
}



// ── ChartPanel — embedded telemetry chart section ─────────────────────────────

function ChartPanel({ equipmentId }: { equipmentId: string }) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="border-b border-neutral-100 flex-shrink-0">
      {/* Collapsible header.
          A bare 12px chevron in neutral-400 was the only thing saying this
          section opens, and it read as decoration — people did not know there
          was anything to click. The control now says what it does in words,
          sits in a bordered pill that looks pressable, and the whole header
          highlights on hover. */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        className="group w-full flex items-center justify-between px-6 py-3.5 hover:bg-brand-50/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger-500)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </div>
          <span className="text-[10px] font-black text-neutral-700 uppercase tracking-widest">
            Telemetry History (24 h)
          </span>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-neutral-500 transition-colors group-hover:border-brand-300 group-hover:bg-brand-50 group-hover:text-brand-700">
          {isOpen ? "Hide chart" : "Show chart"}
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
            className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </span>
      </button>

      {isOpen && (
        <div className="px-6 pb-5">
          <TelemetryChart equipmentId={equipmentId} />
        </div>
      )}
    </div>
  );
}

interface ManageParametersModalProps {
  isOpen: boolean;
  onClose: () => void;
  equipmentId: string;
  /** Enables fleet-wide scheduling when the machine came from a template. */
  templateId?: string | null;
}

interface EquipmentParameter {
  id: string;
  equipment_id: string;
  parameter_name: string;
  data_type: 'number' | 'string' | 'boolean';
  is_constant: boolean;
  constant_value: string | null;
  is_graphable: boolean;
  unit: string | null;
  created_at: string;
  // The safe operating range. NULL on either side means unbounded there — and
  // a parameter with neither bound can never raise an alarm.
  min_value: number | null;
  max_value: number | null;
  // The warning band, inside the hard limits: "still acceptable, heading the
  // wrong way". Optional — hard limits alone still alarm, just without warning.
  warn_min: number | null;
  warn_max: number | null;
}

/** What a reading has actually done, for the person choosing its limits. */
interface ObservedRange { p05: number | null; p95: number | null; n: number }

function ManageParametersModal({ isOpen, onClose, equipmentId, templateId }: ManageParametersModalProps) {
  const [parameters, setParameters] = useState<EquipmentParameter[]>([]);
  const [observedRanges, setObservedRanges] = useState<Record<string, ObservedRange>>({});
  const [isLoading, setIsLoading] = useState(true);
  // Parameters and schedules are two views of the same machine, so they belong
  // behind one click rather than on separate screens someone has to find.
  const [tab, setTab] = useState<"parameters" | "schedules" | "history">("parameters");

  const fetchParameters = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("equipment_parameters")
        .select("*")
        .eq("equipment_id", equipmentId)
        .order("created_at", { ascending: true });

      // What each of these readings has actually recorded. Shown beside the
      // inputs so a limit is chosen against the record rather than from memory.
      const { data: observed } = await (supabase.from as any)("parameter_observed_range")
        .select("parameter_name,p05,p95,numeric_readings")
        .eq("equipment_id", equipmentId);
      setObservedRanges(Object.fromEntries(
        (observed ?? []).map((o: any) => [o.parameter_name,
          { p05: o.p05, p95: o.p95, n: o.numeric_readings }])
      ));

      if (error) throw error;

      const sanitized: EquipmentParameter[] = (data || []).map((p: any) => ({
        ...p,
        is_constant: !!p.is_constant,
        data_type: (p.data_type as any) || "string",
        is_graphable: !!p.is_graphable,
        warn_min: p.warn_min ?? null,
        warn_max: p.warn_max ?? null,
        created_at: p.created_at || new Date().toISOString(),
        min_value: p.min_value ?? null,
        max_value: p.max_value ?? null
      }));
      setParameters(sanitized);
    } catch (err) {
      console.error("Error loading parameters:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && equipmentId) {
      fetchParameters();
    }
  }, [isOpen, equipmentId]);

  if (!isOpen) return null;

  const constants = parameters.filter((p) => p.is_constant);
  const telemetries = parameters.filter((p) => !p.is_constant);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-100 flex-shrink-0">
          <div>
            <div className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-0.5">
              EAV Parameter Engine · {equipmentId}
            </div>
            <h2 className="text-[16px] font-black text-neutral-900 leading-none">
              Equipment Parameters
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-all cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-neutral-100 px-6 pt-1 flex-shrink-0">
          {([["parameters", "Parameters"], ["schedules", "Maintenance"],
             ["history", "History"]] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-4 py-3 text-[12px] font-bold tracking-wide border-b-2 -mb-px transition-colors ${
                tab === k
                  ? "border-brand-500 text-neutral-900"
                  : "border-transparent text-neutral-400 hover:text-neutral-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
          {tab === "schedules" ? (
            <div className="p-6">
              <EquipmentSchedules equipmentId={equipmentId} templateId={templateId} />
            </div>
          ) : tab === "history" ? (
            /* The audit trail, beside the controls that write it — so somebody
               about to move a limit can see who last moved it. */
            <div className="p-6">
              <AssetHistory equipmentId={equipmentId} />
            </div>
          ) : (
          <>
          {/* Telemetry History Chart — full width panel */}
          <ChartPanel equipmentId={equipmentId} />

          {/* Parameters List */}
          <div className="p-6 overflow-y-auto flex flex-col gap-6">
            {/* Above the list, not below it: an asset created through the new
                Inventory flow arrives with no readings at all, so this is the
                first thing that needs doing rather than the last. */}
            {!isLoading && (
              <AddParameterForm equipmentId={equipmentId} onAdded={fetchParameters} />
            )}

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-neutral-400 gap-2">
                <Loader2 size={24} className="animate-spin text-brand-500" />
                <span className="text-xs font-bold uppercase tracking-wider">Loading parameters...</span>
              </div>
            ) : parameters.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-neutral-400 border-2 border-dashed border-neutral-100 rounded-2xl">
                <Database size={32} className="mb-2 text-neutral-300" />
                <span className="text-xs font-bold uppercase tracking-wider">No readings yet</span>
                <span className="mt-1 text-[11px] font-semibold normal-case tracking-normal text-neutral-300">
                  Add what a technician records here, and what the platform calculates from.
                </span>
              </div>
            ) : (
              <>
                {/* Constants Group */}
                {constants.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-neutral-50 pb-1.5">
                      <Database size={12} className="text-info-500" />
                      <span>Constant Identifiers & Thresholds ({constants.length})</span>
                    </h3>
                    <div className="space-y-2">
                      {constants.map((param) => (
                        <div
                          key={param.id}
                          className="bg-info-50/30 border border-info-100 rounded-xl p-3.5 flex items-center justify-between gap-4"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] font-black text-info-900 truncate">
                                {param.parameter_name}
                              </span>
                              <span className="bg-info-100 text-info-800 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded">
                                {param.data_type}
                              </span>
                            </div>
                            <div className="text-[11px] text-info-700/80 mt-1 font-semibold flex items-center gap-1.5 flex-wrap">
                              <span>Value: <strong className="font-mono bg-info-100/50 px-1 py-0.5 rounded text-info-900">{param.constant_value}</strong></span>
                              {param.unit && (
                                <span className="text-[9px] font-bold text-info-500 uppercase">[{param.unit}]</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Telemetry Group */}
                {telemetries.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-neutral-50 pb-1.5">
                      <Activity size={12} className="text-brand-500" />
                      <span>Flexible Telemetry Parameters ({telemetries.length})</span>
                    </h3>
                    <div className="space-y-2">
                      {telemetries.map((param) => (
                        <div
                          key={param.id}
                          className="bg-brand-50/20 border border-brand-100/50 rounded-xl p-3.5 flex items-center justify-between gap-4"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] font-black text-neutral-900 truncate">
                                {param.parameter_name}
                              </span>
                              <span className="bg-neutral-100 text-neutral-600 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded">
                                {param.data_type}
                              </span>
                              {param.is_graphable && (
                                <span className="bg-brand-100 text-brand-700 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded">
                                  Graphable
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-neutral-400 mt-1 font-semibold flex items-center gap-1.5">
                              <span>Telemetry Data Field</span>
                              {param.unit && (
                                <span className="text-[9px] font-bold text-neutral-500 uppercase">[{param.unit}]</span>
                              )}
                            </div>
                          </div>

                          {/* Numbers only: a range has no meaning for a status
                              string like "OK" or a yes/no flag. */}
                          {param.data_type === "number" && (
                            <ParameterLimits
                              parameterId={param.id}
                              band={{
                                min:     param.min_value,
                                warnMin: param.warn_min ?? null,
                                warnMax: param.warn_max ?? null,
                                max:     param.max_value
                              }}
                              unit={param.unit}
                              observed={observedRanges[param.parameter_name] ?? null}
                              onSaved={(b) =>
                                setParameters(prev =>
                                  prev.map(x =>
                                    x.id === param.id
                                      ? { ...x, min_value: b.min, max_value: b.max,
                                          warn_min: b.warnMin, warn_max: b.warnMax }
                                      : x
                                  )
                                )
                              }
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function AssetInventory() {
  const { currentSite } = useCurrentSite();
  const [assets,         setAssets]         = useState<Asset[]>([]);

  const [query,          setQuery]          = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStatus,   setFilterStatus]   = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [isParamsModalOpen, setIsParamsModalOpen] = useState(false);
  
  const [rooms, setRooms] = useState<any[]>([]);
  const [addingRoom, setAddingRoom] = useState(false);
  const [addingAsset, setAddingAsset] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);

  const fetchRooms = async () => {
    if (!currentSite?.id) return;
    try {
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("site_id", currentSite.id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      setRooms(data || []);
    } catch (err) {
      console.error("Error fetching rooms:", err);
    }
  };

  const fetchAssets = async () => {
    if (!currentSite?.id) {
      setAssets([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("equipment_registry")
        .select("*")
        .eq("site_uuid", currentSite.id)
        .order("equipment_id", { ascending: true });

      if (error) throw error;

      // Latest facility log for this site — the source of truth for live
      // metrics and per-asset health signals. (The old code fabricated
      // voltages per unit number, e.g. "47.6" for unit 2 regardless of
      // reality.)
      const { data: latestLog } = await supabase
        .from("telemetry_logs")
        .select("metrics, target_hour")
        .eq("site_uuid", currentSite.id)
        .eq("asset_id", "facility_wide")
        .order("target_hour", { ascending: false })
        .limit(1)
        .maybeSingle();

      const latestM = ((latestLog?.metrics as Record<string, any>) || {});
      const lastSeenLabel = latestLog?.target_hour
        ? new Date(latestLog.target_hour).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
        : null;

      // Preferred live-metric keys per category, in priority order.
      const metricCandidates = (normId: string, categoryDb: string): [string, string][] => {
        switch (categoryDb) {
          case "GENERATOR":
            return [[`${normId}_run_hrs`, "hrs"], [`${normId}_batt_voltage`, "V"], [`${normId}_cumulative_hrs`, "hrs cum"]];
          case "UPS":
            return [[`${normId}_battery_vdc`, "V DC"], [`${normId}_output_load_kw`, "kW"], [`${normId}_battery_charge_percent`, "%"]];
          case "RECTIFIER":
            return [[`${normId}_dc_voltage`, "V DC"], [`${normId}_dc_current`, "A DC"], [`${normId}_load_percent`, "%"]];
          case "AIRCON":
            return [[`${normId}_return_temp_actual`, "°C"], [`${normId}_supply_temp_actual`, "°C"]];
          case "MAINS":
            return [[`grid_voltage_rs`, "V AC"], [`grid_total_site_load`, "kW"], [`grid_frequency`, "Hz"]];
          default:
            return [];
        }
      };

      if (data) {
        const mapped = data.map((row: any) => {
          const id = row.equipment_id;
          const categoryDb = row.category;
          const normId = String(id).toLowerCase().replace(/-/g, "_");

          const categoryUi: AssetCategory = categoryDb === "AIRCON" ? "Cooling" : "Power";


          const name = row.name || `Equipment ${id}`;
          const manufacturer = row.manufacturer || "Standard";
          const model = row.model || "Generic Model";
          const ip = row.ip_address || "—";
          const firmware = row.firmware_version || "—";
          const rack = row.rack_location || "—";

          // ── Live metric: read the real value from the latest log ──
          let liveMetric = "—";
          let metricUnit = "";
          for (const [key, unit] of metricCandidates(normId, categoryDb)) {
            const raw = latestM[key];
            if (raw !== undefined && raw !== null && raw !== "" && !isNaN(Number(raw))) {
              // Zero is a legitimate reading (e.g. a generator that didn't
              // run shows 0 hrs — never override it with a fake value).
              liveMetric = String(raw);
              metricUnit = unit;
              break;
            }
          }
          // Generic fallback: any numeric metric namespaced to this asset
          if (liveMetric === "—") {
            const prefix = `${normId}_`;
            const hit = Object.keys(latestM).find((k) =>
              k.startsWith(prefix) &&
              !k.startsWith(`${prefix}status`) &&
              latestM[k] !== null && latestM[k] !== "" && !isNaN(Number(latestM[k]))
            );
            if (hit) {
              liveMetric = String(latestM[hit]);
              metricUnit = "";
            }
          }

          // ── Status: registry flag first, then actual health signals ──
          let status: AssetStatus;
          if (!row.is_active) {
            status = "DECOMMISSIONED";
          } else {
            const signal = String(latestM[`status_${normId}`] || "").toUpperCase();
            if (signal === "OFFLINE" || signal === "FAULT") {
              status = "OFFLINE";
            } else if (signal === "DEGRADED") {
              status = "DEGRADED";
            } else {
              status = "ONLINE";
            }
          }

          return {
            id:           id,
            name:         name,
            manufacturer: manufacturer,
            model:        model,
            category:     categoryUi,
            categoryDb:   categoryDb,
            ip:           ip,
            firmware:     firmware,
            location:     row.location || "Unknown",
            rack:         rack,
            status:       status,
            liveMetric:   liveMetric,
            metricUnit:   metricUnit,
            lastSeen:     row.is_active ? (lastSeenLabel ?? "—") : "Offline",
            room_id:      row.room_id,
            template_id: row.template_id ?? null,
            is_active:    row.is_active
          };
        });
        setAssets(mapped);
      }
    } catch (err) {
      console.error("Error loading live assets:", err);
    }
  };


  useEffect(() => {
    fetchRooms();
    fetchAssets();
  }, [currentSite?.id]);

  // ── Dynamic filter option lists ─────────────────────────────────────────
  const uniqueCategories = useMemo(() => {
    const seen = new Set<string>();
    assets.forEach((a) => { if (a.category) seen.add(a.category); });
    return Array.from(seen).sort();
  }, [assets]);

  const STATUS_OPTIONS: AssetStatus[] = ["ONLINE", "DEGRADED", "OFFLINE", "DECOMMISSIONED"];

  // ── Filtered dataset ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return assets.filter((a) => {
      const matchQ =
        !q ||
        a.id.toLowerCase().includes(q)           ||
        a.ip.toLowerCase().includes(q)            ||
        a.location.toLowerCase().includes(q)      ||
        a.name.toLowerCase().includes(q)          ||
        a.manufacturer.toLowerCase().includes(q);
      const matchCat =
        !filterCategory || a.category === filterCategory;
      const matchSt =
        !filterStatus || a.status === filterStatus;
      const matchRoom =
        !activeRoomId || a.room_id === activeRoomId;
      return matchQ && matchCat && matchSt && matchRoom;
    });
  }, [assets, query, filterCategory, filterStatus, activeRoomId]);

  // ── CSV export ────────────────────────────────────────────────────────────
  function exportCSV() {
    const headers = [
      "Asset ID","Name","Manufacturer","Model","Category",
      "IP Address","Firmware","Location","Rack","Status",
      "Live Metric","Last Seen",
    ];
    const rows = filtered.map((a) =>
      [
        a.id, a.name, a.manufacturer, a.model, a.category,
        a.ip, a.firmware, a.location, a.rack, a.status,
        `${a.liveMetric} ${a.metricUnit}`.trim(), a.lastSeen,
      ].join(",")
    );
    const blob = new Blob(
      [[headers.join(","), ...rows].join("\n")],
      { type: "text/csv" }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dcime-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {/* A new room goes at the END of the walking order, not into the middle
          of somebody's round. */}
      <CreateRoomModal
        isOpen={addingRoom}
        siteId={currentSite?.id ?? null}
        nextSortOrder={rooms.reduce((n, r) => Math.max(n, (r.sort_order ?? 0) + 1), 0)}
        onClose={() => setAddingRoom(false)}
        onCreated={fetchRooms}
      />

      <CreateEquipmentModal
        isOpen={addingAsset}
        siteId={currentSite?.id ?? null}
        rooms={rooms.map((r) => ({ id: r.id, room_name: r.room_name }))}
        onClose={() => setAddingAsset(false)}
        onCreated={fetchAssets}
      />

      {selectedAssetId && (
      <ManageParametersModal
          isOpen={isParamsModalOpen}
          onClose={() => {
            setIsParamsModalOpen(false);
            setSelectedAssetId(null);
          }}
          equipmentId={selectedAssetId}
          templateId={assets.find(a => a.id === selectedAssetId)?.template_id ?? null}
        />
      )}
      <div className="min-h-full flex flex-col gap-5">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.14em] mb-0.5">
            Asset Management
          </div>
          <h1 className="text-[20px] font-black text-neutral-900 tracking-tight leading-none">
            Infrastructure Ledger
          </h1>
          <p className="text-[11px] font-semibold text-neutral-400 mt-1">
            {filtered.length} of {assets.length} assets · {currentSite?.site_name || "Unknown"}
          </p>
        </div>

        {/* Stats row — live counts using 3-way traffic light states */}
        <div className="flex items-center gap-4 flex-wrap">
          {(
            [
              { label: "Online",        count: assets.filter((a) => a.status === "ONLINE").length,         color: "text-ok-600"  },
              { label: "Degraded",      count: assets.filter((a) => a.status === "DEGRADED").length,       color: "text-warn-500" },
              { label: "Offline",       count: assets.filter((a) => a.status === "OFFLINE").length,        color: "text-danger-600"    },
              { label: "Decommissioned",count: assets.filter((a) => a.status === "DECOMMISSIONED").length, color: "text-neutral-400"   },
            ]
          ).map((s) => (
            <div key={s.label} className="text-center">
              <div className={`text-[18px] font-black leading-none ${s.color}`}>
                {s.count}
              </div>
              <div className="text-[9px] font-black text-neutral-400 uppercase tracking-widest mt-0.5">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Layout grid with Rooms Sidebar ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Left Sidebar: Room Selection and Creation */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white border border-neutral-100 rounded-3xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-neutral-400 uppercase tracking-widest">
                Physical Rooms
              </h3>
              {/* Enabled: the blueprint that used to define rooms was deleted
                  in Stage 1, and `rooms` has carried admin insert/update/delete
                  policies the whole time — only this button was switched off. */}
              <button
                onClick={() => setAddingRoom(true)}
                title="Add a room"
                className="flex items-center gap-1 rounded-lg border border-neutral-200 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-neutral-500 transition-colors hover:border-neutral-300 hover:text-neutral-800"
              >
                <Plus size={11} /> Room
              </button>
            </div>

            <div className="space-y-1">
              <button
                onClick={() => setActiveRoomId(null)}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all uppercase tracking-wider flex items-center justify-between ${
                  activeRoomId === null
                    ? "bg-brand-500 text-white shadow-sm shadow-brand-500/10"
                    : "text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                <span>All Rooms</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                  activeRoomId === null ? "bg-brand-600 text-white" : "bg-neutral-100 text-neutral-400"
                }`}>
                  {assets.length}
                </span>
              </button>
              {rooms.map((room) => {
                const roomAssetCount = assets.filter(a => a.room_id === room.id).length;
                const isActive = activeRoomId === room.id;
                return (
                  <div
                    key={room.id}
                    className={`w-full flex items-center justify-between px-3.5 py-1 rounded-xl transition-all group ${
                      isActive
                        ? "bg-brand-500 text-white shadow-sm shadow-brand-500/10"
                        : "text-neutral-600 hover:bg-neutral-50"
                    }`}
                  >
                    <button
                      onClick={() => setActiveRoomId(room.id)}
                      className="flex-1 text-left text-xs font-bold uppercase tracking-wider truncate py-1.5 cursor-pointer text-current"
                    >
                      {room.room_name}
                    </button>
                    
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono flex-shrink-0 ${
                        isActive 
                          ? "bg-brand-600 text-white" 
                          : "bg-neutral-100 text-neutral-400 group-hover:bg-neutral-200"
                      }`}>
                        {roomAssetCount}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Content: Action Bar & Master Ledger Table */}
        {/* min-w-0: a grid item will not shrink below its content by default,
            so the 900px table forced this column wide and squeezed the cells
            instead of letting the overflow-x-auto wrapper scroll. */}
        <div className="lg:col-span-3 flex flex-col gap-5 min-w-0">
          {/* Action Bar */}
          <div className="bg-white border border-neutral-100 rounded-2xl shadow-sm px-4 py-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-0">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by Asset ID, IP, or Location..."
                className="w-full h-9 pl-9 pr-4 rounded-xl bg-neutral-50 border border-neutral-200 text-[12px] font-semibold text-neutral-800 placeholder-neutral-400 focus:outline-none focus:border-neutral-400 transition-all"
              />
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Filter size={13} className="text-neutral-400 flex-shrink-0" />

              <FilterDropdown
                label="Category"
                value={filterCategory}
                options={uniqueCategories}
                onChange={setFilterCategory}
              />

              <FilterDropdown
                label="Status"
                value={filterStatus}
                options={STATUS_OPTIONS}
                onChange={setFilterStatus}
              />

              {/* Clear filters */}
              {(filterCategory || filterStatus || query) && (
                <button
                  onClick={() => { setQuery(""); setFilterCategory(""); setFilterStatus(""); }}
                  className="h-9 px-3 rounded-xl text-[10px] font-black text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 uppercase tracking-wider transition-all"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Export */}
            <button
              onClick={exportCSV}
              className="flex items-center gap-2 h-9 px-4 rounded-xl bg-neutral-900 text-white text-[11px] font-black uppercase tracking-wider hover:bg-neutral-700 active:scale-[0.98] transition-all flex-shrink-0 cursor-pointer"
            >
              <Download size={13} />
              Export CSV
            </button>

            {/* Enabled for the same reason as the room button above. */}
            <button
              onClick={() => setAddingAsset(true)}
              className="flex h-9 flex-shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-brand-500 px-4 text-[11px] font-black uppercase tracking-wider text-white transition-all hover:bg-brand-600 active:scale-[0.98]"
            >
              <Plus size={13} />
              Add Equipment
            </button>
          </div>

          {/* Master Data Table */}
          <div className="bg-white border border-neutral-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse">
                {/* Table Head */}
                <thead>
                  <tr className="border-b border-neutral-100 bg-neutral-50/70">
                    <Th>Asset ID</Th>
                    <Th>Equipment Name</Th>
                    <Th>IP Address</Th>
                    <Th>Location</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Live Metric</Th>
                    <Th className="text-right">Last Seen</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>

                {/* Table Body */}
                <tbody className="divide-y divide-neutral-50">
                  {filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-16 text-center text-[12px] font-semibold text-neutral-400"
                      >
                        No assets match your current filters.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((asset) => (
                      <tr
                        key={asset.id}
                        onClick={() => {
                          setSelectedAssetId(asset.id);
                          setIsParamsModalOpen(true);
                        }}
                        className={`hover:bg-neutral-50/50 cursor-pointer transition-colors duration-100 group ${
                          asset.status === "DECOMMISSIONED" ? "opacity-50" : ""
                        }`}
                      >
                        {/* Asset ID */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-neutral-50 border border-neutral-100 flex items-center justify-center flex-shrink-0 group-hover:border-neutral-200 transition-colors">
                              {categoryIcon(asset.category)}
                            </div>
                            <div className="min-w-0">
                              <div className="text-[12px] font-black text-neutral-900 font-mono truncate">
                                {asset.id}
                              </div>
                              <div className="text-[10px] font-semibold text-neutral-400 mt-0.5">
                                {asset.category}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Equipment Name */}
                        <td className="px-4 py-3.5">
                          <div className="text-[12px] font-bold text-neutral-800 leading-tight">
                            {asset.name}
                          </div>
                          <div className="text-[10px] font-semibold text-neutral-400 mt-0.5">
                            {asset.manufacturer} · {asset.model}
                          </div>
                          <div className="text-[9px] font-mono text-neutral-300 mt-0.5 uppercase tracking-wide">
                            FW: {asset.firmware}
                          </div>
                        </td>

                        {/* IP Address */}
                        <td className="px-4 py-3.5">
                          <span className="text-[12px] font-mono font-semibold text-neutral-700 bg-neutral-50 border border-neutral-100 px-2 py-0.5 rounded-lg">
                            {asset.ip}
                          </span>
                        </td>

                        {/* Location */}
                        <td className="px-4 py-3.5">
                          <div className="text-[12px] font-semibold text-neutral-700">
                            {asset.location}
                          </div>
                          {asset.rack !== "—" && (
                            <div className="text-[10px] font-semibold text-neutral-400 mt-0.5">
                              Rack: {asset.rack}
                            </div>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5">
                          <StatusBadge status={asset.status} />
                        </td>

                        {/* Live Metric */}
                        <td className="px-4 py-3.5 text-right">
                          {asset.liveMetric !== "—" ? (
                            <div>
                              <span className="text-[15px] font-black text-neutral-900 tabular-nums">
                                {asset.liveMetric}
                              </span>
                              <span className="text-[10px] font-semibold text-neutral-400 ml-1">
                                {asset.metricUnit}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[12px] font-semibold text-neutral-300">—</span>
                          )}
                        </td>

                        {/* Last Seen */}
                        <td className="px-4 py-3.5 text-right">
                          <span className="text-[11px] font-mono font-semibold text-neutral-400">
                            {asset.lastSeen}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                const newActiveState = !asset.is_active;
                                if (window.confirm(`Are you sure you want to ${newActiveState ? 'recommission' : 'decommission'} equipment ${asset.id}?`)) {
                                  try {
                                    let query = supabase
                                      .from("equipment_registry")
                                      .update({ is_active: newActiveState })
                                      .eq("equipment_id", asset.id);
                                    if (currentSite?.id) {
                                      query = query.eq("site_uuid", currentSite.id);
                                    }
                                    const { data, error } = await query.select();
                                    if (error) throw error;
                                    if (!data || data.length === 0) {
                                      throw new Error("No matching equipment record updated (Permission denied or record missing).");
                                    }
                                    toast.success(`Equipment ${asset.id} ${newActiveState ? 'recommissioned' : 'decommissioned'}!`);
                                    fetchAssets();
                                  } catch (err: any) {
                                    console.error("Error updating equipment state:", err);
                                    toast.error(err.message || "Failed to update equipment state (Permission denied).");
                                  }
                                }
                              }}
                              className={`px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm active:scale-95 ${
                                asset.is_active
                                  ? "bg-danger-50 border-danger-100 text-danger-500 hover:text-danger-700 hover:bg-danger-100/50"
                                  : "bg-ok-50 border-ok-100 text-ok-600 hover:text-ok-800 hover:bg-ok-100/50"
                              }`}
                            >
                              {asset.is_active ? "Decommission" : "Recommission"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Table footer */}
            <div className="px-5 py-3 border-t border-neutral-100 flex items-center justify-between bg-neutral-50/50">
              <span className="text-[10px] font-semibold text-neutral-400">
                Showing {filtered.length} of {assets.length} records · {currentSite?.site_name || "Unknown"}
              </span>
              <div className="flex items-center gap-1.5 text-[10px] font-black text-neutral-400 uppercase tracking-wider">
                <ArrowUpDown size={11} />
                Sort by Asset ID
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}

export default AssetInventory;
