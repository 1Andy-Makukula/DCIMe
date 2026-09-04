import React from "react";
import { useRealtimeTable } from "@/shared/api/realtime";
import { UTILITY_GRID_LABEL } from "@/shared/utils/branding";
import { IngestionHealthCard } from "./IngestionHealthCard";
import { SiteVitals } from "@/features/analytics/components/SiteVitals";
import { siteLabel } from "@/shared/utils/branding";
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
  Network,
  HardHat,
  Siren,
  Camera,
  MessageSquare,
} from "lucide-react";
import { GlowDot } from "@/shared/ui";
import { useNocTelemetry } from "../hooks/useNocTelemetry";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { useAuth } from "@/shared/context/AuthContext";
import { useContractorVisits } from "@/features/field/hooks/useContractorVisits";


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
      className={`bg-white border border-neutral-100 rounded-2xl shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

// ── Section label ────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.14em] mb-0.5">
      {children}
    </div>
  );
}

// ── Custom tooltip for recharts ──────────────────────────────────────────────
const darkTooltipStyle = {
  background: "var(--color-neutral-950)",
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
    lastSync,
    uptimePct,
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
    /** Null on incidents closed before close-outs were signed. */
    resolution_signature: string | null;
    resolution_signed_at: string | null;
    resolution_signed_name: string | null;
  }

  const [incidents, setIncidents] = React.useState<IncidentLog[]>([]);
  const [incidentsLoading, setIncidentsLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<"all" | "open" | "resolved">("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [activePhotoUrl, setActivePhotoUrl] = React.useState<string | null>(null);

  // Contractor inspections write to their own table, not incidents — without
  // this, whole-site and asset-level visits (anything not linked to a fault
  // ticket) had zero visibility anywhere on the NOC dashboard.
  const { visits: contractorVisits, isLoading: visitsLoading } = useContractorVisits();

  // Open alarm count — derived from incidents state
  const openAlarmCount = incidents.filter((i) => i.status === "OPEN").length;

  const fetchIncidents = async () => {
    setIncidentsLoading(true);
    try {
      const query = supabase
        .from("incidents")
        .select("*")
        .order("created_at", { ascending: false });

      // Site-scope the audit feed — without this the NOC sees (and leaks)
      // every site's incidents.
      if (currentSite?.id) {
        query.eq("site_uuid", currentSite.id);
      }

      const { data, error } = await query;

      if (error) throw error;


      const sanitized: IncidentLog[] = (data || []).map((item: any) => ({
        ...item,
        status: item.status || "OPEN",
        notes: item.notes || "",
        site_name: siteLabel(item.site_name),
        asset_id: item.asset_id || "",
        severity: item.severity || "medium",
        created_at: item.created_at || new Date().toISOString(),
        raised_by_name: item.raised_by_name || "",
        raised_by_id: item.raised_by_id || "",
        occurred_at: item.occurred_at || new Date().toISOString(),
        comments: Array.isArray(item.comments) ? item.comments : []
      }));
      setIncidents(sanitized);
    } catch (err) {
      console.error("Error fetching incidents for NOC:", err);
    } finally {
      setIncidentsLoading(false);
    }
  };

  React.useEffect(() => { fetchIncidents(); }, [currentSite?.id]);

  // Live incident feed, scoped to this site.
  useRealtimeTable({
    table:    "incidents",
    filter:   currentSite?.id ? `site_uuid=eq.${currentSite.id}` : undefined,
    onChange: fetchIncidents
  });


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
    <div className="min-h-full p-4 lg:p-6 bg-neutral-50">
      {/* Page header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-black text-neutral-900 tracking-tight leading-none">
            Executive Overview
          </h1>
          <div className="flex items-center gap-2 mt-1.5">
            <GlowDot color="var(--color-ok-500)" />
            <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-[0.12em]">
              {currentSite?.site_name || "—"} · Live
            </span>
            <span className="text-[10px] text-neutral-300 font-mono ml-2">
              Last sync: {lastSync} CAT
            </span>
          </div>
        </div>

        {/* Header actions (database seed/wipe buttons were removed from the
            live dashboard — one accidental click would destroy pilot data.
            Seeding is a SQL Editor / service_role operation now.) */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              const role = employee?.role || "ADMIN";
              window.open(`/topology_engine/renderer/index.html?role=${role}`, "_blank");
            }}
            className="bg-white border border-neutral-250 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider text-neutral-700 hover:text-brand-500 hover:border-brand-100 hover:bg-brand-50/20 active:scale-95 transition-all shadow-sm flex items-center gap-2 cursor-pointer"
          >
            <Network size={14} aria-hidden="true" /> View Visual Topology
          </button>

          {/* Live status badge — reacts to the actual open-alarm count */}
          {openAlarmCount > 0 ? (
            <div className="flex items-center gap-2 bg-danger-50 border border-danger-200 rounded-xl px-3 py-2">
              <span
                className="w-2 h-2 rounded-full bg-danger-500 flex-shrink-0"
                style={{ animation: "pulse 2s infinite" }}
              />
              <span className="text-[11px] font-black text-danger-700 uppercase tracking-wider">
                {openAlarmCount} Open Alarm{openAlarmCount === 1 ? "" : "s"}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-ok-50 border border-ok-100 rounded-xl px-3 py-2">
              <span
                className="w-2 h-2 rounded-full bg-ok-500 flex-shrink-0"
                style={{ animation: "pulse 2s infinite" }}
              />
              <span className="text-[11px] font-black text-ok-700 uppercase tracking-wider">
                All Systems Nominal
              </span>
            </div>
          )}
        </div>
      </div>


      {/* Data flow first: every number below is only as current as the last
          reading, so a silent site has to be visible before anything else. */}
      {/* mb-5 matches the page header's rhythm. The root container sets no
          vertical gap, so an unspaced child sits flush against the grid below. */}
      <div className="mb-5">
        <IngestionHealthCard />
      </div>

      {/* The site's actual position, which used to live two clicks away on the
          Facility and SLA sub-pages while this screen showed three inventory
          counts that do not change from one day to the next. */}
      <div className="mb-6">
        <SiteVitals />
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
                  isGen ? "bg-warn-50 border-warn-200 text-warn-800" : "bg-ok-50 border-ok-100 text-ok-700"
                }`}>
                  <GlowDot color={isGen ? "var(--color-warn-500)" : "var(--color-ok-500)"} />
                  <span className="text-[13px] font-black tracking-tight">
                    {isGen ? "Generator Active" : "Mains Active"}
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-neutral-400">
                  {isGen ? "Diesel Generator Feed · 400 V AC" : `${UTILITY_GRID_LABEL} · 230 V AC · PF ${pfVal}`}
                </span>
              </div>
            </div>

            {/* Live load readout */}
            <div className="text-right flex-shrink-0">
              <div className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.12em]">
                Total Facility Load
              </div>
              <div className="font-black text-[38px] text-neutral-900 leading-none mt-0.5">
                {currentLoad}
                <span className="text-[16px] font-semibold text-neutral-400 ml-1">
                  KW
                </span>
              </div>
              <div className="flex items-center gap-1 justify-end text-[11px] font-bold mt-1 text-ok-600">
                <Activity size={11} />
                <span>Live Data</span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-neutral-100 mb-4" />

          {/* Line chart — 24 h load trend */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.12em]">
                24-Hour Load Trend
              </span>
              <div className="flex items-center gap-1.5">
                <span
                  className="w-3 h-0.5 rounded-full inline-block"
                  style={{ backgroundColor: "var(--color-danger-500)" }}
                />
                <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">
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
                  stroke="var(--color-danger-500)"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, fill: "var(--color-danger-500)", strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Footer meta strip */}
          <div className="flex items-center gap-6 mt-3 pt-3 border-t border-neutral-50">
            {[
              // Same fabricated-default bug fixed across the analytics hooks,
              // found here on a second pass: `|| 100` / `|| 48.1` silently
              // asserted a healthy reading whenever the real one was missing
              // or genuinely zero, indistinguishable from an actual value.
              { label: "UPS Charge", value: latestMetrics.ups_1_battery_charge_percent != null ? `${latestMetrics.ups_1_battery_charge_percent}%` : "—", color: "var(--color-ok-500)" },
              { label: "Site Uptime", value: isGen ? "Generator Mode" : (uptimePct === "—" ? "—" : `${uptimePct}%`), color: isGen ? "var(--color-warn-500)" : "var(--color-ok-500)" },

              { label: "Phase Balance", value: "Monitoring", color: "var(--color-warn-500)" },
              { label: "DC Bus", value: latestMetrics.rectifier_1_dc_voltage != null ? `${latestMetrics.rectifier_1_dc_voltage} V` : "—", color: "var(--color-ok-500)" },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-[9px] font-black text-neutral-400 uppercase tracking-wider">
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
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-ok-50">
              <Zap size={22} color="var(--color-ok-500)" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.12em]">
                Active Equipment
              </div>
              {kpiLoading ? (
                <div className="h-7 w-12 bg-neutral-100 rounded-lg animate-pulse mt-1" />
              ) : (
                <div className="font-black text-[28px] text-neutral-900 leading-none mt-0.5">
                  {totalAssets ?? 0}
                </div>
              )}
              <div className="text-[10px] font-semibold text-neutral-400 mt-0.5">
                {currentSite?.site_name ?? "—"}
              </div>
            </div>
            <CheckCircle2 size={20} className="text-ok-400 flex-shrink-0" />
          </Card>

          {/* Active Alarms */}
          <Card className="p-4 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
              openAlarmCount > 0 ? "bg-danger-50" : "bg-neutral-100"
            }`}>
              <AlertTriangle size={22} color={openAlarmCount > 0 ? "var(--color-danger-600)" : "#999"} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.12em]">
                Open Alarms
              </div>
              {kpiLoading ? (
                <div className="h-7 w-12 bg-neutral-100 rounded-lg animate-pulse mt-1" />
              ) : (
                <div className={`font-black text-[28px] leading-none mt-0.5 ${
                  openAlarmCount > 0 ? "text-danger-600" : "text-neutral-900"
                }`}>
                  {openAlarmCount}
                </div>
              )}
              <div className="text-[10px] font-semibold text-neutral-400 mt-0.5">
                Incidents requiring attention
              </div>
            </div>
            {openAlarmCount > 0 ? (
              <AlertTriangle size={18} className="text-danger-400 flex-shrink-0 animate-pulse" />
            ) : (
              <CheckCircle2 size={18} className="text-ok-400 flex-shrink-0" />
            )}
          </Card>

          {/* Total Rooms + per-category breakdown */}
          <Card className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-info-50">
                <Thermometer size={18} color="var(--color-info-500)" />
              </div>
              <div>
                <div className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.12em]">
                  Physical Rooms
                </div>
                {kpiLoading ? (
                  <div className="h-6 w-8 bg-neutral-100 rounded animate-pulse mt-0.5" />
                ) : (
                  <div className="font-black text-[22px] text-neutral-900 leading-none mt-0.5">
                    {totalRooms ?? 0}
                  </div>
                )}
              </div>
            </div>
            {/* Category breakdown pills */}
            {!kpiLoading && categoryCounts.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-neutral-50">
                {categoryCounts.map(({ category, count }) => (
                  <span
                    key={category}
                    className="inline-flex items-center gap-1 bg-neutral-50 border border-neutral-100 rounded-lg px-2 py-1 text-[9px] font-black uppercase tracking-wider text-neutral-500"
                  >
                    <span className="font-mono text-neutral-900">{count}</span>
                    {category}
                  </span>
                ))}
              </div>
            )}
            {kpiLoading && (
              <div className="flex gap-1.5 mt-2">
                {[60, 50, 70].map((w) => (
                  <div key={w} className="h-5 bg-neutral-100 rounded animate-pulse" style={{ width: w }} />
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
              <div className="text-[11px] font-semibold text-neutral-400 mt-0.5">
                Room inlet temperatures · °C
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-[9px] font-bold text-neutral-400 uppercase tracking-wider">
                <span className="w-2.5 h-2.5 rounded-full bg-ok-500 flex-shrink-0" />
                Nominal
              </div>
              <div className="flex items-center gap-1.5 text-[9px] font-bold text-neutral-400 uppercase tracking-wider">
                <span className="w-2.5 h-2.5 rounded-full bg-danger-500 flex-shrink-0" />
                Elevated (&gt;22°C)
              </div>
              <Thermometer size={16} color="var(--color-warn-500)" />
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
                tick={{ fontSize: 10, fill: "var(--color-neutral-500)", fontWeight: 700 }}
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
                    fill={entry.temp > 22 ? "var(--color-danger-500)" : "var(--color-ok-500)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Temperature readout row */}
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-neutral-50 flex-wrap">
            {thermalData.map((zone) => (
              <div
                key={zone.room}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-black ${
                  zone.temp > 22
                    ? "bg-danger-50 text-danger-600"
                    : "bg-ok-50 text-ok-700"
                }`}
              >
                <span>{zone.room}</span>
                <span className="font-mono">{zone.temp}°C</span>
              </div>
            ))}
            <div className="ml-auto text-[10px] font-semibold text-neutral-400">
              Threshold: 22°C
            </div>
          </div>
        </Card>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 4: Triage Feed — Active Imbalances  (col-span-4, row 2)
        ════════════════════════════════════════════════════════════════════ */}
        <Card className="lg:col-span-4 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100 flex-shrink-0">
            <div>
              <SectionLabel>Active Imbalances</SectionLabel>
              <div className="text-[11px] font-semibold text-neutral-400 mt-0.5">
                Critical Alerts
              </div>
            </div>
            <span className="bg-danger-50 text-danger-600 text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider border border-danger-100">
              {phaseAlerts.length} Active
            </span>
          </div>

          {/* Alert list */}
          <div className="flex-1 overflow-y-auto divide-y divide-neutral-50">
            {phaseAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`flex gap-3 px-4 py-3.5 hover:bg-neutral-50 transition-colors ${
                  alert.level === "crit" ? "bg-danger-50/40" : ""
                }`}
              >
                {/* Icon */}
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    alert.level === "crit" ? "bg-danger-100" : "bg-warn-50"
                  }`}
                >
                  <AlertTriangle
                    size={14}
                    color={alert.level === "crit" ? "var(--color-danger-600)" : "var(--color-warn-600)"}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Unit name + level badge */}
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${
                        alert.level === "crit"
                          ? "bg-danger-100 text-danger-700"
                          : "bg-warn-100 text-warn-700"
                      }`}
                    >
                      {alert.level === "crit" ? "CRITICAL" : "WARN"}
                    </span>
                    <span className="text-[9px] font-mono text-neutral-400">
                      {alert.id}
                    </span>
                  </div>

                  {/* Message */}
                  <div
                    className={`text-[11px] font-semibold leading-snug ${
                      alert.level === "crit" ? "text-danger-800" : "text-neutral-700"
                    }`}
                  >
                    {alert.msg}
                  </div>

                  {/* Timestamp */}
                  <div className="flex items-center gap-1 mt-1.5 text-[9px] font-semibold text-neutral-400">
                    <Clock size={9} />
                    <span>{alert.time}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-neutral-100 flex-shrink-0 bg-neutral-50/50">
            <div className="text-[10px] font-semibold text-neutral-400 text-center">
              View full alert log in the Alerts tab
            </div>
          </div>
        </Card>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 5: Incident Resolution & NOC Audit Log (col-span-12)
        ════════════════════════════════════════════════════════════════════ */}
        <Card className="lg:col-span-12 p-5 flex flex-col space-y-4">
          {/* Card Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-100 pb-4">
            <div>
              <SectionLabel>Incident Resolution & NOC Audit Log</SectionLabel>
              <div className="text-[11px] font-semibold text-neutral-400 mt-0.5">
                Official facility dispatch registry and technician audit trail.
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              {/* Search Bar */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Search by ticket, asset, tech..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-4 py-1.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-semibold text-neutral-800 placeholder-neutral-400 focus:outline-none focus:border-brand-500 w-48 transition-all"
                />
              </div>

              {/* Filter Buttons */}
              <div className="bg-neutral-100 p-1 rounded-xl flex gap-1 border border-neutral-200/40">
                {(["all", "open", "resolved"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFilter(t)}
                    className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                      filter === t
                        ? "bg-white text-neutral-900 shadow-sm"
                        : "text-neutral-400 hover:text-neutral-600"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Refresh Button */}
              <button
                onClick={fetchIncidents}
                className="p-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-400 hover:text-neutral-950 active:scale-95 transition-all shadow-sm flex items-center justify-center"
                title="Refresh Audits"
                disabled={incidentsLoading}
              >
                <RefreshCw size={13} className={incidentsLoading ? "animate-spin text-danger-500" : ""} />
              </button>
            </div>
          </div>

          {/* Incident Feed */}
          <div className="space-y-3">
            {incidentsLoading && incidents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
                <RefreshCw size={20} className="animate-spin mb-2 text-danger-400" />
                <span className="text-xs font-semibold">Loading incident audit logs from Supabase...</span>
              </div>
            ) : filteredIncidents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
                <CheckCircle2 size={20} className="mb-2 text-ok-400" />
                <span className="text-xs font-semibold">No incidents found matching current filters.</span>
              </div>
            ) : (
              filteredIncidents.map((incident) => {
                const isResolved = incident.status === "RESOLVED";
                const visits = (incident.comments || []).filter(c => c.type === 'contractor_visit');
                const remarks = (incident.comments || []).filter(c => c.type === 'addition' || c.type === 'correction');
                const resCmt = (incident.comments || []).find(c => c.type === 'resolution');

                return (
                  <div
                    key={incident.id}
                    className="relative rounded-xl border overflow-hidden transition-all hover:shadow-md"
                    style={{
                      borderColor: isResolved ? "var(--color-ok-100)" : "var(--color-danger-100)",
                      background: isResolved
                        ? "linear-gradient(90deg, var(--color-ok-50) 0%, #ffffff 3%)"
                        : "linear-gradient(90deg, var(--color-danger-50) 0%, #ffffff 3%)"
                    }}
                  >
                    {/* Left accent strip */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
                      style={{ backgroundColor: isResolved ? "var(--color-ok-500)" : "var(--color-danger-500)" }}
                    />

                    {/* ── Card Header ──────────────────────────────────────── */}
                    <div className="flex flex-wrap items-center gap-2 px-5 pt-4 pb-2">
                      {/* Ticket number */}
                      <span className="font-mono font-black text-[13px] text-neutral-900 tracking-tight">
                        {incident.ticket_number}
                      </span>

                      {/* Type badge */}
                      {incident.ticket_number?.startsWith("VISIT-") ? (
                        <span className="inline-flex items-center gap-1 bg-ok-50 text-ok-700 border border-ok-100 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded">
                          <HardHat size={12} aria-hidden="true" /> Visit Log
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-danger-50 text-danger-700 border border-danger-100 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded">
                          <Siren size={12} aria-hidden="true" /> Fault Alert
                        </span>
                      )}

                      {/* Status badge */}
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                        isResolved
                          ? "bg-ok-50 text-ok-700 border border-ok-100"
                          : "bg-danger-50 text-danger-700 border border-danger-100 animate-pulse"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isResolved ? "bg-ok-500" : "bg-danger-500"}`} />
                        {incident.status}
                      </span>

                      {/* Severity badge */}
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${
                        incident.severity === "critical"
                          ? "bg-danger-50 text-danger-600 border-danger-100"
                          : incident.severity === "medium"
                          ? "bg-warn-50 text-warn-600 border-warn-100"
                          : "bg-info-50 text-info-600 border-info-100"
                      }`}>
                        {incident.severity}
                      </span>

                      {/* Updates count */}
                      {incident.comments && incident.comments.length > 0 && (
                        <span className="inline-flex items-center gap-1 bg-warn-50 text-warn-700 border border-warn-100 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded">
                          {incident.comments.length} {incident.comments.length === 1 ? "Update" : "Updates"}
                        </span>
                      )}

                      {/* Duration/Aging — pushed to the right */}
                      <span className={`ml-auto font-bold font-mono px-2.5 py-1 rounded-full text-[10px] border ${
                        isResolved
                          ? "bg-ok-50 text-ok-700 border-ok-100"
                          : "bg-warn-50 text-warn-700 border-warn-100 animate-pulse"
                      }`}>
                        {isResolved
                          ? incident.resolved_at
                            ? getDurationText(incident.occurred_at, incident.resolved_at)
                            : "Cleared"
                          : getAgingText(incident.occurred_at)
                        }
                      </span>
                    </div>

                    {/* Asset ID */}
                    <div className="px-5 pb-2">
                      <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                        Asset: <span className="text-neutral-600">{incident.asset_id}</span>
                      </span>
                    </div>

                    {/* ── Card Body — 2-column grid ────────────────────────── */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 px-5 pb-4">

                      {/* Left Column: Reporter + Notes + Photos + Visits/Remarks */}
                      <div className="space-y-3">

                        {/* Reporter info */}
                        <div className="flex items-start gap-3 bg-neutral-50/70 rounded-lg p-3 border border-neutral-100">
                          <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <User size={14} className="text-neutral-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[9px] font-black text-neutral-400 uppercase tracking-wider mb-0.5">Reported By</div>
                            <div className="text-xs font-bold text-neutral-800">{incident.raised_by_name}</div>
                            <div className="text-[9px] text-neutral-400 font-mono">{incident.raised_by_id}</div>
                            <div className="text-[10px] font-semibold text-neutral-400 font-mono mt-1">
                              <Clock size={9} className="inline mr-1" />{formatDateTime(incident.occurred_at)}
                            </div>
                          </div>
                        </div>

                        {/* Notes */}
                        {incident.notes && (
                          <div className="bg-neutral-50 border border-neutral-100 rounded-lg p-3">
                            <div className="text-[8px] font-black text-neutral-400 uppercase tracking-wider mb-1">Fault Description</div>
                            <div className="text-[11px] text-neutral-700 font-semibold italic leading-relaxed">
                              "{incident.notes}"
                            </div>
                          </div>
                        )}

                        {/* Photos row — fault photo + resolution photo side by side */}
                        {(incident.photo_url || resCmt?.photo_url) && (
                          <div className="flex items-start gap-3">
                            {incident.photo_url && (
                              <div>
                                <div className="text-[8px] font-black text-danger-400 uppercase tracking-wider mb-1 flex items-center gap-1"><Camera size={10} aria-hidden="true" /> Fault Photo</div>
                                <button
                                  onClick={() => setActivePhotoUrl(incident.photo_url)}
                                  className="block rounded-lg overflow-hidden border-2 border-danger-100 hover:border-danger-300 transition-all shadow-sm active:scale-95"
                                  style={{ maxWidth: 100 }}
                                >
                                  <img src={incident.photo_url} alt="Fault Evidence" className="w-full h-auto object-cover" />
                                </button>
                              </div>
                            )}
                            {resCmt?.photo_url && (
                              <div>
                                <div className="text-[8px] font-black text-ok-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Camera size={10} aria-hidden="true" /> Resolution Photo</div>
                                <button
                                  onClick={() => setActivePhotoUrl(resCmt.photo_url || null)}
                                  className="block rounded-lg overflow-hidden border-2 border-ok-100 hover:border-ok-300 transition-all shadow-sm active:scale-95"
                                  style={{ maxWidth: 100 }}
                                >
                                  <img src={resCmt.photo_url} alt="Resolution" className="w-full h-auto object-cover" />
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Contractor Visits */}
                        {visits.length > 0 && (
                          <div className="space-y-1.5 pl-3 border-l-2 border-ok-300">
                            <div className="text-[8px] font-black text-ok-600 uppercase tracking-widest">
                              <HardHat size={12} aria-hidden="true" /> Contractor Visits ({visits.length})
                            </div>
                            {visits.map((cmt, idx) => (
                              <div key={idx} className="text-[10px] text-neutral-700 leading-normal bg-ok-50/40 p-2 rounded border border-ok-100/40">
                                <div className="font-semibold">{cmt.comment_text}</div>
                                <div className="text-[8px] text-neutral-400 font-mono mt-0.5">{formatDateTime(cmt.timestamp)}</div>
                                {cmt.photo_url && (
                                  <button
                                    onClick={() => setActivePhotoUrl(cmt.photo_url || null)}
                                    className="mt-1 block rounded overflow-hidden border border-neutral-200 max-w-[60px] active:scale-95 hover:border-info-400 transition-colors"
                                  >
                                    <img src={cmt.photo_url} alt="Progress" className="w-full h-auto" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Technician Remarks */}
                        {remarks.length > 0 && (
                          <div className="space-y-1 pl-3 border-l-2 border-neutral-300">
                            <div className="text-[8px] font-black text-neutral-500 uppercase tracking-widest">
                              <MessageSquare size={12} aria-hidden="true" /> Technician Updates ({remarks.length})
                            </div>
                            {remarks.map((cmt, idx) => (
                              <div key={idx} className="text-[10px] text-neutral-600 leading-normal">
                                <span className={`font-black ${cmt.type === 'correction' ? 'text-danger-500' : 'text-info-500'}`}>
                                  {cmt.type === 'correction' ? 'Correction: ' : 'Remark: '}
                                </span>
                                {cmt.comment_text}{" "}
                                <span className="text-[8px] text-neutral-400 font-mono">({formatDateTime(cmt.timestamp)})</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Right Column: Resolution Details */}
                      <div>
                        {isResolved ? (
                          <div className="bg-ok-50/50 border border-ok-100 rounded-xl p-4 space-y-3 h-full">
                            <div className="text-[9px] font-black text-ok-600 uppercase tracking-wider flex items-center gap-1.5">
                              <CheckCircle2 size={12} />
                              Resolution Details
                            </div>

                            {/* Resolved by + receipt */}
                            <div className="flex items-start gap-3">
                              <div className="w-7 h-7 rounded-full bg-ok-100 flex items-center justify-center flex-shrink-0">
                                <User size={12} className="text-ok-600" />
                              </div>
                              <div>
                                <div className="text-xs font-bold text-ok-800">{incident.resolved_by_name}</div>
                                <div className="text-[9px] text-ok-600 font-mono">{incident.resolved_by_id}</div>
                                {incident.receipt_number && (
                                  <div className="mt-1">
                                    <span className="font-bold text-ok-700 font-mono text-[9px] bg-ok-100 px-1.5 py-0.5 rounded border border-ok-200">
                                      {incident.receipt_number}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Resolved timestamp */}
                            {incident.resolved_at && (
                              <div className="text-[10px] font-semibold text-ok-600/80 font-mono">
                                <Clock size={9} className="inline mr-1" />{formatDateTime(incident.resolved_at)}
                              </div>
                            )}

                            {/* Resolution description */}
                            {incident.resolution_details && (
                              <div className="text-[11px] text-ok-900 leading-relaxed bg-white/60 border border-ok-100 p-2.5 rounded-lg">
                                {incident.resolution_details}
                              </div>
                            )}

                            {/* Who signed the close-out. An admin reviewing a
                                resolved incident should see the mark, not just
                                a name someone typed into a form. */}
                            {incident.resolution_signature && (
                              <div className="flex items-center gap-2 bg-white/60 border border-ok-100 p-2 rounded-lg">
                                <img
                                  src={incident.resolution_signature}
                                  alt={`Signature of ${incident.resolution_signed_name ?? "the closing technician"}`}
                                  className="h-9 object-contain shrink-0"
                                />
                                <div className="min-w-0">
                                  <p className="text-[10px] font-black text-ok-800 truncate">
                                    {incident.resolution_signed_name}
                                  </p>
                                  {incident.resolution_signed_at && (
                                    <p className="text-[9px] font-semibold text-ok-600/80 font-mono">
                                      {formatDateTime(incident.resolution_signed_at)}
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Impact + Contractor metadata */}
                            <div className="flex flex-wrap items-center gap-2 text-[9px] font-bold pt-1 border-t border-ok-100">
                              {incident.impact && (
                                <>
                                  <span className="text-ok-600">Impact:</span>
                                  <span className="bg-ok-100 text-ok-800 px-1.5 py-0.5 rounded uppercase">{incident.impact}</span>
                                </>
                              )}
                              {incident.contractor_engaged && (
                                <>
                                  <span className="text-ok-600 ml-1">Contractor:</span>
                                  <span className="bg-ok-100 text-ok-800 px-1.5 py-0.5 rounded">{incident.contractor_engaged}</span>
                                </>
                              )}
                            </div>
                          </div>
                        ) : incident.contractor_engaged ? (
                          <div className="bg-info-50/50 border border-info-100 rounded-xl p-4 space-y-2 h-full">
                            <div className="text-[9px] font-black text-info-600 uppercase tracking-wider flex items-center gap-1.5">
                              <HardHat size={12} aria-hidden="true" /> Contractor Engaged
                            </div>
                            <div className="text-sm font-black text-info-900">
                              {incident.contractor_engaged}
                            </div>
                            <div className="text-[10px] text-info-600 font-semibold">
                              Awaiting resolution sign-off
                            </div>
                          </div>
                        ) : (
                          <div className="bg-neutral-50/50 border border-neutral-100 rounded-xl p-4 flex flex-col items-center justify-center h-full text-center">
                            <AlertTriangle size={18} className="text-warn-400 mb-2" />
                            <div className="text-[10px] font-black text-neutral-400 uppercase tracking-wider">
                              Awaiting Field Clearance
                            </div>
                            <div className="text-[9px] text-neutral-400 font-semibold mt-1">
                              No resolution submitted yet
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        {/* ════════════════════════════════════════════════════════════════════
            SECTION 6: Contractor Visit Log (col-span-12)
        ════════════════════════════════════════════════════════════════════ */}
        <Card className="lg:col-span-12 p-5 flex flex-col space-y-4">
          <div className="border-b border-neutral-100 pb-4">
            <SectionLabel>Contractor Visit Log</SectionLabel>
            <div className="text-[11px] font-semibold text-neutral-400 mt-0.5">
              Site inspections and equipment checkups — never implies a fault was resolved.
            </div>
          </div>

          <div className="space-y-2">
            {visitsLoading && contractorVisits.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-neutral-400">
                <RefreshCw size={18} className="animate-spin mb-2 text-brand-400" />
                <span className="text-xs font-semibold">Loading contractor visit log...</span>
              </div>
            ) : contractorVisits.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-neutral-400">
                <span className="text-xs font-semibold">No contractor visits logged yet.</span>
              </div>
            ) : (
              contractorVisits.slice(0, 8).map((visit) => {
                const linkedTicket = visit.target_type === "TICKET"
                  ? incidents.find((i) => i.id === visit.target_ref)
                  : null;
                const targetLabel =
                  visit.target_type === "SITE" ? "Whole Site" :
                  visit.target_type === "ASSET" ? (visit.target_ref || "").toUpperCase().replace(/_/g, " ") :
                  linkedTicket ? `Ticket ${linkedTicket.ticket_number}` : "Fault Ticket";

                return (
                  <div key={visit.id} className="flex items-start gap-3 bg-neutral-50/60 border border-neutral-100 rounded-xl p-3">
                    <div className="w-8 h-8 rounded-lg bg-info-50 border border-info-100 flex items-center justify-center shrink-0 text-sm">
                      <HardHat size={14} aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-black text-neutral-900 truncate">{visit.contractor}</span>
                        <span className="text-[9px] font-bold text-neutral-400 font-mono shrink-0">
                          {formatDateTime(visit.occurred_at)}
                        </span>
                      </div>
                      <div className="text-[11px] text-neutral-600 font-semibold">{visit.purpose}</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[9px] font-black uppercase tracking-wider text-info-600 bg-info-50 border border-info-100 px-1.5 py-0.5 rounded">
                          {targetLabel}
                        </span>
                        {linkedTicket && (
                          <span className="text-[9px] font-bold text-warn-600">
                            still {linkedTicket.status}
                          </span>
                        )}
                        {/* Whether the contractor actually signed for the work
                            is the first thing worth knowing when a finding or
                            an invoice is queried. */}
                        {visit.contractor_signature ? (
                          <span className="text-[9px] font-black uppercase tracking-wider text-ok-700 bg-ok-50 border border-ok-100 px-1.5 py-0.5 rounded">
                            Signed
                          </span>
                        ) : (
                          <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400 bg-neutral-100 border border-neutral-200 px-1.5 py-0.5 rounded">
                            Unsigned
                          </span>
                        )}
                      </div>

                      {visit.contractor_signature && (
                        <div className="mt-2 flex items-end gap-2 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5">
                          <img
                            src={visit.contractor_signature}
                            alt={`${visit.contractor} signature`}
                            className="max-h-8 w-auto max-w-[8rem] object-contain"
                          />
                          <div className="min-w-0 border-t border-neutral-300 pt-0.5">
                            <p className="font-mono text-[8px] uppercase tracking-widest text-neutral-400">
                              Signed by
                            </p>
                            <p className="truncate text-[9px] font-black text-neutral-700">
                              {visit.contractor_signed_name || visit.contractor}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
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
            <div className="p-2 bg-neutral-900 flex items-center justify-center">
              <img src={activePhotoUrl} alt="Enlarged View" className="w-full h-auto max-h-[80vh] object-contain rounded-lg" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

