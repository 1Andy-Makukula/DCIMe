import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Skeleton } from "@/app/components/ui/skeleton";
import { Zap, Clock, ShieldCheck } from 'lucide-react';
import { useDashboardData } from '../hooks/useDashboardData';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

export function GridAnalytics() {
  const [timePeriod] = useState("Today");
  const { isLoading, gridChartData, heatmapData, kpis } = useDashboardData();

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 bg-slate-50/50 min-h-screen">
        <div className="h-20 w-full bg-white border border-gray-100 rounded-3xl p-5 shadow-sm flex items-center justify-between">
          <div className="space-y-2 w-1/3">
            <Skeleton className="h-3 w-1/3 bg-slate-200" />
            <Skeleton className="h-6 w-2/3 bg-slate-200" />
          </div>
          <Skeleton className="h-10 w-28 bg-slate-200 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="bg-white border-gray-100 rounded-3xl shadow-sm h-32 p-6 flex flex-col justify-between">
              <Skeleton className="h-3 w-1/2 bg-slate-200" />
              <Skeleton className="h-8 w-2/3 bg-slate-200" />
              <Skeleton className="h-3 w-3/4 bg-slate-200" />
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="bg-white border-gray-100 rounded-3xl shadow-sm lg:col-span-2 h-[380px] p-6 flex flex-col justify-between">
            <div className="space-y-2">
              <Skeleton className="h-3 w-24 bg-slate-200" />
              <Skeleton className="h-5 w-48 bg-slate-200" />
            </div>
            <Skeleton className="h-[240px] w-full bg-slate-100 rounded-2xl" />
          </Card>
          <Card className="bg-white border-gray-100 rounded-3xl shadow-sm h-[380px] p-6 flex flex-col justify-between">
            <div className="space-y-2">
              <Skeleton className="h-3 w-24 bg-slate-200" />
              <Skeleton className="h-5 w-48 bg-slate-200" />
            </div>
            <Skeleton className="h-[240px] w-full bg-slate-100 rounded-2xl" />
          </Card>
        </div>
      </div>
    );
  }

  const isOnline = kpis.grid.uptimePercentage !== "0.0";

  return (
    <div className="p-6 space-y-6 bg-slate-50/50 min-h-screen text-slate-800">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-gray-100 rounded-3xl p-5 shadow-sm">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">UTILITY INTEGRITY</span>
          <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight mt-0.5">Grid & Commercial Power</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className={`px-4 py-2 rounded-2xl border flex items-center gap-3 transition-all ${
            isOnline
              ? "bg-emerald-50 border-emerald-100 text-emerald-700"
              : "bg-red-50 border-red-100 text-red-600"
          }`}>
            <div className={`w-2.5 h-2.5 rounded-full ${isOnline ? "bg-emerald-500 animate-ping" : "bg-red-500"}`} />
            <span className="text-xs font-black uppercase tracking-wider">
              ZESCO Grid: {isOnline ? "ONLINE" : "OFFLINE"}
            </span>
          </div>
          <Badge variant="outline" className="bg-slate-50 border-gray-200 text-xs font-black uppercase tracking-wider h-10 px-4 rounded-xl text-slate-900 flex items-center justify-center">
            {timePeriod}
          </Badge>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Uptime */}
        <Card className="bg-white border-gray-100 rounded-3xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">GRID UPTIME PERCENTAGE</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 font-mono">{kpis.grid.uptimePercentage}%</span>
              <span className="text-xs font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">Safe</span>
            </div>
            <p className="text-[10px] text-gray-400 font-semibold mt-1 flex items-center gap-1">
              <ShieldCheck size={11} className="text-emerald-500" /> Active utility feed ratio
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Blackout Duration */}
        <Card className="bg-white border-gray-100 rounded-3xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">TOTAL BLACKOUT DURATION</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 font-mono">{kpis.grid.totalBlackoutDuration}</span>
              <span className="text-xs font-black text-gray-400 uppercase tracking-wider">Hours</span>
            </div>
            <p className="text-[10px] text-gray-400 font-semibold mt-1 flex items-center gap-1">
              <Clock size={11} className="text-red-500" /> Cumulative outage logs
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Peak Load */}
        <Card className="bg-white border-gray-100 rounded-3xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">PEAK SITE LOAD</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 font-mono">{kpis.grid.peakSiteLoad}</span>
              <span className="text-xs font-black text-gray-400 uppercase tracking-wider">kW</span>
            </div>
            <p className="text-[10px] text-gray-400 font-semibold mt-1 flex items-center gap-1">
              <Zap size={11} className="text-amber-500" /> Maximum recorded power draw
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Charts area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Composed Chart */}
        <Card className="bg-white border-gray-100 rounded-3xl shadow-sm lg:col-span-2 overflow-hidden flex flex-col justify-between">
          <CardHeader className="border-b border-gray-50 px-6 py-4">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">VOLTAGE STABILITY & DEMAND</CardDescription>
            <CardTitle className="text-sm font-black text-gray-900 uppercase tracking-tight mt-0.5">3-Phase Voltages vs. Site Load</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={gridChartData} margin={{ top: 10, right: -10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="time" stroke="#94A3B8" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} dy={10} />
                  <YAxis yAxisId="left" stroke="#94A3B8" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} domain={[0, 260]} label={{ value: "Volts (V)", angle: -90, position: "insideLeft", offset: 10, fill: "#94A3B8", fontSize: 9, fontWeight: "black" }} />
                  <YAxis yAxisId="right" orientation="right" stroke="#94A3B8" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} domain={[0, 120]} label={{ value: "Load (kW)", angle: 90, position: "insideRight", offset: 10, fill: "#94A3B8", fontSize: 9, fontWeight: "black" }} />
                  <Tooltip contentStyle={{ background: '#fff', borderRadius: '12px', border: '1px solid #F1F5F9', fontSize: '11px', fontWeight: 'bold' }} />
                  <Legend verticalAlign="top" height={36} iconSize={8} wrapperStyle={{ fontSize: '9px', fontWeight: 'black', textTransform: 'uppercase' }} />
                  <Bar yAxisId="right" dataKey="grid_total_site_load" name="Total Site Load" fill="#E2E8F0" radius={[4, 4, 0, 0]} barSize={25} />
                  <Line yAxisId="left" type="monotone" dataKey="grid_voltage_r" name="Phase R" stroke="#EF4444" strokeWidth={2} dot={{ r: 3 }} />
                  <Line yAxisId="left" type="monotone" dataKey="grid_voltage_y" name="Phase Y" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }} />
                  <Line yAxisId="left" type="monotone" dataKey="grid_voltage_b" name="Phase B" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Heatmap Visualizer */}
        <Card className="bg-white border-gray-100 rounded-3xl shadow-sm overflow-hidden flex flex-col justify-between">
          <CardHeader className="border-b border-gray-50 px-6 py-4">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">OUTAGE HISTORY MAP</CardDescription>
            <CardTitle className="text-sm font-black text-gray-900 uppercase tracking-tight mt-0.5">30-Day Grid Integrity Ledger</CardTitle>
          </CardHeader>
          <CardContent className="p-6 flex flex-col justify-between flex-1">
            <div className="grid grid-cols-6 gap-3">
              {heatmapData.map((d) => {
                let colorClass = "bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100/50";
                let tooltip = `Day ${d.day}: No Outages`;
                if (d.status === 'minor') {
                  colorClass = "bg-amber-50 text-amber-700 border-amber-200/50 hover:bg-amber-100";
                  tooltip = `Day ${d.day}: Minor Outage (${d.hours}h)`;
                } else if (d.status === 'critical') {
                  colorClass = "bg-red-50 text-red-700 border-red-200/50 hover:bg-red-100";
                  tooltip = `Day ${d.day}: Major Blackout (${d.hours}h)`;
                }
                return (
                  <div
                    key={d.day}
                    title={tooltip}
                    className={`flex flex-col items-center justify-center p-2 rounded-xl border text-[10px] font-black font-mono transition-all cursor-help ${colorClass}`}
                  >
                    <span>{d.day}</span>
                    {d.hours > 0 && <span className="text-[8px] font-semibold mt-0.5">{d.hours}h</span>}
                  </div>
                );
              })}
            </div>
            
            {/* Heatmap Legend */}
            <div className="flex items-center justify-between border-t border-slate-50 pt-4 mt-4 text-[9px] font-black uppercase text-gray-400">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-emerald-500 rounded border border-emerald-600/30" />
                <span>ONLINE</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-amber-400 rounded border border-amber-500/30" />
                <span>MINOR</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-red-500 rounded border border-red-600/30" />
                <span>BLACKOUT</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default GridAnalytics;
