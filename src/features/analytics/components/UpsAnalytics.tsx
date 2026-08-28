import { useOutletContext } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Skeleton } from "@/app/components/ui/skeleton";
import { Cpu, Activity, BatteryCharging, ShieldCheck, AlertCircle } from 'lucide-react';
import { useDashboardData } from '../hooks/useDashboardData';
import { AnalyticsOutletContext } from './AnalyticsLayout';
import { DetailLink } from './DetailLink';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine
} from 'recharts';

export function UpsAnalytics() {
  const { range } = useOutletContext<AnalyticsOutletContext>();
  const { isLoading, hasNoData, upsChartData, phaseDistributionData, kpis } = useDashboardData(range);

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

  // No fabricated fallback amps — an absent UPS reading must read as
  // "no data," not as a specific, wrong phase distribution.
  const ups1 = phaseDistributionData[0] || { Phase_A: null, Phase_B: null, Phase_C: null };
  const ups2 = phaseDistributionData[1] || { Phase_A: null, Phase_B: null, Phase_C: null };

  // Returns null (rather than a misleading number) when any phase current
  // is missing — an unbalance figure computed from a partial reading isn't
  // a real answer, it's a guess dressed as one.
  const calcUnbalance = (u: { Phase_A: number | null; Phase_B: number | null; Phase_C: number | null }): number | null => {
    if (u.Phase_A === null || u.Phase_B === null || u.Phase_C === null) return null;
    const max = Math.max(u.Phase_A, u.Phase_B, u.Phase_C);
    const min = Math.min(u.Phase_A, u.Phase_B, u.Phase_C);
    const avg = (u.Phase_A + u.Phase_B + u.Phase_C) / 3;
    return avg > 0 ? ((max - min) / avg) * 100 : 0;
  };

  const unbalance1 = calcUnbalance(ups1);
  const unbalance2 = calcUnbalance(ups2);
  const validUnbalances = [unbalance1, unbalance2].filter((v): v is number => v !== null);
  const maxUnbalance = validUnbalances.length > 0 ? Math.max(...validUnbalances) : null;
  const isBalanced = maxUnbalance !== null && maxUnbalance < 3.0;

  // Both badges below used to assert a verdict unconditionally, regardless of
  // the number displayed beside them. ⚠ SITE ENGINEERS: placeholder
  // thresholds — replace with real UPS/battery vendor specs once available.
  const capacityBadge =
    kpis.ups.maxCapacityPct === null
      ? { label: "No Data", cls: "text-neutral-400 bg-neutral-50 border-neutral-200" }
      : kpis.ups.maxCapacityPct < 80
        ? { label: "Safe Range", cls: "text-ok-600 bg-ok-50 border-ok-100" }
        : kpis.ups.maxCapacityPct < 90
          ? { label: "Elevated", cls: "text-warn-600 bg-warn-50 border-warn-100" }
          : { label: "Critical", cls: "text-danger-600 bg-danger-50 border-danger-100" };

  const batteryBadge =
    kpis.ups.avgBatteryCharge === null
      ? { label: "No Data", cls: "text-neutral-400" }
      : kpis.ups.avgBatteryCharge >= 95
        ? { label: "Nominal", cls: "text-neutral-400" }
        : kpis.ups.avgBatteryCharge >= 85
          ? { label: "Charging", cls: "text-warn-600" }
          : { label: "Low", cls: "text-danger-600" };

  return (
    <div className="p-6 space-y-6 bg-neutral-50/50 min-h-screen text-neutral-800">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-neutral-100 rounded-3xl p-5 shadow-sm">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">CRITICAL BACKUP</span>
          <h2 className="text-lg font-black text-neutral-900 uppercase tracking-tight mt-0.5">UPS & DC Rectifiers</h2>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="bg-neutral-50 border-neutral-200 text-xs font-black uppercase tracking-wider h-10 px-4 rounded-xl text-neutral-900 flex items-center justify-center">
            {range.label}
          </Badge>
          <DetailLink categoryId="rectifier" label="Rectifiers" variant="quiet" />
          <DetailLink categoryId="ups" label="UPS detail" />
        </div>
      </div>

      {hasNoData && (
        <div className="flex items-center gap-3 bg-neutral-50 border border-neutral-200 text-neutral-600 p-4 rounded-3xl text-xs font-semibold">
          <AlertCircle className="w-4.5 h-4.5 text-neutral-400 shrink-0" />
          <span>No readings were recorded for this period. Widen the date range, or check that rounds are being logged.</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* KPI 1: Max Used Capacity */}
        <Card className="bg-white border-neutral-100 rounded-3xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-neutral-400">MAX USED CAPACITY</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-neutral-900 font-mono">{kpis.ups.maxCapacityPct ?? "—"}{kpis.ups.maxCapacityPct !== null && "%"}</span>
              <span className={`text-xs font-black px-1.5 py-0.5 rounded border ${capacityBadge.cls}`}>{capacityBadge.label}</span>
            </div>
            <p className="text-[10px] text-neutral-400 font-semibold mt-1 flex items-center gap-1">
              <Activity size={11} className="text-ok-500" /> Peak operational headroom remaining
            </p>
          </CardContent>
        </Card>

        {/* KPI 2: Battery Charge */}
        <Card className="bg-white border-neutral-100 rounded-3xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-neutral-400">AVERAGE BATTERY CHARGE</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-neutral-900 font-mono">{kpis.ups.avgBatteryCharge ?? "—"}{kpis.ups.avgBatteryCharge !== null && "%"}</span>
              <span className={`text-xs font-black uppercase tracking-wider ${batteryBadge.cls}`}>{batteryBadge.label}</span>
            </div>
            <p className="text-[10px] text-neutral-400 font-semibold mt-1 flex items-center gap-1">
              <BatteryCharging size={11} className="text-ok-500 animate-pulse" /> Constant float charge active
            </p>
          </CardContent>
        </Card>

        {/* KPI 3: Rectifier Voltage */}
        <Card className="bg-white border-neutral-100 rounded-3xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-neutral-400">RECTIFIER DC VOLTAGE</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-neutral-900 font-mono">{kpis.ups.rectifierVoltage ?? "—"}</span>
              <span className="text-xs font-black text-neutral-400 uppercase tracking-wider">V DC</span>
            </div>
            <p className="text-[10px] text-neutral-400 font-semibold mt-1 flex items-center gap-1">
              <Cpu size={11} className="text-info-500" /> Telecom bus voltage nominal
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stacked Area Chart */}
        <Card className="bg-white border-neutral-100 rounded-3xl shadow-sm lg:col-span-2 overflow-hidden flex flex-col justify-between">
          <CardHeader className="border-b border-neutral-50 px-6 py-4">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-neutral-400">LOAD DISTRIBUTION OVER TIME</CardDescription>
            <CardTitle className="text-sm font-black text-neutral-900 uppercase tracking-tight mt-0.5">UPS-1 & UPS-2 Stacked Area Load vs. Capacity Limit</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={upsChartData} margin={{ top: 10, right: -10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-neutral-100)" />
                  <XAxis dataKey="time" stroke="var(--color-neutral-400)" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} dy={10} />
                  <YAxis stroke="var(--color-neutral-400)" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} domain={[0, 140]} label={{ value: "Load (kW)", angle: -90, position: "insideLeft", offset: 10, fill: "var(--color-neutral-400)", fontSize: 9, fontWeight: "black" }} />
                  <Tooltip contentStyle={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--color-neutral-100)', fontSize: '11px', fontWeight: 'bold' }} />
                  <Legend verticalAlign="top" height={36} iconSize={8} wrapperStyle={{ fontSize: '9px', fontWeight: 'black', textTransform: 'uppercase' }} />
                  <ReferenceLine y={120} stroke="var(--color-danger-500)" strokeDasharray="3 3" label={{ value: "120kW CAPACITY LIMIT", fill: "var(--color-danger-500)", fontSize: 9, fontWeight: "black", position: "top" }} />
                  <Area type="monotone" dataKey="ups1_load" name="UPS 1" stackId="1" stroke="var(--color-info-500)" fill="var(--color-info-200)" fillOpacity={0.4} />
                  <Area type="monotone" dataKey="ups2_load" name="UPS 2" stackId="1" stroke="var(--color-ok-500)" fill="var(--color-ok-200)" fillOpacity={0.4} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Phase Load Distribution BarChart */}
        <Card className="bg-white border-neutral-100 rounded-3xl shadow-sm overflow-hidden flex flex-col justify-between">
          <CardHeader className="border-b border-neutral-50 px-6 py-4">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-neutral-400">PHASE LOAD BALANCING</CardDescription>
            <CardTitle className="text-sm font-black text-neutral-900 uppercase tracking-tight mt-0.5">Phase Current Comparison (Amps)</CardTitle>
          </CardHeader>
          <CardContent className="p-6 flex flex-col justify-between flex-1">
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={phaseDistributionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-neutral-100)" />
                  <XAxis dataKey="name" stroke="var(--color-neutral-400)" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} dy={10} />
                  <YAxis stroke="var(--color-neutral-400)" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} domain={[0, 200]} />
                  <Tooltip contentStyle={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--color-neutral-100)', fontSize: '11px', fontWeight: 'bold' }} />
                  <Legend verticalAlign="top" height={36} iconSize={8} wrapperStyle={{ fontSize: '9px', fontWeight: 'black', textTransform: 'uppercase' }} />
                  <Bar dataKey="Phase_A" name="Phase A" fill="var(--color-danger-500)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Phase_B" name="Phase B" fill="var(--color-warn-500)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Phase_C" name="Phase C" fill="var(--color-info-500)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Check info */}
            <div className={`flex items-center gap-1.5 text-[9px] font-black px-2.5 py-2 rounded-2xl border mt-4 justify-center ${
              maxUnbalance === null
                ? "text-neutral-500 bg-neutral-50 border-neutral-200"
                : isBalanced
                  ? "text-ok-700 bg-ok-50 border-ok-100"
                  : "text-warn-700 bg-warn-50 border-warn-100"
            }`}>
              {maxUnbalance === null ? (
                <>
                  <AlertCircle className="w-4 h-4 shrink-0 text-neutral-400" />
                  <span>Insufficient phase current data to assess balance.</span>
                </>
              ) : isBalanced ? (
                <>
                  <ShieldCheck className="w-4 h-4 shrink-0 text-ok-600" />
                  <span>Phases are optimally balanced (Unbalance &lt; 3.0%).</span>
                </>
              ) : (
                <>
                  <Activity className="w-4 h-4 shrink-0 animate-pulse text-warn-600" />
                  <span>Phase unbalance warning (Unbalance of {maxUnbalance.toFixed(1)}% detected).</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default UpsAnalytics;
