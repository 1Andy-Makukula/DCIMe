import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Skeleton } from "@/app/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { Fuel, Clock, Activity, ShieldAlert } from 'lucide-react';
import { useDashboardData } from '../hooks/useDashboardData';
import {
  ComposedChart,
  Bar,
  Line,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

export function FuelAnalytics() {
  const [selectedGenerator, setSelectedGenerator] = useState("DG-1");
  const { isLoading, fuelChartData, engineHealthData, kpis } = useDashboardData();

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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
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
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">FLEET LOGISTICS</span>
          <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight mt-0.5">Generators & Fuel Logistics</h2>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedGenerator} onValueChange={setSelectedGenerator}>
            <SelectTrigger className="w-[140px] bg-slate-50 border-gray-200 text-xs font-black uppercase tracking-wider h-10 rounded-xl text-slate-900">
              <SelectValue placeholder="Generator" />
            </SelectTrigger>
            <SelectContent className="bg-white border-gray-100 rounded-xl">
              <SelectItem value="DG-1" className="text-xs font-bold uppercase tracking-wider text-slate-900">DG-1</SelectItem>
              <SelectItem value="DG-2" className="text-xs font-bold uppercase tracking-wider text-slate-900">DG-2</SelectItem>
              <SelectItem value="DG-3" className="text-xs font-bold uppercase tracking-wider text-slate-900">DG-3</SelectItem>
              <SelectItem value="DG-4" className="text-xs font-bold uppercase tracking-wider text-slate-900">DG-4</SelectItem>
              <SelectItem value="DG-HQ" className="text-xs font-bold uppercase tracking-wider text-slate-900">DG-HQ</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Run Hours */}
        <Card className="bg-white border-gray-100 rounded-3xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">TOTAL RUN HOURS</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 font-mono">{kpis.fuel.totalRunHours.toFixed(1)}</span>
              <span className="text-xs font-black text-gray-400 uppercase tracking-wider">Hrs</span>
            </div>
            <p className="text-[10px] text-gray-400 font-semibold mt-1 flex items-center gap-1">
              <Clock size={11} className="text-gray-400" /> Active run logs delta sum
            </p>
          </CardContent>
        </Card>

        {/* KPI 2: Fuel Consumed */}
        <Card className="bg-white border-gray-100 rounded-3xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">TOTAL FUEL CONSUMED</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 font-mono">{kpis.fuel.totalFuelConsumed.toLocaleString()}</span>
              <span className="text-xs font-black text-gray-400 uppercase tracking-wider">Liters</span>
            </div>
            <p className="text-[10px] text-gray-400 font-semibold mt-1 flex items-center gap-1">
              <Fuel size={11} className="text-gray-400" /> Derived from Day Tank burn rates
            </p>
          </CardContent>
        </Card>

        {/* KPI 3: Burn Rate */}
        <Card className="bg-white border-gray-100 rounded-3xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">AVERAGE BURN RATE</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 font-mono">{kpis.fuel.avgBurnRate}</span>
              <span className="text-xs font-black text-gray-400 uppercase tracking-wider">L/Hr</span>
            </div>
            <p className="text-[10px] text-gray-400 font-semibold mt-1 flex items-center gap-1">
              <Activity size={11} className="text-emerald-500" /> Theoretical nominal rate
            </p>
          </CardContent>
        </Card>

        {/* KPI 4: Fuel Balance */}
        <Card className="bg-white border-gray-100 rounded-3xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">CURRENT FUEL BALANCE</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 font-mono">{kpis.fuel.currentFuelBalance.toLocaleString()}</span>
              <span className="text-xs font-black text-gray-400 uppercase tracking-wider">Liters</span>
            </div>
            <p className="text-[10px] text-gray-400 font-semibold mt-1 flex items-center gap-1">
              <Fuel size={11} className="text-slate-400" /> Bulk Storage Reservoir Level
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Composed Chart */}
        <Card className="bg-white border-gray-100 rounded-3xl shadow-sm lg:col-span-2 overflow-hidden flex flex-col justify-between">
          <CardHeader className="border-b border-gray-50 px-6 py-4">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">GENERATOR RUN TIMES</CardDescription>
            <CardTitle className="text-sm font-black text-gray-900 uppercase tracking-tight mt-0.5">Daily Run Hours vs. Fuel Consumed ({selectedGenerator})</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={fuelChartData} margin={{ top: 10, right: -10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="date" stroke="#94A3B8" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} dy={10} />
                  <YAxis yAxisId="left" stroke="#94A3B8" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} domain={[0, 10]} label={{ value: "Hours (Hrs)", angle: -90, position: "insideLeft", offset: 10, fill: "#94A3B8", fontSize: 9, fontWeight: "black" }} />
                  <YAxis yAxisId="right" orientation="right" stroke="#94A3B8" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} domain={[0, 1500]} label={{ value: "Fuel (L)", angle: 90, position: "insideRight", offset: 10, fill: "#94A3B8", fontSize: 9, fontWeight: "black" }} />
                  <Tooltip contentStyle={{ background: '#fff', borderRadius: '12px', border: '1px solid #F1F5F9', fontSize: '11px', fontWeight: 'bold' }} />
                  <Legend verticalAlign="top" height={36} iconSize={8} wrapperStyle={{ fontSize: '9px', fontWeight: 'black', textTransform: 'uppercase' }} />
                  <Bar yAxisId="left" dataKey="run_hrs" name="Run Hours" fill="#E2E8F0" radius={[4, 4, 0, 0]} barSize={25} />
                  <Line yAxisId="right" type="monotone" dataKey="fuel_consumed" name="Fuel Burned" stroke="#EF4444" strokeWidth={2} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Scatter Chart - Engine Health */}
        <Card className="bg-white border-gray-100 rounded-3xl shadow-sm overflow-hidden flex flex-col justify-between">
          <CardHeader className="border-b border-gray-50 px-6 py-4">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">ENGINE CLUSTERING ANOMALIES</CardDescription>
            <CardTitle className="text-sm font-black text-gray-900 uppercase tracking-tight mt-0.5">Health Scatter (Temp vs Pressure)</CardTitle>
          </CardHeader>
          <CardContent className="p-6 flex flex-col justify-between flex-1">
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#F1F5F9" />
                  <XAxis type="number" dataKey="oil_pressure" name="Oil Pressure" unit=" Bar" stroke="#94A3B8" fontSize={9} fontWeight="bold" domain={[0, 6]} tickLine={false} axisLine={false} dy={5} />
                  <YAxis type="number" dataKey="water_temp" name="Water Temp" unit=" °C" stroke="#94A3B8" fontSize={9} fontWeight="bold" domain={[60, 110]} tickLine={false} axisLine={false} dx={-5} />
                  <ZAxis type="number" dataKey="batt_voltage" range={[60, 200]} name="Battery Voltage" unit=" V" />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: '#fff', borderRadius: '12px', border: '1px solid #F1F5F9', fontSize: '11px', fontWeight: 'bold' }} />
                  <Legend verticalAlign="top" height={36} iconSize={8} wrapperStyle={{ fontSize: '9px', fontWeight: 'black', textTransform: 'uppercase' }} />
                  <Scatter name="Normal Status" data={engineHealthData.filter(d => d.status === "OK")} fill="#10B981" shape="circle" />
                  <Scatter name="Warning Alerts" data={engineHealthData.filter(d => d.status === "WARNING")} fill="#F59E0B" shape="triangle" />
                  <Scatter name="Critical Faults" data={engineHealthData.filter(d => d.status === "CRITICAL")} fill="#EF4444" shape="square" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            {/* Abnormalities Notice */}
            {engineHealthData.some(d => d.status !== "OK") && (
              <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-2xl p-3.5 mt-4 text-[10px] font-bold text-red-700 animate-pulse">
                <ShieldAlert className="w-5 h-5 text-red-600 shrink-0" />
                <span>Anomaly Detected: Generator telemetry outside normal operating parameters (Check Oil/Water logs).</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Fleet Log Details */}
      <Card className="bg-white border-gray-100 rounded-3xl shadow-sm overflow-hidden">
        <CardHeader className="border-b border-gray-50 px-6 py-4">
          <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">HISTORICAL CHECKS</CardDescription>
          <CardTitle className="text-sm font-black text-gray-900 uppercase tracking-tight mt-0.5">Generator Operation Ledger</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50 border-b border-gray-100">
              <TableRow>
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-gray-400 p-4">DATE</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-gray-400 p-4">RUN HOURS</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-gray-400 p-4">CALCULATED BURN</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-gray-400 p-4">BURN RATE</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-gray-400 p-4 text-right">STATUS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-gray-100">
              {fuelChartData.map((row, idx) => (
                <TableRow key={idx} className="hover:bg-slate-50/30 transition-colors">
                  <TableCell className="p-4 font-bold text-gray-800 text-xs">{row.date}</TableCell>
                  <TableCell className="p-4 font-bold text-gray-950 text-xs font-mono">{row.run_hrs.toFixed(1)} Hrs</TableCell>
                  <TableCell className="p-4 text-slate-800 font-mono text-xs font-bold">{row.fuel_consumed.toLocaleString()} Liters</TableCell>
                  <TableCell className="p-4 text-slate-500 font-semibold text-xs">150 L/Hr</TableCell>
                  <TableCell className="p-4 text-right">
                    <Badge variant="outline" className={`shadow-none font-black text-[9px] uppercase tracking-wider ${row.run_hrs > 0 ? "bg-green-50 text-green-700 border-green-200/50" : "bg-slate-50 text-slate-500 border-slate-200"}`}>
                      {row.run_hrs > 0 ? "RUNNING" : "STANDBY"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default FuelAnalytics;
