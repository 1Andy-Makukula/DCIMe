import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Skeleton } from "@/app/components/ui/skeleton";
import { Cpu, Activity, BatteryCharging, ShieldCheck, AlertCircle } from 'lucide-react';
import { useDashboardData } from '../hooks/useDashboardData';
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
  const [timePeriod] = useState("Today");
  const { isLoading, isUsingMockData, upsChartData, phaseDistributionData, kpis } = useDashboardData();

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

  // Calculate unbalance for both UPS units and find the maximum unbalance
  const ups1 = phaseDistributionData[0] || { Phase_A: 152, Phase_B: 148, Phase_C: 150 };
  const ups2 = phaseDistributionData[1] || { Phase_A: 168, Phase_B: 162, Phase_C: 165 };

  const calcUnbalance = (u: any) => {
    const max = Math.max(u.Phase_A, u.Phase_B, u.Phase_C);
    const min = Math.min(u.Phase_A, u.Phase_B, u.Phase_C);
    const avg = (u.Phase_A + u.Phase_B + u.Phase_C) / 3;
    return avg > 0 ? ((max - min) / avg) * 100 : 0;
  };

  const unbalance1 = calcUnbalance(ups1);
  const unbalance2 = calcUnbalance(ups2);
  const maxUnbalance = Math.max(unbalance1, unbalance2);
  const isBalanced = maxUnbalance < 3.0;

  return (
    <div className="p-6 space-y-6 bg-slate-50/50 min-h-screen text-slate-800">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-gray-100 rounded-3xl p-5 shadow-sm">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">CRITICAL BACKUP</span>
          <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight mt-0.5">UPS & DC Rectifiers</h2>
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
        {/* KPI 1: Max Used Capacity */}
        <Card className="bg-white border-gray-100 rounded-3xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">MAX USED CAPACITY</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 font-mono">{kpis.ups.maxCapacityPct}%</span>
              <span className="text-xs font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">Safe Range</span>
            </div>
            <p className="text-[10px] text-gray-400 font-semibold mt-1 flex items-center gap-1">
              <Activity size={11} className="text-emerald-500" /> Peak operational headroom remaining
            </p>
          </CardContent>
        </Card>

        {/* KPI 2: Battery Charge */}
        <Card className="bg-white border-gray-100 rounded-3xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">AVERAGE BATTERY CHARGE</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 font-mono">{kpis.ups.avgBatteryCharge}%</span>
              <span className="text-xs font-black text-gray-400 uppercase tracking-wider">Nominal</span>
            </div>
            <p className="text-[10px] text-gray-400 font-semibold mt-1 flex items-center gap-1">
              <BatteryCharging size={11} className="text-emerald-500 animate-pulse" /> Constant float charge active
            </p>
          </CardContent>
        </Card>

        {/* KPI 3: Rectifier Voltage */}
        <Card className="bg-white border-gray-100 rounded-3xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">RECTIFIER DC VOLTAGE</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 font-mono">{kpis.ups.rectifierVoltage}</span>
              <span className="text-xs font-black text-gray-400 uppercase tracking-wider">V DC</span>
            </div>
            <p className="text-[10px] text-gray-400 font-semibold mt-1 flex items-center gap-1">
              <Cpu size={11} className="text-blue-500" /> Telecom bus voltage nominal
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stacked Area Chart */}
        <Card className="bg-white border-gray-100 rounded-3xl shadow-sm lg:col-span-2 overflow-hidden flex flex-col justify-between">
          <CardHeader className="border-b border-gray-50 px-6 py-4">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">LOAD DISTRIBUTION OVER TIME</CardDescription>
            <CardTitle className="text-sm font-black text-gray-900 uppercase tracking-tight mt-0.5">UPS-1 & UPS-2 Stacked Area Load vs. Capacity Limit</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={upsChartData} margin={{ top: 10, right: -10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="time" stroke="#94A3B8" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} dy={10} />
                  <YAxis stroke="#94A3B8" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} domain={[0, 140]} label={{ value: "Load (kW)", angle: -90, position: "insideLeft", offset: 10, fill: "#94A3B8", fontSize: 9, fontWeight: "black" }} />
                  <Tooltip contentStyle={{ background: '#fff', borderRadius: '12px', border: '1px solid #F1F5F9', fontSize: '11px', fontWeight: 'bold' }} />
                  <Legend verticalAlign="top" height={36} iconSize={8} wrapperStyle={{ fontSize: '9px', fontWeight: 'black', textTransform: 'uppercase' }} />
                  <ReferenceLine y={120} stroke="#EF4444" strokeDasharray="3 3" label={{ value: "120kW CAPACITY LIMIT", fill: "#EF4444", fontSize: 9, fontWeight: "black", position: "top" }} />
                  <Area type="monotone" dataKey="ups1_load" name="UPS 1" stackId="1" stroke="#3B82F6" fill="#DDBEF7" fillOpacity={0.4} />
                  <Area type="monotone" dataKey="ups2_load" name="UPS 2" stackId="1" stroke="#10B981" fill="#C2F3E1" fillOpacity={0.4} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Phase Load Distribution BarChart */}
        <Card className="bg-white border-gray-100 rounded-3xl shadow-sm overflow-hidden flex flex-col justify-between">
          <CardHeader className="border-b border-gray-50 px-6 py-4">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">PHASE LOAD BALANCING</CardDescription>
            <CardTitle className="text-sm font-black text-gray-900 uppercase tracking-tight mt-0.5">Phase Current Comparison (Amps)</CardTitle>
          </CardHeader>
          <CardContent className="p-6 flex flex-col justify-between flex-1">
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={phaseDistributionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" stroke="#94A3B8" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} dy={10} />
                  <YAxis stroke="#94A3B8" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} domain={[0, 200]} />
                  <Tooltip contentStyle={{ background: '#fff', borderRadius: '12px', border: '1px solid #F1F5F9', fontSize: '11px', fontWeight: 'bold' }} />
                  <Legend verticalAlign="top" height={36} iconSize={8} wrapperStyle={{ fontSize: '9px', fontWeight: 'black', textTransform: 'uppercase' }} />
                  <Bar dataKey="Phase_A" name="Phase A" fill="#EF4444" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Phase_B" name="Phase B" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Phase_C" name="Phase C" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Check info */}
            <div className={`flex items-center gap-1.5 text-[9px] font-black px-2.5 py-2 rounded-2xl border mt-4 justify-center ${
              isBalanced
                ? "text-emerald-700 bg-emerald-50 border-emerald-100"
                : "text-amber-700 bg-amber-50 border-amber-100"
            }`}>
              {isBalanced ? (
                <>
                  <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>Phases are optimally balanced (Unbalance &lt; 3.0%).</span>
                </>
              ) : (
                <>
                  <Activity className="w-4 h-4 shrink-0 animate-pulse text-amber-600" />
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
