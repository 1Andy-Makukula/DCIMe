import React, { useState, useMemo, useEffect } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { TelemetryChart } from "./TelemetryChart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
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
  Trash2,
  Loader2,
  Database,
  Activity,
  AlertCircle,
  Plus
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

interface AddAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveSuccess: () => void;
  rooms: any[];
  assets: Asset[];
}

function AddAssetModal({ isOpen, onClose, onSaveSuccess, rooms, assets }: AddAssetModalProps) {
  const { currentSite } = useCurrentSite();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("UPS");
  const [assetId, setAssetId] = useState("");
  const [ipAddress, setIpAddress] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [firmwareVersion, setFirmwareVersion] = useState("");
  const [rackLocation, setRackLocation] = useState("");

  useEffect(() => {
    if (rooms.length > 0 && !selectedRoomId) {
      setSelectedRoomId(rooms[0].id);
    }
  }, [rooms, selectedRoomId]);

  useEffect(() => {
    if (!isOpen) return;

    // Generate temporary suffix number for suggestion
    const categoryCount = assets.filter(a => {
      const dbCat = category === "AIRCON" ? "COOLING" : category;
      return a.category.toUpperCase() === dbCat;
    }).length;
    const nextNum = String(categoryCount + 1).padStart(3, "0");

    let defaultName = "";
    let defaultMfg = "Standard";
    let defaultModel = "Generic Model";
    let defaultIp = "10.0.4.10";
    let defaultFw = "v1.0.0";
    let defaultRack = "";

    if (category === "UPS") {
      defaultName = `UPS Unit ${nextNum}`;
      defaultMfg = "Vertiv";
      defaultModel = "Liebert EXL S1 80kVA";
      defaultIp = `10.0.4.1${nextNum.charAt(2) || '1'}`;
      defaultFw = "v4.2.1";
      defaultRack = `R-${nextNum.substring(1)}`;
    } else if (category === "GENERATOR") {
      defaultName = `Diesel Generator ${nextNum === "001" ? "A" : "B"}`;
      defaultMfg = "Cummins";
      defaultModel = "C250 D5 250kVA";
      defaultIp = `10.0.4.2${nextNum.charAt(2) || '1'}`;
      defaultFw = "v2.8.0";
      defaultRack = "—";
    } else if (category === "RECTIFIER") {
      defaultName = `Rectifier ${nextNum === "001" ? "A – Rm 1" : "B – Rm 2"}`;
      defaultMfg = "Eltek";
      defaultModel = "Flatpack2 HE 48V";
      defaultIp = `10.0.4.3${nextNum.charAt(2) || '1'}`;
      defaultFw = "v5.3.0";
      defaultRack = `R-0${4 + parseInt(nextNum)}`;
    } else if (category === "AIRCON") {
      defaultName = `CRAC Unit ${nextNum}`;
      defaultMfg = "Stulz";
      defaultModel = "CyberAir 3PRO DX";
      defaultIp = `10.0.5.1${nextNum.charAt(2) || '1'}`;
      defaultFw = "v3.1.4";
      defaultRack = "—";
    } else if (category === "MAINS") {
      defaultName = "ZESCO Mains Grid";
      defaultMfg = "ZESCO";
      defaultModel = "Utility Feed";
      defaultIp = "10.0.4.50";
      defaultFw = "v1.0";
      defaultRack = "—";
    }

    setName(defaultName);
    setIpAddress(defaultIp);
    setManufacturer(defaultMfg);
    setModel(defaultModel);
    setFirmwareVersion(defaultFw);
    setRackLocation(defaultRack);
    setAssetId(`PWR-${category}-${nextNum}`);
  }, [category, assets, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSite?.id) return;
    try {
      const selectedRoom = rooms.find(r => r.id === selectedRoomId);
      const { error } = await supabase
        .from("equipment_registry")
        .insert([{
          equipment_id: assetId.trim().toUpperCase(),
          category: category, // 'UPS', 'GENERATOR', 'MAINS', 'RECTIFIER', 'AIRCON'
          location: selectedRoom?.room_name || "Unknown",
          room_id: selectedRoomId || null,
          site_uuid: currentSite.id,
          name: name.trim() || null,
          ip_address: ipAddress.trim() || null,
          manufacturer: manufacturer.trim() || null,
          model: model.trim() || null,
          firmware_version: firmwareVersion.trim() || null,
          rack_location: rackLocation.trim() || null,
          is_active: true
        }]);

      if (error) throw error;

      onSaveSuccess();
      onClose();
      setName("");
      setAssetId("");
      setIpAddress("");
      setManufacturer("");
      setModel("");
      setFirmwareVersion("");
      setRackLocation("");
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
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden animate-fade-in">
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
            {/* Row 1: Name and Category */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1.5">
                  Equipment Name
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
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1.5">
                  Category
                </label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="w-full h-11 bg-gray-50 border border-gray-200 rounded-xl text-[12px] font-semibold text-gray-900 focus:ring-1 focus:ring-gray-450 focus:border-gray-450">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-gray-100 rounded-xl shadow-lg z-[10000]">
                    <SelectItem value="UPS" className="text-[12px] font-semibold text-gray-900 cursor-pointer">UPS</SelectItem>
                    <SelectItem value="GENERATOR" className="text-[12px] font-semibold text-gray-900 cursor-pointer">Generator</SelectItem>
                    <SelectItem value="MAINS" className="text-[12px] font-semibold text-gray-900 cursor-pointer">Mains Feed</SelectItem>
                    <SelectItem value="RECTIFIER" className="text-[12px] font-semibold text-gray-900 cursor-pointer">Rectifier</SelectItem>
                    <SelectItem value="AIRCON" className="text-[12px] font-semibold text-gray-900 cursor-pointer">Air Conditioner (CRAC)</SelectItem>
                    <SelectItem value="ENVIRONMENT" className="text-[12px] font-semibold text-gray-900 cursor-pointer">Environment Sensor</SelectItem>
                    <SelectItem value="FIRE_SUPPRESSION" className="text-[12px] font-semibold text-gray-900 cursor-pointer">Fire Suppression</SelectItem>
                    <SelectItem value="FUEL_LOGISTICS" className="text-[12px] font-semibold text-gray-900 cursor-pointer">Fuel Logistics</SelectItem>
                    <SelectItem value="LOAD_PANEL" className="text-[12px] font-semibold text-gray-900 cursor-pointer">Load Panel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 2: Asset ID and IP Address */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1.5">
                  IP Address
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
            </div>

            {/* Row 3: Manufacturer and Model */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1.5">
                  Manufacturer
                </label>
                <input
                  type="text"
                  required
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                  placeholder="e.g. Vertiv"
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-[12px] font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1.5">
                  Model
                </label>
                <input
                  type="text"
                  required
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. Liebert EXL S1"
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-[12px] font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 transition-all"
                />
              </div>
            </div>

            {/* Row 4: Firmware and Rack Location */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1.5">
                  Firmware Version
                </label>
                <input
                  type="text"
                  required
                  value={firmwareVersion}
                  onChange={(e) => setFirmwareVersion(e.target.value)}
                  placeholder="e.g. v1.0.0"
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-[12px] font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1.5">
                  Rack Location
                </label>
                <input
                  type="text"
                  value={rackLocation}
                  onChange={(e) => setRackLocation(e.target.value)}
                  placeholder="e.g. R-01"
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-[12px] font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 transition-all"
                />
              </div>
            </div>

            {/* Row 5: Room */}
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1.5">
                Room
              </label>
              {rooms.length === 0 ? (
                <div className="text-[11px] text-red-500 font-bold uppercase tracking-wider p-3 bg-red-50 rounded-xl border border-red-100">
                  No rooms configured. Add a room in the sidebar first.
                </div>
              ) : (
                <Select value={selectedRoomId} onValueChange={setSelectedRoomId}>
                  <SelectTrigger className="w-full h-11 bg-gray-50 border border-gray-200 rounded-xl text-[12px] font-semibold text-gray-900 focus:ring-1 focus:ring-gray-450 focus:border-gray-450">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-gray-100 rounded-xl shadow-lg z-[10000]">
                    {rooms.map((r) => (
                      <SelectItem key={r.id} value={r.id} className="text-[12px] font-semibold text-gray-900 cursor-pointer">
                        {r.room_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
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
              disabled={rooms.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 text-white text-[11px] font-black uppercase tracking-wider hover:bg-gray-700 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
            >
              Save Equipment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface AddRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveSuccess: () => void;
  setRooms: React.Dispatch<React.SetStateAction<any[]>>;
}

function AddRoomModal({ isOpen, onClose, onSaveSuccess, setRooms }: AddRoomModalProps) {
  const { currentSite } = useCurrentSite();
  const [roomName, setRoomName] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSite?.id) return;
    setIsSaving(true);
    const tempId = "temp-" + Math.random().toString();
    const name = roomName.trim();
    const order = parseInt(sortOrder) || 0;

    // Optimistic update
    setRooms((prev) =>
      [...prev, { id: tempId, room_name: name, sort_order: order }].sort(
        (a, b) => a.sort_order - b.sort_order
      )
    );

    try {
      const { data, error } = await supabase
        .from("rooms")
        .insert([{
          site_id: currentSite.id,
          room_name: name,
          sort_order: order
        }])
        .select()
        .single();

      if (error) throw error;

      // Swap temp id with real site details
      setRooms((prev) => prev.map((r) => (r.id === tempId ? data : r)));
      onSaveSuccess();
      onClose();
      setRoomName("");
      setSortOrder("0");
    } catch (err) {
      console.error("Error creating room:", err);
      // Rollback
      setRooms((prev) => prev.filter((r) => r.id !== tempId));
      alert("Failed to create room.");
    } finally {
      setIsSaving(false);
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
              Rooms · Configuration
            </div>
            <h2 className="text-[16px] font-black text-gray-900 leading-none">
              Create New Room
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
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1.5">
                Room Name
              </label>
              <input
                type="text"
                required
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="e.g. Server Room 2"
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-[12px] font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 transition-all"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1.5">
                Sort Order
              </label>
              <input
                type="number"
                required
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                placeholder="0"
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-[12px] font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 transition-all"
              />
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
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 text-white text-[11px] font-black uppercase tracking-wider hover:bg-gray-700 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
            >
              {isSaving && <Loader2 size={12} className="animate-spin" />}
              <span>Create Room</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface EditAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveSuccess: () => void;
  rooms: any[];
  asset: Asset | null;
}

function EditAssetModal({ isOpen, onClose, onSaveSuccess, rooms, asset }: EditAssetModalProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("UPS");
  const [ipAddress, setIpAddress] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [firmwareVersion, setFirmwareVersion] = useState("");
  const [rackLocation, setRackLocation] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (asset) {
      setName(asset.name || "");
      setCategory(asset.categoryDb || (asset.category === "Cooling" ? "AIRCON" : "UPS"));
      setIpAddress(asset.ip || "");
      setSelectedRoomId(asset.room_id || "");
      setManufacturer(asset.manufacturer || "");
      setModel(asset.model || "");
      setFirmwareVersion(asset.firmware || "");
      setRackLocation(asset.rack === "—" ? "" : asset.rack || "");
    }
  }, [asset]);

  if (!isOpen || !asset) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const selectedRoom = rooms.find(r => r.id === selectedRoomId);
      const { error } = await supabase
        .from("equipment_registry")
        .update({
          name: name.trim() || null,
          category: category,
          ip_address: ipAddress.trim() || null,
          room_id: selectedRoomId || null,
          location: selectedRoom?.room_name || "Unknown",
          manufacturer: manufacturer.trim() || null,
          model: model.trim() || null,
          firmware_version: firmwareVersion.trim() || null,
          rack_location: rackLocation.trim() || null
        })
        .eq("equipment_id", asset.id);

      if (error) throw error;
      onSaveSuccess();
      onClose();
    } catch (err) {
      console.error("Error updating equipment:", err);
      alert("Failed to update equipment.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">
              Ledger · Edit Configuration
            </div>
            <h2 className="text-[16px] font-black text-gray-900 leading-none">
              Edit Equipment {asset.id}
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
            {/* Row 1: Name and Category */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1.5">
                  Equipment Name
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
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1.5">
                  Category
                </label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="w-full h-11 bg-gray-50 border border-gray-200 rounded-xl text-[12px] font-semibold text-gray-900 focus:ring-1 focus:ring-gray-450 focus:border-gray-450">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-gray-100 rounded-xl shadow-lg z-[10000]">
                    <SelectItem value="UPS" className="text-[12px] font-semibold text-gray-900 cursor-pointer">UPS</SelectItem>
                    <SelectItem value="GENERATOR" className="text-[12px] font-semibold text-gray-900 cursor-pointer">Generator</SelectItem>
                    <SelectItem value="MAINS" className="text-[12px] font-semibold text-gray-900 cursor-pointer">Mains Feed</SelectItem>
                    <SelectItem value="RECTIFIER" className="text-[12px] font-semibold text-gray-900 cursor-pointer">Rectifier</SelectItem>
                    <SelectItem value="AIRCON" className="text-[12px] font-semibold text-gray-900 cursor-pointer">Air Conditioner (CRAC)</SelectItem>
                    <SelectItem value="ENVIRONMENT" className="text-[12px] font-semibold text-gray-900 cursor-pointer">Environment Sensor</SelectItem>
                    <SelectItem value="FIRE_SUPPRESSION" className="text-[12px] font-semibold text-gray-900 cursor-pointer">Fire Suppression</SelectItem>
                    <SelectItem value="FUEL_LOGISTICS" className="text-[12px] font-semibold text-gray-900 cursor-pointer">Fuel Logistics</SelectItem>
                    <SelectItem value="LOAD_PANEL" className="text-[12px] font-semibold text-gray-900 cursor-pointer">Load Panel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 2: Asset ID and IP Address */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1.5">
                  Asset ID
                </label>
                <input
                  type="text"
                  disabled
                  value={asset.id}
                  className="w-full px-4 py-3 rounded-xl bg-gray-100 border border-gray-200 text-[12px] font-semibold text-gray-400 cursor-not-allowed focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1.5">
                  IP Address
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
            </div>

            {/* Row 3: Manufacturer and Model */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1.5">
                  Manufacturer
                </label>
                <input
                  type="text"
                  required
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                  placeholder="e.g. Vertiv"
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-[12px] font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1.5">
                  Model
                </label>
                <input
                  type="text"
                  required
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. Liebert EXL S1"
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-[12px] font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 transition-all"
                />
              </div>
            </div>

            {/* Row 4: Firmware and Rack Location */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1.5">
                  Firmware Version
                </label>
                <input
                  type="text"
                  required
                  value={firmwareVersion}
                  onChange={(e) => setFirmwareVersion(e.target.value)}
                  placeholder="e.g. v1.0.0"
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-[12px] font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1.5">
                  Rack Location
                </label>
                <input
                  type="text"
                  value={rackLocation}
                  onChange={(e) => setRackLocation(e.target.value)}
                  placeholder="e.g. R-01"
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-[12px] font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 transition-all"
                />
              </div>
            </div>

            {/* Row 5: Room */}
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1.5">
                Room
              </label>
              {rooms.length === 0 ? (
                <div className="text-[11px] text-red-500 font-bold uppercase tracking-wider p-3 bg-red-50 rounded-xl border border-red-100">
                  No rooms configured. Add a room in the sidebar first.
                </div>
              ) : (
                <Select value={selectedRoomId} onValueChange={setSelectedRoomId}>
                  <SelectTrigger className="w-full h-11 bg-gray-50 border border-gray-200 rounded-xl text-[12px] font-semibold text-gray-900 focus:ring-1 focus:ring-gray-450 focus:border-gray-450">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-gray-100 rounded-xl shadow-lg z-[10000]">
                    {rooms.map((r) => (
                      <SelectItem key={r.id} value={r.id} className="text-[12px] font-semibold text-gray-900 cursor-pointer">
                        {r.room_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
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
              disabled={isSaving || rooms.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 text-white text-[11px] font-black uppercase tracking-wider hover:bg-gray-700 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
            >
              {isSaving && <Loader2 size={12} className="animate-spin" />}
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
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
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  // Form states
  const [parameterName, setParameterName] = useState("");
  const [dataType, setDataType] = useState<'number' | 'string' | 'boolean'>("number");
  const [isConstant, setIsConstant] = useState(false);
  const [constantValue, setConstantValue] = useState("");
  const [isGraphable, setIsGraphable] = useState(false);
  const [unit, setUnit] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

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
      // Reset form
      setParameterName("");
      setDataType("number");
      setIsConstant(false);
      setConstantValue("");
      setIsGraphable(false);
      setUnit("");
      setValidationError(null);
    }
  }, [isOpen, equipmentId]);

  if (!isOpen) return null;

  const handleAddParameter = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const nameTrimmed = parameterName.trim();
    if (!nameTrimmed) {
      setValidationError("Parameter name is required.");
      return;
    }

    // Check unique parameter name for this equipment
    const exists = parameters.some(
      (p) => p.parameter_name.toLowerCase() === nameTrimmed.toLowerCase()
    );
    if (exists) {
      setValidationError(`A parameter named "${nameTrimmed}" already exists for this equipment.`);
      return;
    }

    let finalConstantValue = null;
    if (isConstant) {
      const valTrimmed = constantValue.trim();
      if (!valTrimmed) {
        setValidationError("Constant value is required for constant parameters.");
        return;
      }

      // DataType validations
      if (dataType === "number") {
        const num = Number(valTrimmed);
        if (isNaN(num)) {
          setValidationError("Constant value must be a valid number.");
          return;
        }
      } else if (dataType === "boolean") {
        const valLower = valTrimmed.toLowerCase();
        if (valLower !== "true" && valLower !== "false") {
          setValidationError("Constant value must be 'true' or 'false' for boolean type.");
          return;
        }
      }
      finalConstantValue = valTrimmed;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("equipment_parameters")
        .insert([{
          equipment_id: equipmentId,
          parameter_name: nameTrimmed,
          data_type: dataType,
          is_constant: isConstant,
          constant_value: finalConstantValue,
          is_graphable: isGraphable,
          unit: unit.trim() || null
        }]);

      if (error) throw error;

      // Reset form fields
      setParameterName("");
      setConstantValue("");
      setIsConstant(false);
      setIsGraphable(false);
      setUnit("");
      
      // Reload
      await fetchParameters();
    } catch (err: any) {
      console.error("Error saving parameter:", err);
      setValidationError(err.message || "Failed to save parameter.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteParameter = async (paramId: string) => {
    setIsDeletingId(paramId);
    try {
      const { error } = await supabase
        .from("equipment_parameters")
        .delete()
        .eq("id", paramId);

      if (error) throw error;
      setParameters((prev) => prev.filter((p) => p.id !== paramId));
    } catch (err) {
      console.error("Error deleting parameter:", err);
      alert("Failed to delete parameter.");
    } finally {
      setIsDeletingId(null);
    }
  };

  // Grouping
  const constants = parameters.filter((p) => p.is_constant);
  const telemetries = parameters.filter((p) => !p.is_constant);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <div>
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5">
              EAV Parameter Engine · {equipmentId}
            </div>
            <h2 className="text-[16px] font-black text-gray-900 leading-none">
              Manage Equipment Parameters
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Side-by-Side */}
        <div className="flex-1 overflow-y-auto flex flex-col min-h-0">

          {/* Telemetry History Chart — full width panel */}
          <ChartPanel equipmentId={equipmentId} />

          {/* Parameters + Form side by side */}
          <div className="flex flex-col md:flex-row min-h-0 flex-1">
          {/* Left Panel: Parameters List */}
          <div className="w-full md:w-3/5 border-r border-gray-100 p-6 overflow-y-auto flex flex-col gap-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                <Loader2 size={24} className="animate-spin text-red-500" />
                <span className="text-xs font-bold uppercase tracking-wider">Loading parameters...</span>
              </div>
            ) : parameters.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400 border-2 border-dashed border-gray-100 rounded-2xl">
                <Database size={32} className="mb-2 text-gray-300" />
                <span className="text-xs font-bold uppercase tracking-wider">No parameters configured</span>
                <p className="text-[10px] text-gray-400 text-center mt-1 max-w-[240px]">
                  Add telemetry metrics or threshold configurations using the form on the right.
                </p>
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
                          className="bg-blue-50/30 border border-blue-100 rounded-xl p-3.5 flex items-center justify-between gap-4 group"
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
                          <button
                            type="button"
                            onClick={() => handleDeleteParameter(param.id)}
                            disabled={isDeletingId === param.id}
                            className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50/50 transition-all cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100"
                          >
                            {isDeletingId === param.id ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Trash2 size={13} />
                            )}
                          </button>
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
                          className="bg-red-50/20 border border-red-100/50 rounded-xl p-3.5 flex items-center justify-between gap-4 group"
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
                          <button
                            type="button"
                            onClick={() => handleDeleteParameter(param.id)}
                            disabled={isDeletingId === param.id}
                            className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50/50 transition-all cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100"
                          >
                            {isDeletingId === param.id ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Trash2 size={13} />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right Panel: Add Form */}
          <div className="w-full md:w-2/5 p-6 bg-gray-50/50 overflow-y-auto">
            <h3 className="text-[11px] font-black text-gray-900 uppercase tracking-widest mb-4">
              Add Parameter
            </h3>
            
            <form onSubmit={handleAddParameter} className="space-y-4">
              {validationError && (
                <div className="bg-red-50 border border-red-100 text-[11px] text-red-700 font-semibold p-3.5 rounded-xl flex items-start gap-2 animate-fade-in">
                  <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                  <span>{validationError}</span>
                </div>
              )}

              {/* Parameter Name */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5">
                  Parameter Name
                </label>
                <input
                  type="text"
                  required
                  value={parameterName}
                  onChange={(e) => setParameterName(e.target.value)}
                  placeholder="e.g. Serial Number, Humidity Set"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-gray-200 text-[12px] font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 transition-all"
                />
              </div>

              {/* Data Type */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5">
                  Data Type
                </label>
                <Select value={dataType} onValueChange={(value) => setDataType(value as any)}>
                  <SelectTrigger className="w-full h-11 bg-white border border-gray-200 rounded-xl text-[12px] font-semibold text-gray-900 focus:ring-1 focus:ring-gray-450 focus:border-gray-450">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-gray-100 rounded-xl shadow-lg z-[10000]">
                    <SelectItem value="number" className="text-[12px] font-semibold text-gray-900 cursor-pointer">Number</SelectItem>
                    <SelectItem value="string" className="text-[12px] font-semibold text-gray-900 cursor-pointer">String</SelectItem>
                    <SelectItem value="boolean" className="text-[12px] font-semibold text-gray-900 cursor-pointer">Boolean</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Toggle: Is Constant */}
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <div>
                  <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider">
                    Is Constant
                  </label>
                  <span className="text-[9px] text-gray-400 font-semibold">
                    Set a fixed configuration value
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={isConstant}
                  onChange={(e) => {
                    setIsConstant(e.target.checked);
                    if (!e.target.checked) setConstantValue("");
                  }}
                  className="w-4 h-4 rounded text-red-600 focus:ring-red-500 border-gray-300"
                />
              </div>

              {/* Constant Value (Only visible if isConstant is true) */}
              {isConstant && (
                <div className="animate-slide-down">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5">
                    Constant Value
                  </label>
                  <input
                    type="text"
                    required
                    value={constantValue}
                    onChange={(e) => setConstantValue(e.target.value)}
                    placeholder={dataType === 'boolean' ? 'true or false' : dataType === 'number' ? 'e.g. 54.2' : 'e.g. SN-09874'}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-gray-200 text-[12px] font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 transition-all"
                  />
                </div>
              )}

              {/* Toggle: Is Graphable */}
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <div>
                  <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider">
                    Is Graphable
                  </label>
                  <span className="text-[9px] text-gray-400 font-semibold">
                    Enable charting and trend analysis
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={isGraphable}
                  onChange={(e) => setIsGraphable(e.target.checked)}
                  className="w-4 h-4 rounded text-red-600 focus:ring-red-500 border-gray-300"
                />
              </div>

              {/* Unit */}
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5">
                  Unit (Optional)
                </label>
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="e.g. kW, V DC, °C, %"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-gray-200 text-[12px] font-semibold text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 transition-all"
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSaving}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-900 text-white text-[11px] font-black uppercase tracking-wider hover:bg-gray-700 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 mt-2"
              >
                {isSaving ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Plus size={13} />
                )}
                <span>Add Parameter</span>
              </button>
            </form>
          </div>
          </div>  {/* end parameters + form side-by-side */}
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
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAddRoomModalOpen, setIsAddRoomModalOpen] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [isParamsModalOpen, setIsParamsModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  
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

  const handleDeleteRoom = async (roomId: string, roomName: string, assetCount: number) => {
    if (assetCount > 0) {
      alert(`Cannot delete room "${roomName}" because it contains ${assetCount} active asset(s). Please move or delete the assets first.`);
      return;
    }

    const confirmed = window.confirm(`Are you sure you want to delete the room "${roomName}"? This action cannot be undone.`);
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from("rooms")
        .delete()
        .eq("id", roomId);

      if (error) throw error;

      // Update local state
      setRooms((prev) => prev.filter((r) => r.id !== roomId));
      
      // If the deleted room was active, reset activeRoomId
      if (activeRoomId === roomId) {
        setActiveRoomId(null);
      }
      
      alert(`Room "${roomName}" deleted successfully.`);
    } catch (err: any) {
      console.error("Error deleting room:", err);
      alert(`Failed to delete room: ${err.message || "Unknown error"}`);
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
        .eq("is_active", true)
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

          // Derive initial status from is_active; field technicians update
          // this to DEGRADED/OFFLINE via the 3-way toggle on the checklist.
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
            room_id:      row.room_id
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
      <AddAssetModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        onSaveSuccess={fetchAssets} 
        rooms={rooms}
        assets={assets}
      />
      <AddRoomModal
        isOpen={isAddRoomModalOpen}
        onClose={() => setIsAddRoomModalOpen(false)}
        onSaveSuccess={fetchRooms}
        setRooms={setRooms}
      />
      <EditAssetModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingAsset(null);
        }}
        onSaveSuccess={fetchAssets}
        rooms={rooms}
        asset={editingAsset}
      />
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
              <button
                onClick={() => setIsAddRoomModalOpen(true)}
                className="p-1.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-all cursor-pointer flex items-center justify-center"
                title="Create New Room"
              >
                <Plus size={12} />
              </button>
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
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRoom(room.id, room.room_name, roomAssetCount);
                        }}
                        className={`p-1 rounded-lg transition-all md:opacity-0 group-hover:opacity-100 cursor-pointer ${
                          isActive 
                            ? "text-red-200 hover:text-white hover:bg-red-650" 
                            : "text-gray-400 hover:text-red-500 hover:bg-red-50"
                        }`}
                        title="Delete Room"
                      >
                        <Trash2 size={12} />
                      </button>

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

            {/* Add Equipment */}
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 h-9 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[11px] font-black uppercase tracking-wider active:scale-[0.98] transition-all flex-shrink-0 cursor-pointer"
            >
              Add Equipment
            </button>
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
                              onClick={() => {
                                setEditingAsset(asset);
                                setIsEditModalOpen(true);
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-[10px] font-black uppercase tracking-wider text-slate-700 hover:text-slate-900 hover:bg-gray-50 transition-all cursor-pointer shadow-sm active:scale-95"
                              title="Edit Equipment"
                            >
                              Edit
                            </button>
                            <button
                              onClick={async () => {
                                if (window.confirm(`Are you sure you want to decommission equipment ${asset.id}?`)) {
                                  // Optimistic UI update
                                  setAssets((prev) => prev.filter((a) => a.id !== asset.id));
                                  try {
                                    const { error } = await supabase
                                      .from("equipment_registry")
                                      .update({ is_active: false })
                                      .eq("equipment_id", asset.id);
                                    if (error) throw error;
                                  } catch (err) {
                                    console.error("Error decommissioning equipment:", err);
                                    alert("Failed to decommission equipment. Rolling back.");
                                    fetchAssets(); // rollback
                                  }
                                }
                              }}
                              className="p-1.5 rounded-lg bg-red-50 border border-red-100 text-red-500 hover:text-red-700 hover:bg-red-100/50 transition-all cursor-pointer active:scale-95 flex items-center justify-center"
                              title="Decommission Equipment"
                            >
                              <Trash2 size={13} />
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
