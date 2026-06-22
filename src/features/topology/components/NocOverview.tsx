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
  Battery,
  Thermometer,
  AlertTriangle,
  Activity,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { GlowDot } from "@/shared/ui";
import {
  loadChartData,
  thermalData,
  phaseAlerts,
} from "@/shared/utils/mockData";

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
  const currentLoad = loadChartData[loadChartData.length - 1].kw;

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
                <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-3 py-1.5">
                  <GlowDot color="#19C853" />
                  <span className="text-[13px] font-black text-green-700 tracking-tight">
                    Mains Active
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-gray-400">
                  ZESCO Grid · 230 V AC · PF 0.98
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
                <span>+2.4% 24h</span>
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
                  domain={[400, 500]}
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
              { label: "UPS Charge", value: "100%", color: "#19C853" },
              { label: "Site Uptime", value: "99.97%", color: "#19C853" },
              { label: "Phase Balance", value: "Monitoring", color: "#FFB020" },
              { label: "DC Bus", value: "48.1 V", color: "#19C853" },
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
          <SectionLabel>Asset Tally</SectionLabel>

          {/* UPS card */}
          <Card className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-green-50">
              <Zap size={22} color="#19C853" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.12em]">
                UPS Units
              </div>
              <div className="font-black text-[24px] text-gray-900 leading-none mt-0.5">
                2
                <span className="text-sm font-semibold text-gray-300">/ 2</span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <GlowDot color="#19C853" />
                <span className="text-[11px] font-bold text-green-600">
                  Active
                </span>
              </div>
            </div>
            <CheckCircle2 size={20} className="text-green-400 flex-shrink-0" />
          </Card>

          {/* Generators card */}
          <Card className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-gray-100">
              <Battery size={22} color="#999" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.12em]">
                Generators
              </div>
              <div className="font-black text-[24px] text-gray-900 leading-none mt-0.5">
                2
                <span className="text-sm font-semibold text-gray-300">/ 2</span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-2.5 h-2.5 rounded-full bg-gray-400 flex-shrink-0" />
                <span className="text-[11px] font-bold text-gray-400">
                  Standby
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 text-gray-400 flex-shrink-0">
              <Clock size={13} />
              <span className="text-[10px] font-semibold">&lt;45s</span>
            </div>
          </Card>

          {/* Cooling units card */}
          <Card className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-blue-50">
              <Thermometer size={22} color="#3B82F6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.12em]">
                Cooling Units
              </div>
              <div className="font-black text-[24px] text-gray-900 leading-none mt-0.5">
                4
                <span className="text-sm font-semibold text-gray-300">/ 4</span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <GlowDot color="#19C853" />
                <span className="text-[11px] font-bold text-green-600">
                  Active
                </span>
              </div>
            </div>
            <CheckCircle2 size={20} className="text-green-400 flex-shrink-0" />
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
      </div>
    </div>
  );
}
