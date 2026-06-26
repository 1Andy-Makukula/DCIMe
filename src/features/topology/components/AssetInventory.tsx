import React, { useState, useMemo, useEffect } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import {
  Search,
  Filter,
  Download,
  Zap,
  Thermometer,
  Network,
  Cpu,
  ChevronDown,
  ArrowUpDown,
  X,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type AssetStatus = "Active" | "Standby" | "Warning" | "Offline";
type AssetCategory = "Power" | "Cooling" | "Network" | "Compute";

interface Asset {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  category: AssetCategory;
  ip: string;
  firmware: string;
  location: string;
  rack: string;
  status: AssetStatus;
  liveMetric: string;
  metricUnit: string;
  lastSeen: string;
}


// ── Category icon map ─────────────────────────────────────────────────────────
const CATEGORY_ICON: Record<AssetCategory, React.ReactNode> = {
  Power:   <Zap       size={13} className="text-yellow-500" />,
  Cooling: <Thermometer size={13} className="text-blue-400" />,
  Network: <Network   size={13} className="text-purple-400" />,
  Compute: <Cpu       size={13} className="text-green-500"  />,
};

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: AssetStatus }) {
  const styles: Record<AssetStatus, string> = {
    Active:  "bg-green-100  text-green-700",
    Standby: "bg-gray-100   text-gray-600",
    Warning: "bg-yellow-100 text-yellow-700",
    Offline: "bg-red-100    text-red-700",
  };
  const dots: Record<AssetStatus, string> = {
    Active:  "bg-green-500",
    Standby: "bg-gray-400",
    Warning: "bg-yellow-500",
    Offline: "bg-red-500",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${styles[status]}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dots[status]}`} />
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

interface AddAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveSuccess: () => void;
}

function AddAssetModal({ isOpen, onClose, onSaveSuccess }: AddAssetModalProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("UPS");
  const [assetId, setAssetId] = useState("");
  const [ipAddress, setIpAddress] = useState("");
  const [location, setLocation] = useState("Main Room");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from("equipment_registry")
        .insert([{
          equipment_id: assetId.trim().toUpperCase(),
          category: category, // 'UPS', 'GENERATOR', 'MAINS', 'RECTIFIER', 'AIRCON'
          location: location,
          is_active: true
        }]);

      if (error) throw error;

      onSaveSuccess();
      onClose();
      setName("");
      setAssetId("");
      setIpAddress("");
    } catch (err) {
      console.error("Error saving equipment:", err);
      alert("Failed to save equipment to the database.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">
              Ledger · Provisioning
            </div>
            <h2 className="text-[16px] font-black text-gray-900 leading-none">
              Add New Equipment
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Equipment Name */}
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1.5">
                Equipment Name (UI Only)
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. UPS System 3"
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-[12px] font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 transition-all"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1.5">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-[12px] font-semibold text-gray-900 focus:outline-none focus:border-gray-400 transition-all"
              >
                <option value="UPS">UPS</option>
                <option value="GENERATOR">Generator</option>
                <option value="MAINS">Mains Feed</option>
                <option value="RECTIFIER">Rectifier</option>
                <option value="AIRCON">Air Conditioner (CRAC)</option>
              </select>
            </div>

            {/* Asset ID */}
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1.5">
                Asset ID
              </label>
              <input
                type="text"
                required
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                placeholder="e.g. PWR-UPS-003"
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-[12px] font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 transition-all"
              />
            </div>

            {/* IP Address */}
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1.5">
                IP Address (UI Only)
              </label>
              <input
                type="text"
                required
                value={ipAddress}
                onChange={(e) => setIpAddress(e.target.value)}
                placeholder="e.g. 10.0.4.13"
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-[12px] font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 transition-all"
              />
            </div>

            {/* Location */}
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1.5">
                Location
              </label>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-[12px] font-semibold text-gray-900 focus:outline-none focus:border-gray-400 transition-all"
              >
                <option value="Main Room">Main Room</option>
                <option value="Power Room 1">Power Room 1</option>
                <option value="Power Room 2">Power Room 2</option>
                <option value="Generator Room">Generator Room</option>
                <option value="Server Room 1">Server Room 1</option>
              </select>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-[11px] font-black text-gray-500 hover:bg-gray-100 transition-all uppercase tracking-wider cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 text-white text-[11px] font-black uppercase tracking-wider hover:bg-gray-700 active:scale-[0.98] transition-all cursor-pointer"
            >
              Save Equipment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function AssetInventory() {
  const [assets,         setAssets]         = useState<Asset[]>([]);

  const [query,          setQuery]          = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStatus,   setFilterStatus]   = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const fetchAssets = async () => {
    try {
      const { data, error } = await supabase
        .from("equipment_registry")
        .select("*")
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
          
          let name = `Equipment ${id}`;
          let manufacturer = "Standard";
          let model = "Generic Model";
          let ip = "10.0.4.10";
          let firmware = "v1.0.0";
          let rack = "—";
          let liveMetric = "—";
          let metricUnit = "";
          
          if (categoryDb === "UPS") {
            name = `UPS Unit ${num}`;
            manufacturer = "Vertiv";
            model = "Liebert EXL S1 80kVA";
            ip = `10.0.4.1${num.charAt(2) || '1'}`;
            firmware = "v4.2.1";
            rack = `R-${num.substring(1)}`;
            liveMetric = num === "002" ? "47.6" : "48.1";
            metricUnit = "V DC";
          } else if (categoryDb === "GENERATOR") {
            name = `Diesel Generator ${num === "001" ? "A" : "B"}`;
            manufacturer = "Cummins";
            model = "C250 D5 250kVA";
            ip = `10.0.4.2${num.charAt(2) || '1'}`;
            firmware = "v2.8.0";
            rack = "—";
            liveMetric = "0";
            metricUnit = "kW";
          } else if (categoryDb === "RECTIFIER") {
            name = `Rectifier ${num === "001" ? "A – Rm 1" : "B – Rm 2"}`;
            manufacturer = "Eltek";
            model = "Flatpack2 HE 48V";
            ip = `10.0.4.3${num.charAt(2) || '1'}`;
            firmware = "v5.3.0";
            rack = `R-0${4 + (parseInt(num) || 1)}`;
            liveMetric = num === "002" ? "47.8" : "48.1";
            metricUnit = "V DC";
          } else if (categoryDb === "AIRCON") {
            name = `CRAC Unit ${num}`;
            manufacturer = "Stulz";
            model = "CyberAir 3PRO DX";
            ip = `10.0.5.1${num.charAt(2) || '1'}`;
            firmware = "v3.1.4";
            rack = "—";
            liveMetric = num === "003" ? "22.4" : "20.7";
            metricUnit = "°C";
          } else if (categoryDb === "MAINS") {
            name = "ZESCO Mains Grid";
            manufacturer = "ZESCO";
            model = "Utility Feed";
            ip = "10.0.4.50";
            firmware = "v1.0";
            rack = "—";
            liveMetric = "230";
            metricUnit = "V AC";
          }

          const status: AssetStatus = row.is_active
            ? (categoryDb === "GENERATOR" ? "Standby" : (liveMetric === "47.6" || liveMetric === "47.8" || liveMetric === "22.4" ? "Warning" : "Active"))
            : "Offline";

          return {
            id:           id,
            name:         name,
            manufacturer: manufacturer,
            model:        model,
            category:     categoryUi,
            ip:           ip,
            firmware:     firmware,
            location:     row.location || "Unknown",
            rack:         rack,
            status:       status,
            liveMetric:   liveMetric,
            metricUnit:   metricUnit,
            lastSeen:     row.is_active ? "Live" : "Offline",
          };
        });
        setAssets(mapped);
      }
    } catch (err) {
      console.error("Error loading live assets:", err);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, []);

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
      return matchQ && matchCat && matchSt;
    });
  }, [assets, query, filterCategory, filterStatus]);

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
      <AddAssetModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        onSaveSuccess={fetchAssets} 
      />
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
            {filtered.length} of {assets.length} assets · Site NTC ZM-0874
          </p>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 flex-wrap">
          {(
            [
              { label: "Active",  count: assets.filter((a) => a.status === "Active").length,  color: "text-green-600"  },
              { label: "Warning", count: assets.filter((a) => a.status === "Warning").length, color: "text-yellow-600" },
              { label: "Standby", count: assets.filter((a) => a.status === "Standby").length, color: "text-gray-500"   },
              { label: "Offline", count: assets.filter((a) => a.status === "Offline").length, color: "text-red-600"    },
            ] as const
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

      {/* ── Action Bar ──────────────────────────────────────────────────── */}
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
            options={["Power", "Cooling", "Network", "Compute"]}
            onChange={setFilterCategory}
          />

          <FilterDropdown
            label="Status"
            value={filterStatus}
            options={["Active", "Warning", "Standby", "Offline"]}
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
          className="flex items-center gap-2 h-9 px-4 rounded-xl bg-gray-900 text-white text-[11px] font-black uppercase tracking-wider hover:bg-gray-700 active:scale-[0.98] transition-all flex-shrink-0"
        >
          <Download size={13} />
          Export CSV
        </button>

        {/* Add Equipment */}
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 h-9 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[11px] font-black uppercase tracking-wider active:scale-[0.98] transition-all flex-shrink-0 cursor-pointer"
        >
          Add Equipment
        </button>
      </div>

      {/* ── Master Data Table ────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden flex-1">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse">
            {/* Table Head */}
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/70">
                <Th>Asset ID</Th>
                <Th>Type / Manufacturer</Th>
                <Th>IP Address</Th>
                <Th>Location</Th>
                <Th>Status</Th>
                <Th className="text-right">Live Metric</Th>
                <Th className="text-right">Last Seen</Th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-16 text-center text-[12px] font-semibold text-gray-400"
                  >
                    No assets match your current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((asset) => (
                  <tr
                    key={asset.id}
                    className="hover:bg-gray-50/50 cursor-pointer transition-colors duration-100 group"
                  >
                    {/* Asset ID */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0 group-hover:border-gray-200 transition-colors">
                          {CATEGORY_ICON[asset.category]}
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

                    {/* Type / Manufacturer */}
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
          <span className="text-[10px] font-semibold text-gray-400">
            Showing {filtered.length} of {assets.length} records · Site NTC ZM-0874
          </span>
          <div className="flex items-center gap-1.5 text-[10px] font-black text-gray-400 uppercase tracking-wider">
            <ArrowUpDown size={11} />
            Sort by Asset ID
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

export default AssetInventory;
