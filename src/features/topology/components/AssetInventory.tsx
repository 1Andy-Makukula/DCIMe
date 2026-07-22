import React, { useState, useMemo, useEffect } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { toast } from "sonner";
import { TelemetryChart } from "./TelemetryChart";
import {
  Search,
  Filter,
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
}


// ── Category icon map ─────────────────────────────────────────────────────────
function categoryIcon(cat: string): React.ReactNode {
  const c = cat?.toUpperCase() ?? "";
  if (c === "AIRCON")    return <Thermometer size={13} className="text-blue-400" />;
  if (c === "UPS")       return <Zap size={13} className="text-yellow-500" />;
  if (c === "GENERATOR") return <Zap size={13} className="text-orange-400" />;
  if (c === "MAINS")     return <Network size={13} className="text-purple-400" />;
  if (c === "RECTIFIER") return <Cpu size={13} className="text-green-500" />;
  return <Activity size={13} className="text-gray-400" />;
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: AssetStatus }) {
  const styles: Record<AssetStatus, string> = {
    ONLINE:         "bg-green-100  text-green-700",
    DEGRADED:       "bg-orange-100 text-orange-700",
    OFFLINE:        "bg-red-100    text-red-700",
    DECOMMISSIONED: "bg-gray-100   text-gray-500",
  };
  const dots: Record<AssetStatus, string> = {
    ONLINE:         "bg-green-500",
    DEGRADED:       "bg-orange-400",
    OFFLINE:        "bg-red-500",
    DECOMMISSIONED: "bg-gray-400",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${styles[status] ?? "bg-gray-100 text-gray-500"}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dots[status] ?? "bg-gray-400"}`} />
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
        className="flex items-center gap-2 h-9 px-3.5 rounded-xl border border-gray-200 bg-white text-[11px] font-black text-gray-700 uppercase tracking-wider cursor-pointer hover:border-gray-300 focus:outline-none transition-all"
      >
        <span>{activeLabel}</span>
        <ChevronDown
          size={12}
          className={`text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 z-20 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden min-w-[120px] w-max max-w-[200px]">
          {/* Reset option */}
          <button
            type="button"
            onClick={() => {
              onChange("");
              setIsOpen(false);
            }}
            className={`w-full text-left px-4 py-2.5 text-[11px] font-black uppercase tracking-wider transition-colors ${
              value === "" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"
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
                value === o ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"
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
      className={`px-4 py-3 text-left text-xs font-black text-gray-400 uppercase tracking-widest whitespace-nowrap ${className}`}
    >
      {children}
    </th>
  );
}



// ── ChartPanel — embedded telemetry chart section ─────────────────────────────

function ChartPanel({ equipmentId }: { equipmentId: string }) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="border-b border-gray-100 flex-shrink-0">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-3.5 hover:bg-gray-50/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </div>
          <span className="text-[10px] font-black text-gray-700 uppercase tracking-widest">
            Telemetry History (24 h)
          </span>
        </div>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
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
}

function ManageParametersModal({ isOpen, onClose, equipmentId }: ManageParametersModalProps) {
  const [parameters, setParameters] = useState<EquipmentParameter[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchParameters = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("equipment_parameters")
        .select("*")
        .eq("equipment_id", equipmentId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setParameters(data || []);
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
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <div>
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">
              EAV Parameter Engine · {equipmentId}
            </div>
            <h2 className="text-[16px] font-black text-gray-900 leading-none">
              View Equipment Parameters
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
          {/* Telemetry History Chart — full width panel */}
          <ChartPanel equipmentId={equipmentId} />

          {/* Parameters List */}
          <div className="p-6 overflow-y-auto flex flex-col gap-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                <Loader2 size={24} className="animate-spin text-red-500" />
                <span className="text-xs font-bold uppercase tracking-wider">Loading parameters...</span>
              </div>
            ) : parameters.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400 border-2 border-dashed border-gray-100 rounded-2xl">
                <Database size={32} className="mb-2 text-gray-300" />
                <span className="text-xs font-bold uppercase tracking-wider">No parameters configured</span>
              </div>
            ) : (
              <>
                {/* Constants Group */}
                {constants.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-gray-50 pb-1.5">
                      <Database size={12} className="text-blue-500" />
                      <span>Constant Identifiers & Thresholds ({constants.length})</span>
                    </h3>
                    <div className="space-y-2">
                      {constants.map((param) => (
                        <div
                          key={param.id}
                          className="bg-blue-50/30 border border-blue-100 rounded-xl p-3.5 flex items-center justify-between gap-4"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] font-black text-blue-900 truncate">
                                {param.parameter_name}
                              </span>
                              <span className="bg-blue-100 text-blue-800 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded">
                                {param.data_type}
                              </span>
                            </div>
                            <div className="text-[11px] text-blue-700/80 mt-1 font-semibold flex items-center gap-1.5 flex-wrap">
                              <span>Value: <strong className="font-mono bg-blue-100/50 px-1 py-0.5 rounded text-blue-900">{param.constant_value}</strong></span>
                              {param.unit && (
                                <span className="text-[9px] font-bold text-blue-500 uppercase">[{param.unit}]</span>
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
                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-gray-50 pb-1.5">
                      <Activity size={12} className="text-red-500" />
                      <span>Flexible Telemetry Parameters ({telemetries.length})</span>
                    </h3>
                    <div className="space-y-2">
                      {telemetries.map((param) => (
                        <div
                          key={param.id}
                          className="bg-red-50/20 border border-red-100/50 rounded-xl p-3.5 flex items-center justify-between gap-4"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] font-black text-gray-900 truncate">
                                {param.parameter_name}
                              </span>
                              <span className="bg-gray-100 text-gray-600 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded">
                                {param.data_type}
                              </span>
                              {param.is_graphable && (
                                <span className="bg-red-100 text-red-700 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded">
                                  Graphable
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-gray-400 mt-1 font-semibold flex items-center gap-1.5">
                              <span>Telemetry Data Field</span>
                              {param.unit && (
                                <span className="text-[9px] font-bold text-gray-500 uppercase">[{param.unit}]</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
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

      if (data) {
        const mapped = data.map((row: any) => {
          const id = row.equipment_id;
          const categoryDb = row.category; // 'UPS', 'GENERATOR', 'MAINS', 'RECTIFIER', 'AIRCON'
          
          let categoryUi: AssetCategory = "Power";
          if (categoryDb === "AIRCON") {
            categoryUi = "Cooling";
          }

          // Parse number from ID
          const parts = id.split("-");
          const lastPart = parts[parts.length - 1] || "001";
          const num = lastPart.padStart(3, "0");
          
          let name = row.name || `Equipment ${id}`;
          let manufacturer = row.manufacturer || "Standard";
          let model = row.model || "Generic Model";
          let ip = row.ip_address || "10.0.4.10";
          let firmware = row.firmware_version || "v1.0.0";
          let rack = row.rack_location || "—";
          let liveMetric = "—";
          let metricUnit = "";
          
          if (categoryDb === "UPS") {
            if (!row.name) name = `UPS Unit ${num}`;
            if (!row.manufacturer) manufacturer = "Vertiv";
            if (!row.model) model = "Liebert EXL S1 80kVA";
            if (!row.ip_address) ip = `10.0.4.1${num.charAt(2) || '1'}`;
            if (!row.firmware_version) firmware = "v4.2.1";
            if (!row.rack_location) rack = `R-${num.substring(1)}`;
            liveMetric = num === "002" ? "47.6" : "48.1";
            metricUnit = "V DC";
          } else if (categoryDb === "GENERATOR") {
            if (!row.name) name = `Diesel Generator ${num === "001" ? "A" : "B"}`;
            if (!row.manufacturer) manufacturer = "Cummins";
            if (!row.model) model = "C250 D5 250kVA";
            if (!row.ip_address) ip = `10.0.4.2${num.charAt(2) || '1'}`;
            if (!row.firmware_version) firmware = "v2.8.0";
            if (!row.rack_location) rack = "—";
            liveMetric = "0";
            metricUnit = "kW";
          } else if (categoryDb === "RECTIFIER") {
            if (!row.name) name = `Rectifier ${num === "001" ? "A – Rm 1" : "B – Rm 2"}`;
            if (!row.manufacturer) manufacturer = "Eltek";
            if (!row.model) model = "Flatpack2 HE 48V";
            if (!row.ip_address) ip = `10.0.4.3${num.charAt(2) || '1'}`;
            if (!row.firmware_version) firmware = "v5.3.0";
            if (!row.rack_location) rack = `R-0${4 + (parseInt(num) || 1)}`;
            liveMetric = num === "002" ? "47.8" : "48.1";
            metricUnit = "V DC";
          } else if (categoryDb === "AIRCON") {
            if (!row.name) name = `CRAC Unit ${num}`;
            if (!row.manufacturer) manufacturer = "Stulz";
            if (!row.model) model = "CyberAir 3PRO DX";
            if (!row.ip_address) ip = `10.0.5.1${num.charAt(2) || '1'}`;
            if (!row.firmware_version) firmware = "v3.1.4";
            if (!row.rack_location) rack = "—";
            liveMetric = num === "003" ? "22.4" : "20.7";
            metricUnit = "°C";
          } else if (categoryDb === "MAINS") {
            if (!row.name) name = "ZESCO Mains Grid";
            if (!row.manufacturer) manufacturer = "ZESCO";
            if (!row.model) model = "Utility Feed";
            if (!row.ip_address) ip = "10.0.4.50";
            if (!row.firmware_version) firmware = "v1.0";
            if (!row.rack_location) rack = "—";
            liveMetric = "230";
            metricUnit = "V AC";
          }

          const status: AssetStatus = row.is_active ? "ONLINE" : "DECOMMISSIONED";

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
            lastSeen:     row.is_active ? "Live" : "Offline",
            room_id:      row.room_id,
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
      {selectedAssetId && (
        <ManageParametersModal
          isOpen={isParamsModalOpen}
          onClose={() => {
            setIsParamsModalOpen(false);
            setSelectedAssetId(null);
          }}
          equipmentId={selectedAssetId}
        />
      )}
      <div className="min-h-full flex flex-col gap-5">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.14em] mb-0.5">
            Asset Management
          </div>
          <h1 className="text-[20px] font-black text-gray-900 tracking-tight leading-none">
            Infrastructure Ledger
          </h1>
          <p className="text-[11px] font-semibold text-gray-400 mt-1">
            {filtered.length} of {assets.length} assets · Site {currentSite?.site_name || "Unknown"}
          </p>
        </div>

        {/* Stats row — live counts using 3-way traffic light states */}
        <div className="flex items-center gap-4 flex-wrap">
          {(
            [
              { label: "Online",        count: assets.filter((a) => a.status === "ONLINE").length,         color: "text-green-600"  },
              { label: "Degraded",      count: assets.filter((a) => a.status === "DEGRADED").length,       color: "text-orange-500" },
              { label: "Offline",       count: assets.filter((a) => a.status === "OFFLINE").length,        color: "text-red-600"    },
              { label: "Decommissioned",count: assets.filter((a) => a.status === "DECOMMISSIONED").length, color: "text-gray-400"   },
            ]
          ).map((s) => (
            <div key={s.label} className="text-center">
              <div className={`text-[18px] font-black leading-none ${s.color}`}>
                {s.count}
              </div>
              <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-0.5">
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
          <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">
                Physical Rooms
              </h3>
              {/* Room creation disabled (defined in config blueprint) */}
            </div>

            <div className="space-y-1">
              <button
                onClick={() => setActiveRoomId(null)}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all uppercase tracking-wider flex items-center justify-between ${
                  activeRoomId === null
                    ? "bg-red-500 text-white shadow-sm shadow-red-500/10"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <span>All Rooms</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                  activeRoomId === null ? "bg-red-600 text-white" : "bg-gray-100 text-gray-400"
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
                        ? "bg-red-500 text-white shadow-sm shadow-red-500/10"
                        : "text-gray-600 hover:bg-gray-50"
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
                          ? "bg-red-600 text-white" 
                          : "bg-gray-100 text-gray-400 group-hover:bg-gray-200"
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
        <div className="lg:col-span-3 flex flex-col gap-5">
          {/* Action Bar */}
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm px-4 py-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-0">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by Asset ID, IP, or Location..."
                className="w-full h-9 pl-9 pr-4 rounded-xl bg-gray-50 border border-gray-200 text-[12px] font-semibold text-gray-800 placeholder-gray-400 focus:outline-none focus:border-gray-400 transition-all"
              />
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Filter size={13} className="text-gray-400 flex-shrink-0" />

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
                  className="h-9 px-3 rounded-xl text-[10px] font-black text-gray-400 hover:text-gray-700 hover:bg-gray-100 uppercase tracking-wider transition-all"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Export */}
            <button
              onClick={exportCSV}
              className="flex items-center gap-2 h-9 px-4 rounded-xl bg-gray-900 text-white text-[11px] font-black uppercase tracking-wider hover:bg-gray-700 active:scale-[0.98] transition-all flex-shrink-0 cursor-pointer"
            >
              <Download size={13} />
              Export CSV
            </button>

            {/* Equipment creation disabled (defined in config blueprint) */}
          </div>

          {/* Master Data Table */}
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse">
                {/* Table Head */}
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/70">
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
                <tbody className="divide-y divide-gray-50">
                  {filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-16 text-center text-[12px] font-semibold text-gray-400"
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
                        className={`hover:bg-gray-50/50 cursor-pointer transition-colors duration-100 group ${
                          asset.status === "DECOMMISSIONED" ? "opacity-50" : ""
                        }`}
                      >
                        {/* Asset ID */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0 group-hover:border-gray-200 transition-colors">
                              {categoryIcon(asset.category)}
                            </div>
                            <div>
                              <div className="text-[12px] font-black text-gray-900 font-mono tracking-tight">
                                {asset.id}
                              </div>
                              <div className="text-[10px] font-semibold text-gray-400 mt-0.5">
                                {asset.category}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Equipment Name */}
                        <td className="px-4 py-3.5">
                          <div className="text-[12px] font-bold text-gray-800 leading-tight">
                            {asset.name}
                          </div>
                          <div className="text-[10px] font-semibold text-gray-400 mt-0.5">
                            {asset.manufacturer} · {asset.model}
                          </div>
                          <div className="text-[9px] font-mono text-gray-300 mt-0.5 uppercase tracking-wide">
                            FW: {asset.firmware}
                          </div>
                        </td>

                        {/* IP Address */}
                        <td className="px-4 py-3.5">
                          <span className="text-[12px] font-mono font-semibold text-gray-700 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-lg">
                            {asset.ip}
                          </span>
                        </td>

                        {/* Location */}
                        <td className="px-4 py-3.5">
                          <div className="text-[12px] font-semibold text-gray-700">
                            {asset.location}
                          </div>
                          {asset.rack !== "—" && (
                            <div className="text-[10px] font-semibold text-gray-400 mt-0.5">
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
                              <span className="text-[15px] font-black text-gray-900 tabular-nums">
                                {asset.liveMetric}
                              </span>
                              <span className="text-[10px] font-semibold text-gray-400 ml-1">
                                {asset.metricUnit}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[12px] font-semibold text-gray-300">—</span>
                          )}
                        </td>

                        {/* Last Seen */}
                        <td className="px-4 py-3.5 text-right">
                          <span className="text-[11px] font-mono font-semibold text-gray-400">
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
                                    const { error } = await query;
                                    if (error) throw error;
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
                                  ? "bg-red-50 border-red-100 text-red-500 hover:text-red-700 hover:bg-red-100/50"
                                  : "bg-green-50 border-green-100 text-green-600 hover:text-green-800 hover:bg-green-100/50"
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
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
              <span className="text-[10px] font-semibold text-gray-400">
                Showing {filtered.length} of {assets.length} records · Site {currentSite?.site_name || "Unknown"}
              </span>
              <div className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">
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
