import { useOutletContext } from 'react-router';
import { UTILITY_GRID_LABEL } from "@/shared/utils/branding";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Skeleton } from "@/app/components/ui/skeleton";
import { Zap, Clock, ShieldCheck, AlertCircle } from 'lucide-react';
import { useDashboardData } from '../hooks/useDashboardData';
import { AnalyticsOutletContext } from './AnalyticsLayout';
import { DetailLink } from './DetailLink';
import { CategoryFleet } from './CategoryFleet';
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
  const { range } = useOutletContext<AnalyticsOutletContext>();
  const { isLoading, hasNoData, latestGridStatus, gridChartData, heatmapData, kpis } = useDashboardData(range);

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

  const isOnline = latestGridStatus === 'ONLINE' || latestGridStatus === 'ON';

  // Derived from the actual figure, not asserted independently of it — the
  // badge previously read "Safe" beside any uptime number, including a poor one.
  const uptimeNum = parseFloat(kpis.grid.uptimePercentage);
  const uptimeBadge = isNaN(uptimeNum)
    ? { label: "No Data", cls: "text-neutral-400 bg-neutral-50 border-neutral-200" }
    : uptimeNum >= 99
      ? { label: "Safe", cls: "text-ok-600 bg-ok-50 border-ok-100" }
      : uptimeNum >= 95
        ? { label: "Degraded", cls: "text-warn-600 bg-warn-50 border-warn-100" }
        : { label: "At Risk", cls: "text-danger-600 bg-danger-50 border-danger-100" };

  return (
    <div className="p-6 space-y-6 bg-neutral-50/50 min-h-screen text-neutral-800">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-neutral-100 rounded-3xl p-5 shadow-sm">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">UTILITY INTEGRITY</span>
          <h2 className="text-lg font-black text-neutral-900 uppercase tracking-tight mt-0.5">Grid & Commercial Power</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className={`px-4 py-2 rounded-2xl border flex items-center gap-3 transition-all ${
            isOnline
              ? "bg-ok-50 border-ok-100 text-ok-700"
              : "bg-danger-50 border-danger-100 text-danger-600"
          }`}>
            <div className={`w-2.5 h-2.5 rounded-full ${isOnline ? "bg-ok-500 animate-ping" : "bg-danger-500"}`} />
            <span className="text-xs font-black uppercase tracking-wider">
              {UTILITY_GRID_LABEL}: {isOnline ? "ONLINE" : "OFFLINE"}
            </span>
          </div>
          <Badge variant="outline" className="bg-neutral-50 border-neutral-200 text-xs font-black uppercase tracking-wider h-10 px-4 rounded-xl text-neutral-900 flex items-center justify-center">
            {range.label}
          </Badge>
          <DetailLink categoryId="utility" />
        </div>
      </div>

      {hasNoData && (
        <div className="flex items-center gap-3 bg-neutral-50 border border-neutral-200 text-neutral-600 p-4 rounded-3xl text-xs font-semibold">
          <AlertCircle className="w-4.5 h-4.5 text-neutral-400 shrink-0" />
          <span>No readings were recorded for this period. Widen the date range, or check that rounds are being logged.</span>
        </div>
      )}

      {/* The fleet: every machine the registry lists here, not the one or
          two metric keys the tiles below happen to name. */}
      <CategoryFleet categoryId="utility" range={range} />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Uptime */}
        <Card className="bg-white border-neutral-100 rounded-3xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-neutral-400">GRID UPTIME PERCENTAGE</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-neutral-900 font-mono">{kpis.grid.uptimePercentage}%</span>
              <span className={`text-xs font-black px-1.5 py-0.5 rounded border ${uptimeBadge.cls}`}>{uptimeBadge.label}</span>
            </div>
            <p className="text-[10px] text-neutral-400 font-semibold mt-1 flex items-center gap-1">
              <ShieldCheck size={11} className="text-ok-500" /> Active utility feed ratio
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Blackout Duration */}
        <Card className="bg-white border-neutral-100 rounded-3xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-neutral-400">TOTAL BLACKOUT DURATION</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-neutral-900 font-mono">{kpis.grid.totalBlackoutDuration}</span>
              <span className="text-xs font-black text-neutral-400 uppercase tracking-wider">Hours</span>
            </div>
            <p className="text-[10px] text-neutral-400 font-semibold mt-1 flex items-center gap-1">
              <Clock size={11} className="text-danger-500" /> Cumulative outage logs
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Peak Load */}
        <Card className="bg-white border-neutral-100 rounded-3xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-neutral-400">PEAK SITE LOAD</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-neutral-900 font-mono">{kpis.grid.peakSiteLoad}</span>
              <span className="text-xs font-black text-neutral-400 uppercase tracking-wider">kW</span>
            </div>
            <p className="text-[10px] text-neutral-400 font-semibold mt-1 flex items-center gap-1">
              <Zap size={11} className="text-warn-500" /> Maximum recorded power draw
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Charts area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Composed Chart */}
        <Card className="bg-white border-neutral-100 rounded-3xl shadow-sm lg:col-span-2 overflow-hidden flex flex-col justify-between">
          <CardHeader className="border-b border-neutral-50 px-6 py-4">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-neutral-400">VOLTAGE STABILITY & DEMAND</CardDescription>
            <CardTitle className="text-sm font-black text-neutral-900 uppercase tracking-tight mt-0.5">3-Phase Voltages vs. Site Load</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={gridChartData} margin={{ top: 10, right: -10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-neutral-100)" />
                  <XAxis dataKey="time" stroke="var(--color-neutral-400)" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} dy={10} />
                  <YAxis yAxisId="left" stroke="var(--color-neutral-400)" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} domain={[0, 260]} label={{ value: "Volts (V)", angle: -90, position: "insideLeft", offset: 10, fill: "var(--color-neutral-400)", fontSize: 9, fontWeight: "black" }} />
                  <YAxis yAxisId="right" orientation="right" stroke="var(--color-neutral-400)" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} domain={[0, 120]} label={{ value: "Load (kW)", angle: 90, position: "insideRight", offset: 10, fill: "var(--color-neutral-400)", fontSize: 9, fontWeight: "black" }} />
                  <Tooltip contentStyle={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--color-neutral-100)', fontSize: '11px', fontWeight: 'bold' }} />
                  <Legend verticalAlign="top" height={36} iconSize={8} wrapperStyle={{ fontSize: '9px', fontWeight: 'black', textTransform: 'uppercase' }} />
                  <Bar yAxisId="right" dataKey="grid_total_site_load" name="Total Site Load" fill="var(--color-neutral-200)" radius={[4, 4, 0, 0]} barSize={25} />
                  <Line yAxisId="left" type="monotone" dataKey="grid_voltage_r" name="Phase R" stroke="var(--color-danger-500)" strokeWidth={2} dot={{ r: 3 }} />
                  <Line yAxisId="left" type="monotone" dataKey="grid_voltage_y" name="Phase Y" stroke="var(--color-warn-500)" strokeWidth={2} dot={{ r: 3 }} />
                  <Line yAxisId="left" type="monotone" dataKey="grid_voltage_b" name="Phase B" stroke="var(--color-info-500)" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Heatmap Visualizer */}
        <Card className="bg-white border-neutral-100 rounded-3xl shadow-sm overflow-hidden flex flex-col justify-between">
          <CardHeader className="border-b border-neutral-50 px-6 py-4">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-neutral-400">OUTAGE HISTORY MAP</CardDescription>
            <CardTitle className="text-sm font-black text-neutral-900 uppercase tracking-tight mt-0.5">30-Day Grid Integrity Ledger</CardTitle>
          </CardHeader>
          <CardContent className="p-6 flex flex-col justify-between flex-1">
            <div className="grid grid-cols-6 gap-3">
              {heatmapData.map((d) => {
                let colorClass = "bg-ok-50 text-ok-700 border-ok-100 hover:bg-ok-100/50";
                let tooltip = `Day ${d.day}: No Outages`;
                if (d.status === 'minor') {
                  colorClass = "bg-warn-50 text-warn-700 border-warn-200/50 hover:bg-warn-100";
                  tooltip = `Day ${d.day}: Minor Outage (${d.hours}h)`;
                } else if (d.status === 'critical') {
                  colorClass = "bg-danger-50 text-danger-700 border-danger-200/50 hover:bg-danger-100";
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
            <div className="flex items-center justify-between border-t border-neutral-50 pt-4 mt-4 text-[9px] font-black uppercase text-neutral-400">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-ok-500 rounded border border-ok-600/30" />
                <span>ONLINE</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-warn-400 rounded border border-warn-500/30" />
                <span>MINOR</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-danger-500 rounded border border-danger-600/30" />
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
