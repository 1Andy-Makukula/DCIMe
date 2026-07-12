import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Skeleton } from "@/app/components/ui/skeleton";
import { Thermometer, Droplets, Fan, ShieldCheck, AlertCircle } from 'lucide-react';
import { useDashboardData } from '../hooks/useDashboardData';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

export function ThermalAnalytics() {
  const [timePeriod] = useState("Today");
  const { isLoading, isUsingMockData, thermalChartData, zoneData, kpis } = useDashboardData();

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

  return (
    <div className="p-6 space-y-6 bg-slate-50/50 min-h-screen text-slate-800">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-gray-100 rounded-3xl p-5 shadow-sm">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">ENVIRONMENTAL CONTROL</span>
          <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight mt-0.5">Thermal & HVAC</h2>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="bg-slate-50 border-gray-200 text-xs font-black uppercase tracking-wider h-10 px-4 rounded-xl text-slate-900 flex items-center justify-center">
            {timePeriod}
          </Badge>
        </div>
      </div>

      {isUsingMockData && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-100/60 text-amber-800 p-4 rounded-3xl text-xs font-semibold">
          <AlertCircle className="w-4.5 h-4.5 text-amber-600 shrink-0" />
          <span>Operational Notice: Telemetry database table contains no records. Displaying baseline simulated data for dashboard verification.</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* KPI 1: Peak Temperature */}
        <Card className="bg-white border-gray-100 rounded-3xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">PEAK SERVER ROOM TEMP</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 font-mono">{kpis.thermal.peakTemp}</span>
              <span className="text-xs font-black text-gray-400 uppercase tracking-wider">°C</span>
            </div>
            <p className="text-[10px] text-gray-400 font-semibold mt-1 flex items-center gap-1">
              <Thermometer size={11} className="text-emerald-500" /> Server ambient temperature sensors
            </p>
          </CardContent>
        </Card>

        {/* KPI 2: Average Humidity */}
        <Card className="bg-white border-gray-100 rounded-3xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">AVERAGE HUMIDITY</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 font-mono">{kpis.thermal.avgHumidity}%</span>
              <span className="text-xs font-black text-slate-900 bg-slate-50 border border-slate-200/50 px-1.5 py-0.5 rounded">Nominal</span>
            </div>
            <p className="text-[10px] text-gray-400 font-semibold mt-1 flex items-center gap-1">
              <Droplets size={11} className="text-blue-500" /> Relative humidity average
            </p>
          </CardContent>
        </Card>

        {/* KPI 3: PAC Abnormalities */}
        <Card className="bg-white border-gray-100 rounded-3xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">PAC ABNORMALITIES</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 font-mono">{kpis.thermal.abnormalitiesCount}</span>
              <span className="text-xs font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">All Clear</span>
            </div>
            <p className="text-[10px] text-gray-400 font-semibold mt-1 flex items-center gap-1">
              <Fan size={11} className="text-emerald-500 animate-spin" style={{ animationDuration: '3s' }} /> Active AC warning alerts
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Line Chart */}
        <Card className="bg-white border-gray-100 rounded-3xl shadow-sm lg:col-span-2 overflow-hidden flex flex-col justify-between">
          <CardHeader className="border-b border-gray-50 px-6 py-4">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">TEMPERATURE GRADIENTS</CardDescription>
            <CardTitle className="text-sm font-black text-gray-900 uppercase tracking-tight mt-0.5">Server Ambient vs. PAC Return/Supply Temperatures</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={thermalChartData} margin={{ top: 10, right: -10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="time" stroke="#94A3B8" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} dy={10} />
                  <YAxis yAxisId="left" stroke="#94A3B8" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} domain={[15, 30]} label={{ value: "Temp (°C)", angle: -90, position: "insideLeft", offset: 10, fill: "#94A3B8", fontSize: 9, fontWeight: "black" }} />
                  <YAxis yAxisId="right" orientation="right" stroke="#94A3B8" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} domain={[15, 25]} label={{ value: "Supply Set (°C)", angle: 90, position: "insideRight", offset: 10, fill: "#94A3B8", fontSize: 9, fontWeight: "black" }} />
                  <Tooltip contentStyle={{ background: '#fff', borderRadius: '12px', border: '1px solid #F1F5F9', fontSize: '11px', fontWeight: 'bold' }} />
                  <Legend verticalAlign="top" height={36} iconSize={8} wrapperStyle={{ fontSize: '9px', fontWeight: 'black', textTransform: 'uppercase' }} />
                  <Line yAxisId="left" type="monotone" dataKey="server_ambient_temp" name="Room Ambient" stroke="#EF4444" strokeWidth={2} dot={{ r: 4 }} />
                  <Line yAxisId="left" type="monotone" dataKey="return_temp_actual" name="PAC Return Actual" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }} />
                  <Line yAxisId="right" type="monotone" dataKey="supply_temp_set" name="PAC Supply Set" stroke="#3B82F6" strokeWidth={1.5} strokeDasharray="4 4" dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Zone Heatmap Visualizer */}
        <Card className="bg-white border-gray-100 rounded-3xl shadow-sm overflow-hidden flex flex-col justify-between">
          <CardHeader className="border-b border-gray-50 px-6 py-4">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">THERMAL ZONE HEATMAP</CardDescription>
            <CardTitle className="text-sm font-black text-gray-900 uppercase tracking-tight mt-0.5">Facility Room Temperatures</CardTitle>
          </CardHeader>
          <CardContent className="p-6 flex flex-col justify-between flex-1">
            <div className="space-y-3.5">
              {zoneData.map((zone, idx) => {
                let badgeColor = "bg-emerald-50 text-emerald-700 border-emerald-100";
                let barColor = "bg-emerald-500 shadow-emerald-500/10";
                if (zone.status === 'Moderate') {
                  badgeColor = "bg-amber-50 text-amber-700 border-amber-100";
                  barColor = "bg-amber-400 shadow-amber-400/10";
                } else if (zone.status === 'Warm') {
                  badgeColor = "bg-rose-50 text-rose-700 border-rose-100";
                  barColor = "bg-rose-500 shadow-rose-500/10";
                }

                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-700">{zone.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-900 font-bold">{zone.temp} °C</span>
                        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border ${badgeColor}`}>
                          {zone.status}
                        </span>
                      </div>
                    </div>
                    {/* Visual bar width represents temperature above 15°C */}
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div 
                        style={{ width: `${Math.max(10, Math.min(100, ((zone.temp - 15) / 15) * 100))}%` }} 
                        className={`${barColor} h-full rounded-full transition-all duration-500 shadow-sm`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Verification notice */}
            <div className="flex items-center gap-1.5 text-[9px] font-black text-emerald-700 bg-emerald-50 px-2.5 py-2 rounded-2xl border border-emerald-100 mt-4 justify-center">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>All monitored zones are within threshold parameters.</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default ThermalAnalytics;
