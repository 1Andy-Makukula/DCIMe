import { useState } from "react";
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
  ReferenceLine,
} from "recharts";
import {
  LayoutGrid,
  AlignJustify,
  Bell,
  FileText,
  Settings,
  Zap,
  Battery,
  AlertTriangle,
  ArrowLeft,
  Cpu,
  Thermometer,
  Droplets,
  Activity,
  Radio,
  Shield,
} from "lucide-react";
import { AirtelMark, GlowDot, TopologyBG } from "@/shared/ui";
import { loadChartData, thermalData, phaseAlerts } from "@/shared/utils/mockData";

export interface NocDashboardProps {
  onBack: () => void;
  onAudit: () => void;
}

export function NocDashboard({ onBack, onAudit }: NocDashboardProps) {
  const [navTab, setNavTab] = useState<"grid" | "list" | "alerts" | "reports">("grid");

  const navItems = [
    { id: "grid", icon: <LayoutGrid size={14} />, label: "Grid" },
    { id: "list", icon: <AlignJustify size={14} />, label: "List" },
    { id: "alerts", icon: <Bell size={14} />, label: "Alerts", badge: 4 },
    { id: "reports", icon: <FileText size={14} />, label: "Reports" },
  ] as const;

  return (
    // Dynamic Padding: 0 on phone, 4 on tablet, 6 on desktop
    <div className="min-h-screen p-0 md:p-4 lg:p-6 flex flex-col bg-[#0C0D0D]">
      
      {/* Dynamic Radius: Square on phone, rounded pill on desktop */}
      <div
        className="flex-1 rounded-none md:rounded-[24px] overflow-hidden flex flex-col bg-white"
        style={{ boxShadow: "0 24px 80px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.06)" }}
      >
        {/* ── Nav Header ── */}
        <nav className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <AirtelMark size={30} />
            <div>
              <div className="font-black text-[13px] leading-none tracking-tight" style={{ color: "#FF0000" }}>
                airtel
              </div>
              <div className="font-bold text-[10px] text-gray-400 leading-none mt-0.5 tracking-[0.15em] uppercase">
                DCIMe
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setNavTab(item.id)}
                className="relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-black transition-all"
                style={
                  navTab === item.id
                    ? { backgroundColor: "#FF0000", color: "white" }
                    : { color: "#999" }
                }
              >
                {item.icon}
                <span className="hidden sm:inline uppercase tracking-wide">{item.label}</span>
                {"badge" in item && navTab !== item.id && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black rounded-full w-3.5 h-3.5 flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onAudit}
              className="hidden md:flex items-center gap-1.5 text-[11px] font-bold text-gray-500 hover:text-gray-800 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-all"
            >
              <FileText size={13} /> Audit Trail
            </button>
            <button className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all">
              <Settings size={15} />
            </button>
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-[11px] font-black flex-shrink-0"
              style={{ backgroundColor: "#FF0000" }}
            >
              AM
            </div>
          </div>
        </nav>

        {/* ── Hero ── */}
        <div className="mx-4 mt-4 rounded-2xl overflow-hidden relative" style={{ backgroundColor: "#0F1111", minHeight: 130 }}>
          <TopologyBG />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/20 to-black/60" />
          <div className="relative z-10 px-6 py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <GlowDot color="#19C853" />
                <span className="text-[10px] font-black text-gray-400 tracking-[0.18em] uppercase">True Source · Site Health Overview</span>
              </div>
              <div className="flex items-center gap-3">
                <Zap size={22} color="#19C853" />
                <div>
                  <div className="text-white font-black text-lg tracking-tight leading-none">
                    POWER SOURCE: ZESCO MAINS
                  </div>
                  <div className="text-[12px] font-bold mt-1" style={{ color: "#19C853" }}>
                    Grid-Stable · 230V AC · Phase Balance: Monitoring · PF 0.98
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-5 flex-wrap">
              {[
                { label: "Facility Load", value: "476 KW", color: "#19C853" },
                { label: "UPS Charge", value: "100%", color: "#19C853" },
                { label: "Active Alerts", value: "4", color: "#FFB020" },
                { label: "Site Uptime", value: "99.97%", color: "#19C853" },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <div className="font-black text-[20px] leading-none" style={{ color: s.color }}>
                    {s.value}
                  </div>
                  <div className="text-[9px] font-black text-gray-500 uppercase tracking-widest mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Three-Column Grid ── */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 p-4 overflow-auto">

          {/* LEFT: Status & Load */}
          <div className="flex flex-col gap-3">
            {/* Load Line Chart */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100" style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.05)" }}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.12em]">Total Facility Load</div>
                  <div className="font-black text-[28px] text-gray-900 leading-none mt-1">
                    476 <span className="text-sm font-semibold text-gray-400">KW</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] font-black text-gray-400 uppercase tracking-wider">24h Trend</div>
                  <div className="flex items-center gap-1 justify-end text-[11px] font-bold mt-0.5" style={{ color: "#19C853" }}>
                    <Activity size={10} /> +2.4%
                  </div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={90}>
                <LineChart data={loadChartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                  <XAxis dataKey="t" tick={{ fontSize: 8, fill: "#bbb" }} tickLine={false} axisLine={false} interval={3} />
                  <YAxis tick={{ fontSize: 8, fill: "#bbb" }} tickLine={false} axisLine={false} domain={[400, 500]} />
                  <RechartsTooltip
                    contentStyle={{ background: "#0C0D0D", border: "none", borderRadius: 10, color: "white", fontSize: 11 }}
                    formatter={(v: number) => [`${v} KW`, "Load"]}
                  />
                  <Line type="monotone" dataKey="kw" stroke="#FF0000" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Battery Runway */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100" style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.05)" }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.12em]">UPS Est. Battery Life</div>
                  <div className="font-black text-[22px] text-gray-900 mt-0.5">Standby</div>
                  <div className="text-[11px] font-bold mt-0.5" style={{ color: "#19C853" }}>Mains Active · On Float</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Battery size={26} color="#19C853" />
                  <div className="text-[9px] font-black text-gray-400 uppercase tracking-wider">100% Charged</div>
                </div>
              </div>
              <div className="mt-3 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: "100%", backgroundColor: "#19C853" }} />
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-[10px] font-semibold text-gray-400">VDC: 215V</span>
                <span className="text-[10px] font-black" style={{ color: "#19C853" }}>FLOAT MODE</span>
              </div>
            </div>

            {/* Phase Readings */}
            <div
              className="bg-white rounded-2xl p-4 border border-gray-100 flex-1"
              style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.05)" }}
            >
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-3">ZESCO Phase Readings</div>
              <div className="grid grid-cols-4 gap-0 mb-1 text-[9px] font-black text-gray-400 uppercase tracking-wider pb-1 border-b border-gray-100">
                <span>Phase</span><span className="text-center">Volts</span><span className="text-center">Amps</span><span className="text-center">OK</span>
              </div>
              {[
                { ph: "L1", v: "233V", a: "98A", ok: true },
                { ph: "L2", v: "231V", a: "83A", ok: false },
                { ph: "L3", v: "229V", a: "112A", ok: false },
              ].map((p) => (
                <div key={p.ph} className="grid grid-cols-4 gap-0 items-center py-2 border-b border-gray-50 last:border-0">
                  <span className="text-[11px] font-black text-gray-500">{p.ph}</span>
                  <span className="text-[12px] font-bold text-gray-800 text-center">{p.v}</span>
                  <span className="text-[12px] font-bold text-gray-800 text-center">{p.a}</span>
                  <div className="flex justify-center">
                    <GlowDot color={p.ok ? "#19C853" : "#FFB020"} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* MIDDLE: Equipment Fleet */}
          <div className="flex flex-col gap-3">
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] px-1">Equipment Fleet Status</div>

            {/* UPS */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100" style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.05)" }}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.12em]">UPS Units</div>
                  <div className="font-black text-[28px] text-gray-900 leading-none mt-1">
                    2 <span className="text-base font-semibold text-gray-300">/ 2</span>
                  </div>
                  <div className="text-[11px] font-bold mt-0.5" style={{ color: "#19C853" }}>● Active</div>
                </div>
                <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#F0FFF4" }}>
                  <Shield size={26} color="#19C853" />
                </div>
              </div>
              {["UPS 1 · Vertiv Liebert EXL S1", "UPS 2 · Vertiv Liebert EXL S1"].map((u, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-t border-gray-50">
                  <span className="text-[11px] font-semibold text-gray-500">{u}</span>
                  <div className="flex items-center gap-1.5">
                    <GlowDot color="#19C853" />
                    <span className="text-[10px] font-black" style={{ color: "#19C853" }}>Online</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Generators */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100" style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.05)" }}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.12em]">Generators</div>
                  <div className="font-black text-[28px] text-gray-900 leading-none mt-1">
                    2 <span className="text-base font-semibold text-gray-300">/ 2</span>
                  </div>
                  <div className="text-[11px] font-bold text-gray-400">● Standby</div>
                </div>
                <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#F5F5F5" }}>
                  <Zap size={26} color="#999" />
                </div>
              </div>
              <div className="py-2 border-t border-gray-50">
                <div className="text-[11px] font-semibold text-gray-400">Last test: 2026-06-18 · 04:00 UTC+2</div>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 mt-1">
                  <Radio size={11} /> Ready · Est. start &lt; 45s
                </div>
              </div>
            </div>

            {/* Rectifiers */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100 flex-1" style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.05)" }}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.12em]">Rectifiers</div>
                  <div className="font-black text-[28px] text-gray-900 leading-none mt-1">
                    4 <span className="text-base font-semibold text-gray-300">/ 4</span>
                  </div>
                  <div className="text-[11px] font-bold mt-0.5" style={{ color: "#19C853" }}>● Online</div>
                </div>
                <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#F0FFF4" }}>
                  <Cpu size={26} color="#19C853" />
                </div>
              </div>
              {[
                { label: "Rm 1 · Rect A", v: "48.1V", a: "32A" },
                { label: "Rm 1 · Rect B", v: "48.0V", a: "28A" },
                { label: "Rm 2 · Rect A", v: "47.8V", a: "35A" },
                { label: "Rm 2 · Rect B", v: "48.2V", a: "30A" },
              ].map((r, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-t border-gray-50 text-[10px]">
                  <span className="font-semibold text-gray-400">{r.label}</span>
                  <span className="font-bold text-gray-700 font-mono">{r.v} · {r.a}</span>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: Environmental & Alerts */}
          <div className="flex flex-col gap-3">
            {/* Thermal Bar Chart */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100" style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.05)" }}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.12em]">Thermal Deltas</div>
                  <div className="text-[11px] font-semibold text-gray-400">Room temps °C</div>
                </div>
                <Thermometer size={16} color="#FFB020" />
              </div>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={thermalData} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
                  <XAxis dataKey="room" tick={{ fontSize: 9, fill: "#bbb" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: "#bbb" }} tickLine={false} axisLine={false} domain={[18, 23]} />
                  <ReferenceLine y={21} stroke="#FFB020" strokeDasharray="3 3" strokeOpacity={0.7} />
                  <RechartsTooltip
                    contentStyle={{ background: "#0C0D0D", border: "none", borderRadius: 10, color: "white", fontSize: 11 }}
                    formatter={(v: number) => [`${v}°C`, "Temp"]}
                  />
                  <Bar dataKey="temp" radius={[4, 4, 0, 0]}>
                    {thermalData.map((entry, index) => (
                      <Cell key={index} fill={entry.temp >= 21 ? "#FFB020" : "#19C853"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-1.5">
                <div className="flex items-center gap-1.5 text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#19C853" }} /> Nominal
                </div>
                <div className="flex items-center gap-1.5 text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#FFB020" }} /> Warning ≥21°C
                </div>
              </div>
            </div>

            {/* Humidity */}
            <div
              className="bg-white rounded-2xl p-4 border border-gray-100 flex items-center gap-4"
              style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.05)" }}
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#FFF8E1" }}>
                <Droplets size={20} color="#FFB020" />
              </div>
              <div>
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.12em]">Humidity · Main Room</div>
                <div className="font-black text-[22px] text-gray-900 leading-none mt-0.5">
                  63 <span className="text-sm font-semibold text-gray-400">%</span>
                </div>
              </div>
              <div className="ml-auto text-right flex-shrink-0">
                <div className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Threshold</div>
                <div className="font-black text-sm" style={{ color: "#FFB020" }}>65%</div>
              </div>
            </div>

            {/* Phase Imbalance Alerts */}
            <div
              className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex-1"
              style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.05)" }}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.12em]">Phase Imbalance Alerts</div>
                <span className="bg-red-50 text-red-600 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide">
                  {phaseAlerts.length} Active
                </span>
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
                {phaseAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex gap-3 px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
                  >
                    <AlertTriangle
                      size={13}
                      className="flex-shrink-0 mt-0.5"
                      color={alert.level === "crit" ? "#D10000" : "#FFB020"}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold text-gray-800 leading-tight">{alert.msg}</div>
                      <div className="text-[9px] font-black text-gray-400 mt-0.5 font-mono">{alert.id} · {alert.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
          <div className="text-[10px] font-semibold text-gray-400 font-mono">NTC ZM-0874 · Last sync: 14:31 UTC+2 · 2026-06-20</div>
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 hover:text-red-500 transition-colors"
          >
            <ArrowLeft size={11} /> Logout
          </button>
        </div>
      </div>
    </div>
  );
}
