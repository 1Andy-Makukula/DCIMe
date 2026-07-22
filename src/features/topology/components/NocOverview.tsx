import React from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Zap,
  Thermometer,
  AlertTriangle,
  Activity,
  CheckCircle2,
  Clock,
  User,
  Search,
  RefreshCw,
} from "lucide-react";
import { GlowDot } from "@/shared/ui";
import { useNocTelemetry } from "../hooks/useNocTelemetry";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { useAuth } from "@/shared/context/AuthContext";


// ── Shared card wrapper ──────────────────────────────────────────────────────
function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-white border border-gray-100 rounded-2xl shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

// ── Section label ────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.14em] mb-0.5">
      {children}
    </div>
  );
}

// ── Custom tooltip for recharts ──────────────────────────────────────────────
const darkTooltipStyle = {
  background: "#0C0D0D",
  border: "none",
  borderRadius: 10,
  color: "white",
  fontSize: 11,
};

// ── Main component ────────────────────────────────────────────────────────────
export function NocOverview() {
  const { employee } = useAuth();
  const {
    loadChartData,
    thermalData,
    phaseAlerts,
    latestMetrics,
    isLoading,
  } = useNocTelemetry();

  const isGen = latestMetrics['fsm_mode'] === 'OUTAGE' || latestMetrics['fsm_mode'] === 'ON_LOAD_TEST' || latestMetrics['grid_status'] === 'OFF';
  const pfVal = latestMetrics['grid_power_factor'] || '0.98';

  const currentLoad = loadChartData.length > 0
    ? loadChartData[loadChartData.length - 1].kw
    : 0;

  const { currentSite } = useCurrentSite();

  // ── Live KPI state ────────────────────────────────────────────────────────
  interface CategoryCount { category: string; count: number }
  const [categoryCounts, setCategoryCounts] = React.useState<CategoryCount[]>([]);
  const [totalAssets,    setTotalAssets]    = React.useState<number | null>(null);
  const [totalRooms,     setTotalRooms]     = React.useState<number | null>(null);
  const [kpiLoading,     setKpiLoading]     = React.useState(true);

  const fetchKpis = React.useCallback(async () => {
    if (!currentSite?.id) { setKpiLoading(false); return; }
    setKpiLoading(true);
    try {
      // 1) Active equipment grouped by category
      const { data: eqRows, error: eqErr } = await supabase
        .from("equipment_registry")
        .select("category")
        .eq("site_uuid", currentSite.id)
        .eq("is_active", true);
      if (eqErr) throw eqErr;

      const countMap: Record<string, number> = {};
      (eqRows || []).forEach((r: any) => {
        countMap[r.category] = (countMap[r.category] ?? 0) + 1;
      });
      const cats: CategoryCount[] = Object.entries(countMap)
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count);

      setCategoryCounts(cats);
      setTotalAssets((eqRows || []).length);

      // 2) Room count
      const { count: roomCount, error: roomErr } = await supabase
        .from("rooms")
        .select("*", { count: "exact", head: true })
        .eq("site_id", currentSite.id);
      if (roomErr) throw roomErr;
      setTotalRooms(roomCount ?? 0);
    } catch (err) {
      console.error("[NocOverview] KPI fetch error:", err);
    } finally {
      setKpiLoading(false);
    }
  }, [currentSite?.id]);

  React.useEffect(() => { fetchKpis(); }, [fetchKpis]);

  // ── Alarm count from already-fetched incidents — computed below after state ──
  // (openAlarmCount is declared after `incidents` state below)

  interface IncidentLog {
    id: string;
    ticket_number: string;
    status: string;
    site_name: string;
    asset_id: string;
    severity: string;
    notes: string;
    photo_url: string | null;
    comments: Array<{
      author_name: string;
      author_id: string;
      comment_text: string;
      type: string;
      timestamp: string;
      photo_url?: string;
    }>;
    created_at: string;
    raised_by_name: string;
    raised_by_id: string;
    occurred_at: string;
    resolved_at: string | null;
    resolved_by_name: string | null;
    resolved_by_id: string | null;
    receipt_number: string | null;
    impact: string | null;
    contractor_engaged: string | null;
    resolution_details: string | null;
  }

  const [incidents, setIncidents] = React.useState<IncidentLog[]>([]);
  const [filter, setFilter] = React.useState<"all" | "open" | "resolved">("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [activePhotoUrl, setActivePhotoUrl] = React.useState<string | null>(null);

  // Open alarm count — derived from incidents state
  const openAlarmCount = incidents.filter((i) => i.status === "OPEN").length;

  const fetchIncidents = async () => {
    try {
      const { data, error } = await supabase
        .from("incidents")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setIncidents(data || []);
    } catch (err) {
      console.error("Error fetching incidents for NOC:", err);
    }
  };

  React.useEffect(() => {
    fetchIncidents();
  }, []);

  // Filter and search logic
  const filteredIncidents = incidents.filter((incident) => {
    if (filter === "open" && incident.status !== "OPEN") return false;
    if (filter === "resolved" && incident.status !== "RESOLVED") return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTicket = incident.ticket_number?.toLowerCase().includes(q);
      const matchAsset = incident.asset_id?.toLowerCase().includes(q);
      const matchTech = incident.raised_by_name?.toLowerCase().includes(q) || 
                         incident.resolved_by_name?.toLowerCase().includes(q) ||
                         incident.raised_by_id?.toLowerCase().includes(q) ||
                         incident.resolved_by_id?.toLowerCase().includes(q);
      const matchContractor = incident.contractor_engaged?.toLowerCase().includes(q);
      const matchDetails = incident.resolution_details?.toLowerCase().includes(q);
      
      return matchTicket || matchAsset || matchTech || matchContractor || matchDetails;
    }

    return true;
  });

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  };

  const getDurationText = (created: string, resolved: string) => {
    const start = new Date(created);
    const end = new Date(resolved);
    const diff = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      const diffHours = Math.floor(diff / (1000 * 60 * 60));
      if (diffHours === 0) {
        return "Resolved in <1 hr";
      }
      return `Resolved in ${diffHours} hr${diffHours === 1 ? '' : 's'}`;
    }
    return `Resolved in ${diffDays} day${diffDays === 1 ? '' : 's'}`;
  };

  const getAgingText = (created: string) => {
    const start = new Date(created);
    const now = new Date();
    const diff = Math.abs(now.getTime() - start.getTime());
    const diffDays = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Active today";
    return `Active for ${diffDays} day${diffDays === 1 ? '' : 's'}`;
  };

  return (
    <div className="min-h-full p-4 lg:p-6 bg-gray-50">
      {/* Page header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-black text-gray-900 tracking-tight leading-none">
            Executive Overview
          </h1>
          <div className="flex items-center gap-2 mt-1.5">
            <GlowDot color="#19C853" />
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.12em]">
              Site NTC ZM-0874 · Live
            </span>
            <span className="text-[10px] text-gray-300 font-mono ml-2">
              Last sync: 14:31 UTC+2
            </span>
          </div>
        </div>

        {/* Seed Database buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              if (window.confirm("Are you sure you want to seed WTC database from legacy schema? This will clean up existing WTC rooms and parameters.")) {
                const { seedWtcData } = await import("@/shared/utils/seedDatabase");
                const res = await seedWtcData();
                if (res.success) {
                  alert(res.message);
                } else {
                  alert("Error: " + res.message);
                }
              }
            }}
            className="bg-white border border-gray-250 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-700 hover:text-red-500 hover:border-red-100 hover:bg-red-50/20 active:scale-95 transition-all shadow-sm flex items-center gap-2 cursor-pointer"
          >
            🌱 Seed WTC DB
          </button>

          <button
            onClick={async () => {
              if (window.confirm("Are you sure you want to seed NTC database from legacy schema? This will clean up existing NTC rooms and parameters.")) {
                const { seedNtcData } = await import("@/shared/utils/seedDatabase");
                const res = await seedNtcData();
                if (res.success) {
                  alert(res.message);
                } else {
                  alert("Error: " + res.message);
                }
              }
            }}
            className="bg-white border border-gray-250 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-700 hover:text-red-500 hover:border-red-100 hover:bg-red-50/20 active:scale-95 transition-all shadow-sm flex items-center gap-2 cursor-pointer"
          >
            🌱 Seed NTC DB
          </button>

          <button
            onClick={() => {
              const role = employee?.role || "ADMIN";
              window.open(`/topology_engine/renderer/index.html?role=${role}`, "_blank");
            }}
            className="bg-white border border-gray-250 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-700 hover:text-red-500 hover:border-red-100 hover:bg-red-50/20 active:scale-95 transition-all shadow-sm flex items-center gap-2 cursor-pointer"
          >
            📊 View Visual Topology
          </button>

          {/* Live pulse badge */}
          <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-3 py-2">
            <span
              className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0"
              style={{ animation: "pulse 2s infinite" }}
            />
            <span className="text-[11px] font-black text-green-700 uppercase tracking-wider">
              All Systems Nominal
            </span>
          </div>
        </div>
      </div>

      {/* ── Main 12-column grid ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 1: Global Power State  (col-span-8)
        ════════════════════════════════════════════════════════════════════ */}
        <Card className="lg:col-span-8 p-5">
          {/* Card header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <SectionLabel>Global Power State</SectionLabel>
              {/* Active source pill */}
              <div className="flex items-center gap-2 mt-2">
                <div className={`flex items-center gap-2 border rounded-xl px-3 py-1.5 ${
                  isGen ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-green-50 border-green-100 text-green-700"
                }`}>
                  <GlowDot color={isGen ? "#F59E0B" : "#19C853"} />
                  <span className="text-[13px] font-black tracking-tight">
                    {isGen ? "Generator Active" : "Mains Active"}
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-gray-400">
                  {isGen ? "Diesel Generator Feed · 400 V AC" : `ZESCO Grid · 230 V AC · PF ${pfVal}`}
                </span>
              </div>
            </div>

            {/* Live load readout */}
            <div className="text-right flex-shrink-0">
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.12em]">
                Total Facility Load
              </div>
              <div className="font-black text-[38px] text-gray-900 leading-none mt-0.5">
                {currentLoad}
                <span className="text-[16px] font-semibold text-gray-400 ml-1">
                  KW
                </span>
              </div>
              <div className="flex items-center gap-1 justify-end text-[11px] font-bold mt-1 text-green-600">
                <Activity size={11} />
                <span>Live Data</span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-100 mb-4" />

          {/* Line chart — 24 h load trend */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.12em]">
                24-Hour Load Trend
              </span>
              <div className="flex items-center gap-1.5">
                <span
                  className="w-3 h-0.5 rounded-full inline-block"
                  style={{ backgroundColor: "#EF4444" }}
                />
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                  KW
                </span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={130}>
              <LineChart
                data={loadChartData}
                margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
              >
                <XAxis
                  dataKey="t"
                  tick={{ fontSize: 9, fill: "#bbb" }}
                  tickLine={false}
                  axisLine={false}
                  interval={1}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: "#bbb" }}
                  tickLine={false}
                  axisLine={false}
                  domain={['auto', 'auto']}
                />
                <RechartsTooltip
                  contentStyle={darkTooltipStyle}
                  formatter={(v: number) => [`${v} KW`, "Load"]}
                />
                <Line
                  type="monotone"
                  dataKey="kw"
                  stroke="#EF4444"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, fill: "#EF4444", strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Footer meta strip */}
          <div className="flex items-center gap-6 mt-3 pt-3 border-t border-gray-50">
            {[
              { label: "UPS Charge", value: `${latestMetrics.ups_1_battery_charge_percent || 100}%`, color: "#19C853" },
              { label: "Site Uptime", value: isGen ? "Generator Mode" : "99.97%", color: isGen ? "#F59E0B" : "#19C853" },
              { label: "Phase Balance", value: "Monitoring", color: "#FFB020" },
              { label: "DC Bus", value: `${latestMetrics.rectifier_1_dc_voltage || 48.1} V`, color: "#19C853" },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-[9px] font-black text-gray-400 uppercase tracking-wider">
                  {stat.label}
                </div>
                <div
                  className="text-[13px] font-black mt-0.5"
                  style={{ color: stat.color }}
                >
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 3: High-Level Asset Tally  (col-span-4, row 1)
        ════════════════════════════════════════════════════════════════════ */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <SectionLabel>Live Asset KPIs</SectionLabel>

          {/* Total Active Assets */}
          <Card className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-green-50">
              <Zap size={22} color="#19C853" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.12em]">
                Active Equipment
              </div>
              {kpiLoading ? (
                <div className="h-7 w-12 bg-gray-100 rounded-lg animate-pulse mt-1" />
              ) : (
                <div className="font-black text-[28px] text-gray-900 leading-none mt-0.5">
                  {totalAssets ?? 0}
                </div>
              )}
              <div className="text-[10px] font-semibold text-gray-400 mt-0.5">
                {currentSite?.site_name ?? "—"}
              </div>
            </div>
            <CheckCircle2 size={20} className="text-green-400 flex-shrink-0" />
          </Card>

          {/* Active Alarms */}
          <Card className="p-4 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
              openAlarmCount > 0 ? "bg-red-50" : "bg-gray-100"
            }`}>
              <AlertTriangle size={22} color={openAlarmCount > 0 ? "#DC2626" : "#999"} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.12em]">
                Open Alarms
              </div>
              {kpiLoading ? (
                <div className="h-7 w-12 bg-gray-100 rounded-lg animate-pulse mt-1" />
              ) : (
                <div className={`font-black text-[28px] leading-none mt-0.5 ${
                  openAlarmCount > 0 ? "text-red-600" : "text-gray-900"
                }`}>
                  {openAlarmCount}
                </div>
              )}
              <div className="text-[10px] font-semibold text-gray-400 mt-0.5">
                Incidents requiring attention
              </div>
            </div>
            {openAlarmCount > 0 ? (
              <AlertTriangle size={18} className="text-red-400 flex-shrink-0 animate-pulse" />
            ) : (
              <CheckCircle2 size={18} className="text-green-400 flex-shrink-0" />
            )}
          </Card>

          {/* Total Rooms + per-category breakdown */}
          <Card className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-blue-50">
                <Thermometer size={18} color="#3B82F6" />
              </div>
              <div>
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.12em]">
                  Physical Rooms
                </div>
                {kpiLoading ? (
                  <div className="h-6 w-8 bg-gray-100 rounded animate-pulse mt-0.5" />
                ) : (
                  <div className="font-black text-[22px] text-gray-900 leading-none mt-0.5">
                    {totalRooms ?? 0}
                  </div>
                )}
              </div>
            </div>
            {/* Category breakdown pills */}
            {!kpiLoading && categoryCounts.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-gray-50">
                {categoryCounts.map(({ category, count }) => (
                  <span
                    key={category}
                    className="inline-flex items-center gap-1 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-[9px] font-black uppercase tracking-wider text-gray-500"
                  >
                    <span className="font-mono text-gray-900">{count}</span>
                    {category}
                  </span>
                ))}
              </div>
            )}
            {kpiLoading && (
              <div className="flex gap-1.5 mt-2">
                {[60, 50, 70].map((w) => (
                  <div key={w} className="h-5 bg-gray-100 rounded animate-pulse" style={{ width: w }} />
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 2: Thermal Snapshot  (col-span-8, row 2)
        ════════════════════════════════════════════════════════════════════ */}
        <Card className="lg:col-span-8 p-5">
          {/* Card header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <SectionLabel>Thermal Delta Zones</SectionLabel>
              <div className="text-[11px] font-semibold text-gray-400 mt-0.5">
                Room inlet temperatures · °C
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
                Nominal
              </div>
              <div className="flex items-center gap-1.5 text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
                Elevated (&gt;22°C)
              </div>
              <Thermometer size={16} color="#FFB020" />
            </div>
          </div>

          {/* Horizontal bar chart */}
          <ResponsiveContainer width="100%" height={160}>
            <BarChart
              data={thermalData}
              layout="vertical"
              margin={{ top: 0, right: 40, left: 8, bottom: 0 }}
            >
              <XAxis
                type="number"
                domain={[0, 25]}
                tick={{ fontSize: 9, fill: "#bbb" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}°`}
              />
              <YAxis
                type="category"
                dataKey="room"
                tick={{ fontSize: 10, fill: "#6b7280", fontWeight: 700 }}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <RechartsTooltip
                contentStyle={darkTooltipStyle}
                formatter={(v: number) => [`${v}°C`, "Temperature"]}
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
              />
              <Bar dataKey="temp" radius={[0, 4, 4, 0]} barSize={18}>
                {thermalData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.temp > 22 ? "#EF4444" : "#19C853"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Temperature readout row */}
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-50 flex-wrap">
            {thermalData.map((zone) => (
              <div
                key={zone.room}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-black ${
                  zone.temp > 22
                    ? "bg-red-50 text-red-600"
                    : "bg-green-50 text-green-700"
                }`}
              >
                <span>{zone.room}</span>
                <span className="font-mono">{zone.temp}°C</span>
              </div>
            ))}
            <div className="ml-auto text-[10px] font-semibold text-gray-400">
              Threshold: 22°C
            </div>
          </div>
        </Card>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 4: Triage Feed — Active Imbalances  (col-span-4, row 2)
        ════════════════════════════════════════════════════════════════════ */}
        <Card className="lg:col-span-4 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
            <div>
              <SectionLabel>Active Imbalances</SectionLabel>
              <div className="text-[11px] font-semibold text-gray-400 mt-0.5">
                Critical Alerts
              </div>
            </div>
            <span className="bg-red-50 text-red-600 text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider border border-red-100">
              {phaseAlerts.length} Active
            </span>
          </div>

          {/* Alert list */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {phaseAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`flex gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors ${
                  alert.level === "crit" ? "bg-red-50/40" : ""
                }`}
              >
                {/* Icon */}
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    alert.level === "crit" ? "bg-red-100" : "bg-amber-50"
                  }`}
                >
                  <AlertTriangle
                    size={14}
                    color={alert.level === "crit" ? "#DC2626" : "#D97706"}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Unit name + level badge */}
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${
                        alert.level === "crit"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {alert.level === "crit" ? "CRITICAL" : "WARN"}
                    </span>
                    <span className="text-[9px] font-mono text-gray-400">
                      {alert.id}
                    </span>
                  </div>

                  {/* Message */}
                  <div
                    className={`text-[11px] font-semibold leading-snug ${
                      alert.level === "crit" ? "text-red-800" : "text-gray-700"
                    }`}
                  >
                    {alert.msg}
                  </div>

                  {/* Timestamp */}
                  <div className="flex items-center gap-1 mt-1.5 text-[9px] font-semibold text-gray-400">
                    <Clock size={9} />
                    <span>{alert.time}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0 bg-gray-50/50">
            <div className="text-[10px] font-semibold text-gray-400 text-center">
              View full alert log in the Alerts tab
            </div>
          </div>
        </Card>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 5: Incident Resolution & NOC Audit Log (col-span-12)
        ════════════════════════════════════════════════════════════════════ */}
        <Card className="lg:col-span-12 p-5 flex flex-col space-y-4">
          {/* Card Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-100 pb-4">
            <div>
              <SectionLabel>Incident Resolution & NOC Audit Log</SectionLabel>
              <div className="text-[11px] font-semibold text-gray-400 mt-0.5">
                Official facility dispatch registry and technician audit trail.
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              {/* Search Bar */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by ticket, asset, tech..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-4 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 placeholder-gray-400 focus:outline-none focus:border-red-500 w-48 transition-all"
                />
              </div>

              {/* Filter Buttons */}
              <div className="bg-gray-100 p-1 rounded-xl flex gap-1 border border-gray-200/40">
                {(["all", "open", "resolved"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFilter(t)}
                    className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                      filter === t
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-400 hover:text-gray-600"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Refresh Button */}
              <button
                onClick={fetchIncidents}
                className="p-2 rounded-xl bg-gray-50 border border-gray-200 text-gray-400 hover:text-gray-950 active:scale-95 transition-all shadow-sm flex items-center justify-center"
                title="Refresh Audits"
                disabled={isLoading}
              >
                <RefreshCw size={13} className={isLoading ? "animate-spin text-red-500" : ""} />
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50/75 border-b border-gray-100 text-[10px] uppercase font-black text-gray-400 tracking-wider">
                  <th className="p-4">Ticket & Asset</th>
                  <th className="p-4">Status & Severity</th>
                  <th className="p-4">Reporter Audit</th>
                  <th className="p-4">Resolution Audit</th>
                  <th className="p-4">Duration / Aging</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {isLoading && incidents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-400 font-semibold">
                      Loading incident audit logs from Supabase...
                    </td>
                  </tr>
                ) : filteredIncidents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-400 font-semibold">
                      No incidents found matching current filters.
                    </td>
                  </tr>
                ) : (
                  filteredIncidents.map((incident) => {
                    const isResolved = incident.status === "RESOLVED";
                    return (
                      <tr key={incident.id} className="hover:bg-gray-50/40 transition-colors">
                        {/* Ticket & Asset */}
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-gray-900">{incident.ticket_number}</span>
                            {incident.ticket_number?.startsWith("VISIT-") ? (
                              <span className="inline-block bg-emerald-50 text-emerald-700 border border-emerald-100 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded">
                                👷‍♂️ Visit Log
                              </span>
                            ) : (
                              <span className="inline-block bg-red-50 text-red-700 border border-red-100 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded">
                                🚨 Fault Alert
                              </span>
                            )}
                            {incident.comments && incident.comments.length > 0 && (
                              <span className="inline-block bg-amber-50 text-amber-700 border border-amber-100 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded" title={`${incident.comments.length} appended updates`}>
                                {incident.comments.length} {incident.comments.length === 1 ? "Update" : "Updates"}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-bold text-gray-400 uppercase mt-0.5">{incident.asset_id}</div>
                        </td>


                        {/* Status & Severity */}
                        <td className="p-4">
                          <div className="flex flex-col gap-1">
                            <span className={`inline-block w-fit px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                              isResolved 
                                ? "bg-green-50 text-green-700 border border-green-100" 
                                : "bg-red-50 text-red-700 border border-red-100 animate-pulse"
                            }`}>
                              {incident.status}
                            </span>
                            <span className={`inline-block w-fit text-[9px] font-bold capitalize ${
                              incident.severity === "critical"
                                ? "text-red-600 font-black"
                                : incident.severity === "medium"
                                ? "text-amber-600"
                                : "text-blue-600"
                            }`}>
                              {incident.severity}
                            </span>
                          </div>
                        </td>

                        {/* Reporter Audit */}
                        <td className="p-4 space-y-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <User size={12} className="text-gray-400 shrink-0" />
                              <span className="font-bold text-gray-800">{incident.raised_by_name}</span>
                              <span className="text-[9px] text-gray-400">({incident.raised_by_id})</span>
                            </div>
                            <div className="text-[10px] font-semibold text-gray-400 font-mono">
                              {formatDateTime(incident.occurred_at)}
                            </div>
                            {incident.notes && (
                              <div className="text-[10px] text-gray-600 font-semibold italic bg-gray-50 border border-gray-100 rounded p-1.5 max-w-xs">
                                "{incident.notes}"
                              </div>
                            )}
                          </div>

                          {/* Reported Photo Thumbnail */}
                          {incident.photo_url && (
                            <div className="mt-1">
                              <div className="text-[8px] font-black text-gray-450 uppercase tracking-wider mb-1">Fault Photo</div>
                              <button 
                                onClick={() => setActivePhotoUrl(incident.photo_url)}
                                className="block rounded-lg overflow-hidden border border-gray-200 hover:border-blue-400 transition-all max-w-[100px] shadow-sm active:scale-95"
                              >
                                <img src={incident.photo_url} alt="Fault Evidence" className="w-full h-auto object-cover" />
                              </button>
                            </div>
                          )}

                          {/* Contractor Visits Section */}
                          {(() => {
                            const visits = (incident.comments || []).filter(c => c.type === 'contractor_visit');
                            if (visits.length === 0) return null;
                            return (
                              <div className="mt-2 space-y-1.5 pl-2 border-l border-emerald-300">
                                <div className="text-[8px] font-black text-emerald-600 uppercase tracking-widest">👷‍♂️ Contractor Visits ({visits.length})</div>
                                {visits.map((cmt, idx) => (
                                  <div key={idx} className="text-[10px] text-gray-700 leading-normal bg-emerald-50/30 p-1 rounded border border-emerald-100/40">
                                    <div className="font-semibold">{cmt.comment_text}</div>
                                    <div className="text-[8px] text-gray-400 font-mono mt-0.5">{formatDateTime(cmt.timestamp)}</div>
                                    {cmt.photo_url && (
                                      <button 
                                        onClick={() => setActivePhotoUrl(cmt.photo_url || null)}
                                        className="mt-1 block rounded overflow-hidden border border-slate-200 max-w-[60px] active:scale-95 hover:border-blue-400 transition-colors"
                                      >
                                        <img src={cmt.photo_url} alt="Progress" className="w-full h-auto" />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            );
                          })()}

                          {/* Technician Remarks Section */}
                          {(() => {
                            const remarks = (incident.comments || []).filter(c => c.type === 'addition' || c.type === 'correction');
                            if (remarks.length === 0) return null;
                            return (
                              <div className="mt-2 space-y-1 pl-2 border-l border-slate-300">
                                <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest">📝 Technician Updates ({remarks.length})</div>
                                {remarks.map((cmt, idx) => (
                                  <div key={idx} className="text-[10px] text-gray-600 leading-normal">
                                    <span className={`font-black ${cmt.type === 'correction' ? 'text-red-500' : 'text-blue-500'}`}>
                                      {cmt.type === 'correction' ? 'Correction: ' : 'Remark: '}
                                    </span>
                                    {cmt.comment_text} <span className="text-[8px] text-gray-400 font-mono">({formatDateTime(cmt.timestamp)})</span>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </td>

                        {/* Resolution Audit */}
                        <td className="p-4">
                          {isResolved ? (
                            <div className="space-y-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-green-700 font-mono text-[9px] bg-green-50 px-1.5 py-0.5 rounded border border-green-100">
                                  {incident.receipt_number}
                                </span>
                                <span className="text-[9px] text-gray-400">by {incident.resolved_by_name} ({incident.resolved_by_id})</span>
                              </div>
                              
                              <div className="text-[10px] font-semibold text-gray-450 font-mono">
                                {incident.resolved_at ? formatDateTime(incident.resolved_at) : ""}
                              </div>

                              <div className="text-[10px] text-gray-700 leading-relaxed bg-gray-50 border border-gray-150 p-2 rounded max-w-sm">
                                <span className="font-extrabold text-gray-500 block text-[8px] uppercase tracking-wider mb-0.5">Resolution Details</span>
                                {incident.resolution_details}
                              </div>

                              <div className="flex flex-wrap items-center gap-2 text-[9px] font-bold">
                                <span className="text-gray-450">Impact:</span>
                                <span className="bg-gray-150 text-gray-700 px-1.5 py-0.5 rounded uppercase">{incident.impact}</span>
                                <span className="text-gray-450">Contractor:</span>
                                <span className="bg-gray-150 text-gray-700 px-1.5 py-0.5 rounded">{incident.contractor_engaged}</span>
                              </div>

                              {/* Resolution Photo Preview */}
                              {(() => {
                                const resCmt = (incident.comments || []).find(c => c.type === 'resolution');
                                if (!resCmt?.photo_url) return null;
                                return (
                                  <div className="mt-1">
                                    <div className="text-[8px] font-black text-gray-450 uppercase tracking-wider mb-1">Resolution Photo</div>
                                    <button 
                                      onClick={() => setActivePhotoUrl(resCmt.photo_url || null)}
                                      className="block rounded-lg overflow-hidden border border-gray-200 hover:border-blue-400 transition-all max-w-[100px] shadow-sm active:scale-95"
                                    >
                                      <img src={resCmt.photo_url} alt="Resolution Details" className="w-full h-auto object-cover" />
                                    </button>
                                  </div>
                                );
                              })()}
                            </div>
                          ) : incident.contractor_engaged ? (
                            <div className="space-y-1.5">
                              <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-lg px-2 py-0.5 text-[9px] font-black uppercase tracking-wider">
                                👷‍♂️ Contractor Active
                              </span>
                              <div className="text-[10px] text-gray-700 font-bold">
                                Engaged: <span className="text-gray-900 font-black">{incident.contractor_engaged}</span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-400 italic font-semibold">Awaiting Field Clearance</span>
                          )}
                        </td>

                        {/* Duration / Aging */}
                        <td className="p-4">
                          <span className={`font-bold font-mono px-2 py-1 rounded-full text-[10px] border ${
                            isResolved
                              ? "bg-green-50 text-green-700 border-green-100"
                              : "bg-amber-50 text-amber-700 border-amber-100 animate-pulse"
                          }`}>
                            {isResolved 
                              ? incident.resolved_at 
                                ? getDurationText(incident.occurred_at, incident.resolved_at)
                                : "Cleared"
                              : getAgingText(incident.occurred_at)
                            }
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Photo Preview Modal */}
      {activePhotoUrl && (
        <div 
          onClick={() => setActivePhotoUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs cursor-pointer animate-fade-in"
        >
          <div 
            onClick={(e) => e.stopPropagation()} 
            className="relative max-w-4xl max-h-[90vh] bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col cursor-default"
          >
            <button 
              onClick={() => setActivePhotoUrl(null)}
              className="absolute top-4 right-4 z-10 px-3 py-1.5 rounded-xl bg-black/60 hover:bg-black/85 text-white active:scale-95 transition-all text-[10px] font-black uppercase tracking-wider"
            >
              Close
            </button>
            <div className="p-2 bg-slate-900 flex items-center justify-center">
              <img src={activePhotoUrl} alt="Enlarged View" className="w-full h-auto max-h-[80vh] object-contain rounded-lg" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

