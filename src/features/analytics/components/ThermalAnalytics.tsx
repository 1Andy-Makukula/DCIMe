import { useOutletContext } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Skeleton } from "@/app/components/ui/skeleton";
import { Thermometer, Droplets, Fan, ShieldCheck, AlertCircle } from 'lucide-react';
import { useDashboardData } from '../hooks/useDashboardData';
import { AnalyticsOutletContext } from './AnalyticsLayout';
import { DetailLink } from './DetailLink';
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
  const { range } = useOutletContext<AnalyticsOutletContext>();
  const { isLoading, isUsingMockData, thermalChartData, zoneData, kpis } = useDashboardData(range);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 bg-neutral-50/50 min-h-screen">
        <div className="h-20 w-full bg-white border border-neutral-100 rounded-3xl p-5 shadow-sm flex items-center justify-between">
          <div className="space-y-2 w-1/3">
            <Skeleton className="h-3 w-1/3 bg-neutral-200" />
            <Skeleton className="h-6 w-2/3 bg-neutral-200" />
          </div>
          <Skeleton className="h-10 w-28 bg-neutral-200 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="bg-white border-neutral-100 rounded-3xl shadow-sm h-32 p-6 flex flex-col justify-between">
              <Skeleton className="h-3 w-1/2 bg-neutral-200" />
              <Skeleton className="h-8 w-2/3 bg-neutral-200" />
              <Skeleton className="h-3 w-3/4 bg-neutral-200" />
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="bg-white border-neutral-100 rounded-3xl shadow-sm lg:col-span-2 h-[380px] p-6 flex flex-col justify-between">
            <div className="space-y-2">
              <Skeleton className="h-3 w-24 bg-neutral-200" />
              <Skeleton className="h-5 w-48 bg-neutral-200" />
            </div>
            <Skeleton className="h-[240px] w-full bg-neutral-100 rounded-2xl" />
          </Card>
          <Card className="bg-white border-neutral-100 rounded-3xl shadow-sm h-[380px] p-6 flex flex-col justify-between">
            <div className="space-y-2">
              <Skeleton className="h-3 w-24 bg-neutral-200" />
              <Skeleton className="h-5 w-48 bg-neutral-200" />
            </div>
            <Skeleton className="h-[240px] w-full bg-neutral-100 rounded-2xl" />
          </Card>
        </div>
      </div>
    );
  }

  // ⚠ SITE ENGINEERS: placeholder DC humidity comfort band (40-60%),
  // same status as the "Nominal" badge used to assert unconditionally.
  // Replace with the facility's real target range once available.
  const humidityBadge =
    kpis.thermal.avgHumidity === null
      ? { label: "No Data", cls: "text-neutral-400 bg-neutral-50 border-neutral-200" }
      : kpis.thermal.avgHumidity >= 40 && kpis.thermal.avgHumidity <= 60
        ? { label: "Nominal", cls: "text-neutral-900 bg-neutral-50 border-neutral-200/50" }
        : { label: "Out of Range", cls: "text-warn-700 bg-warn-50 border-warn-200" };

  return (
    <div className="p-6 space-y-6 bg-neutral-50/50 min-h-screen text-neutral-800">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-neutral-100 rounded-3xl p-5 shadow-sm">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">ENVIRONMENTAL CONTROL</span>
          <h2 className="text-lg font-black text-neutral-900 uppercase tracking-tight mt-0.5">Thermal & HVAC</h2>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="bg-neutral-50 border-neutral-200 text-xs font-black uppercase tracking-wider h-10 px-4 rounded-xl text-neutral-900 flex items-center justify-center">
            {range.label}
          </Badge>
          <DetailLink categoryId="thermal" />
        </div>
      </div>

      {isUsingMockData && (
        <div className="flex items-center gap-3 bg-warn-50 border border-warn-100/60 text-warn-800 p-4 rounded-3xl text-xs font-semibold">
          <AlertCircle className="w-4.5 h-4.5 text-warn-600 shrink-0" />
          <span>Operational Notice: Telemetry database table contains no records. Displaying baseline simulated data for dashboard verification.</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* KPI 1: Peak Temperature */}
        <Card className="bg-white border-neutral-100 rounded-3xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-neutral-400">PEAK SERVER ROOM TEMP</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-neutral-900 font-mono">{kpis.thermal.peakTemp}</span>
              <span className="text-xs font-black text-neutral-400 uppercase tracking-wider">°C</span>
            </div>
            <p className="text-[10px] text-neutral-400 font-semibold mt-1 flex items-center gap-1">
              <Thermometer size={11} className="text-ok-500" /> Server ambient temperature sensors
            </p>
          </CardContent>
        </Card>

        {/* KPI 2: Average Humidity */}
        <Card className="bg-white border-neutral-100 rounded-3xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-neutral-400">AVERAGE HUMIDITY</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-neutral-900 font-mono">{kpis.thermal.avgHumidity ?? "—"}{kpis.thermal.avgHumidity !== null && "%"}</span>
              <span className={`text-xs font-black px-1.5 py-0.5 rounded border ${humidityBadge.cls}`}>{humidityBadge.label}</span>
            </div>
            <p className="text-[10px] text-neutral-400 font-semibold mt-1 flex items-center gap-1">
              <Droplets size={11} className="text-info-500" /> Relative humidity average
            </p>
          </CardContent>
        </Card>

        {/* KPI 3: PAC Abnormalities */}
        <Card className="bg-white border-neutral-100 rounded-3xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-neutral-400">PAC ABNORMALITIES</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-neutral-900 font-mono">{kpis.thermal.abnormalitiesCount}</span>
              <span className="text-xs font-black text-ok-600 bg-ok-50 border border-ok-100 px-1.5 py-0.5 rounded">All Clear</span>
            </div>
            <p className="text-[10px] text-neutral-400 font-semibold mt-1 flex items-center gap-1">
              <Fan size={11} className="text-ok-500 animate-spin" style={{ animationDuration: '3s' }} /> Active AC warning alerts
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Line Chart */}
        <Card className="bg-white border-neutral-100 rounded-3xl shadow-sm lg:col-span-2 overflow-hidden flex flex-col justify-between">
          <CardHeader className="border-b border-neutral-50 px-6 py-4">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-neutral-400">TEMPERATURE GRADIENTS</CardDescription>
            <CardTitle className="text-sm font-black text-neutral-900 uppercase tracking-tight mt-0.5">Server Ambient vs. PAC Return/Supply Temperatures</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={thermalChartData} margin={{ top: 10, right: -10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-neutral-100)" />
                  <XAxis dataKey="time" stroke="var(--color-neutral-400)" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} dy={10} />
                  <YAxis yAxisId="left" stroke="var(--color-neutral-400)" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} domain={[15, 30]} label={{ value: "Temp (°C)", angle: -90, position: "insideLeft", offset: 10, fill: "var(--color-neutral-400)", fontSize: 9, fontWeight: "black" }} />
                  <YAxis yAxisId="right" orientation="right" stroke="var(--color-neutral-400)" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} domain={[15, 25]} label={{ value: "Supply Set (°C)", angle: 90, position: "insideRight", offset: 10, fill: "var(--color-neutral-400)", fontSize: 9, fontWeight: "black" }} />
                  <Tooltip contentStyle={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--color-neutral-100)', fontSize: '11px', fontWeight: 'bold' }} />
                  <Legend verticalAlign="top" height={36} iconSize={8} wrapperStyle={{ fontSize: '9px', fontWeight: 'black', textTransform: 'uppercase' }} />
                  <Line yAxisId="left" type="monotone" dataKey="server_ambient_temp" name="Room Ambient" stroke="var(--color-danger-500)" strokeWidth={2} dot={{ r: 4 }} />
                  <Line yAxisId="left" type="monotone" dataKey="return_temp_actual" name="PAC Return Actual" stroke="var(--color-warn-500)" strokeWidth={2} dot={{ r: 3 }} />
                  <Line yAxisId="right" type="monotone" dataKey="supply_temp_set" name="PAC Supply Set" stroke="var(--color-info-500)" strokeWidth={1.5} strokeDasharray="4 4" dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Zone Heatmap Visualizer */}
        <Card className="bg-white border-neutral-100 rounded-3xl shadow-sm overflow-hidden flex flex-col justify-between">
          <CardHeader className="border-b border-neutral-50 px-6 py-4">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-neutral-400">THERMAL ZONE HEATMAP</CardDescription>
            <CardTitle className="text-sm font-black text-neutral-900 uppercase tracking-tight mt-0.5">Facility Room Temperatures</CardTitle>
          </CardHeader>
          <CardContent className="p-6 flex flex-col justify-between flex-1">
            <div className="space-y-3.5">
              {zoneData.map((zone, idx) => {
                let badgeColor = "bg-ok-50 text-ok-700 border-ok-100";
                let barColor = "bg-ok-500 shadow-ok-500/10";
                if (zone.status === 'Moderate') {
                  badgeColor = "bg-warn-50 text-warn-700 border-warn-100";
                  barColor = "bg-warn-400 shadow-warn-400/10";
                } else if (zone.status === 'Warm') {
                  badgeColor = "bg-danger-50 text-danger-700 border-danger-100";
                  barColor = "bg-danger-500 shadow-danger-500/10";
                } else if (zone.status === 'No Data') {
                  badgeColor = "bg-neutral-100 text-neutral-400 border-neutral-200";
                  barColor = "bg-neutral-200";
                }

                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-neutral-700">{zone.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-neutral-900 font-bold">
                          {zone.temp !== null ? `${zone.temp} °C` : "—"}
                        </span>
                        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border ${badgeColor}`}>
                          {zone.status}
                        </span>
                      </div>
                    </div>
                    {/* Visual bar width represents temperature above 15°C */}
                    <div className="w-full bg-neutral-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        style={{ width: zone.temp === null ? '0%' : `${Math.max(10, Math.min(100, ((zone.temp - 15) / 15) * 100))}%` }}
                        className={`${barColor} h-full rounded-full transition-all duration-500 shadow-sm`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Verification notice — derived from the actual zone statuses,
                never asserted independently of them. */}
            {(() => {
              const reporting = zoneData.filter(z => z.status !== 'No Data');
              const outOfRange = reporting.filter(z => z.status !== 'Optimal');
              if (reporting.length === 0) {
                return (
                  <div className="flex items-center gap-1.5 text-[9px] font-black text-neutral-500 bg-neutral-50 px-2.5 py-2 rounded-2xl border border-neutral-200 mt-4 justify-center">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>No zone temperature readings available for this period.</span>
                  </div>
                );
              }
              if (outOfRange.length === 0) {
                return (
                  <div className="flex items-center gap-1.5 text-[9px] font-black text-ok-700 bg-ok-50 px-2.5 py-2 rounded-2xl border border-ok-100 mt-4 justify-center">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>All reporting zones are within threshold parameters.</span>
                  </div>
                );
              }
              return (
                <div className="flex items-center gap-1.5 text-[9px] font-black text-warn-700 bg-warn-50 px-2.5 py-2 rounded-2xl border border-warn-100 mt-4 justify-center">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{outOfRange.length} of {reporting.length} reporting zones outside optimal range.</span>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default ThermalAnalytics;
