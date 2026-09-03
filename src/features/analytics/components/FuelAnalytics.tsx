import { useState } from 'react';
import { useCurrentSite } from "@/shared/context/SiteContext";
import { useEquipmentCondition, CONDITION_TONE } from "@/shared/api/equipmentCondition";
import { useOutletContext } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Skeleton } from "@/app/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { Fuel, Clock, Activity, ShieldAlert, AlertCircle } from 'lucide-react';
import { useDashboardData } from '../hooks/useDashboardData';
import { AnalyticsOutletContext } from './AnalyticsLayout';
import { DetailLink } from './DetailLink';
import { CategoryFleet } from './CategoryFleet';
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
  const [selectedGenerator, setSelectedGenerator] = useState<string | null>(null);
  const { currentSite } = useCurrentSite();
  // From the registry, not a literal list. A sixth generator registered in
  // Inventory used to be invisible here because the options were typed by hand.
  const { items: generators } = useEquipmentCondition(currentSite?.id ?? null, ["GENERATOR"]);
  const activeGenerator = selectedGenerator ?? generators[0]?.equipment_id ?? null;
  const { range } = useOutletContext<AnalyticsOutletContext>();
  const { isLoading, hasNoData, fuelChartData, engineHealthData, kpis } = useDashboardData(range);

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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
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

  // Registry ids are dg_1 / dg_hq; the chart's series keys are dg1_ / dghq_.
  // Stripping underscores bridges the two without a lookup table that would
  // need editing every time a generator is added.
  const chartPrefix = (activeGenerator ?? "").replace(/_/g, "");

  return (
    <div className="p-6 space-y-6 bg-neutral-50/50 min-h-screen text-neutral-800">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-neutral-100 rounded-3xl p-5 shadow-sm">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">FLEET LOGISTICS</span>
          <h2 className="text-lg font-black text-neutral-900 uppercase tracking-tight mt-0.5">Generators & Fuel Logistics</h2>
        </div>
        <div className="flex items-center gap-2">
          {/* Chips rather than a dropdown: five generators fit on one line,
              and each carries its own condition — which is the thing somebody
              opening a fuel screen actually wants to know before reading a
              burn figure off a machine that is not running. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {generators.length === 0 && (
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                No generators registered
              </span>
            )}
            {generators.map((g) => {
              const t = CONDITION_TONE[g.condition] ?? CONDITION_TONE.ONLINE;
              const on = g.equipment_id === activeGenerator;
              return (
                <button
                  key={g.equipment_id}
                  type="button"
                  onClick={() => setSelectedGenerator(g.equipment_id)}
                  title={g.last_comment ?? t.label}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 h-10 text-xs font-black uppercase tracking-wider transition-colors ${
                    on
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-white"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      t.tone === "ok" ? "bg-ok-500"
                      : t.tone === "warn" ? "bg-warn-500"
                      : t.tone === "danger" ? "bg-danger-500"
                      : "bg-neutral-400"
                    }`}
                  />
                  {g.name}
                </button>
              );
            })}
          </div>
          <DetailLink categoryId="generator" />
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
      <CategoryFleet categoryId="generator" range={range} />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Run Hours */}
        <Card className="bg-white border-neutral-100 rounded-3xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-neutral-400">TOTAL RUN HOURS</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-neutral-900 font-mono">{kpis.fuel.totalRunHours.toFixed(1)}</span>
              <span className="text-xs font-black text-neutral-400 uppercase tracking-wider">Hrs</span>
            </div>
            <p className="text-[10px] text-neutral-400 font-semibold mt-1 flex items-center gap-1">
              <Clock size={11} className="text-neutral-400" /> Active run logs delta sum
            </p>
          </CardContent>
        </Card>

        {/* KPI 2: Fuel Consumed */}
        <Card className="bg-white border-neutral-100 rounded-3xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-neutral-400">TOTAL FUEL CONSUMED</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-neutral-900 font-mono">{kpis.fuel.totalFuelConsumed.toLocaleString()}</span>
              <span className="text-xs font-black text-neutral-400 uppercase tracking-wider">Liters</span>
            </div>
            <p className="text-[10px] text-neutral-400 font-semibold mt-1 flex items-center gap-1">
              <Fuel size={11} className="text-neutral-400" /> Derived from Day Tank burn rates
            </p>
          </CardContent>
        </Card>

        {/* KPI 3: Burn Rate */}
        <Card className="bg-white border-neutral-100 rounded-3xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-neutral-400">AVERAGE BURN RATE</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-neutral-900 font-mono">{kpis.fuel.avgBurnRate}</span>
              <span className="text-xs font-black text-neutral-400 uppercase tracking-wider">L/Hr</span>
            </div>
            <p className="text-[10px] text-neutral-400 font-semibold mt-1 flex items-center gap-1">
              <Activity size={11} className="text-ok-500" /> Theoretical nominal rate
            </p>
          </CardContent>
        </Card>

        {/* KPI 4: Fuel Balance */}
        <Card className="bg-white border-neutral-100 rounded-3xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-neutral-400">CURRENT FUEL BALANCE</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-neutral-900 font-mono">{kpis.fuel.currentFuelBalance.toLocaleString()}</span>
              <span className="text-xs font-black text-neutral-400 uppercase tracking-wider">Liters</span>
            </div>
            <p className="text-[10px] text-neutral-400 font-semibold mt-1 flex items-center gap-1">
              <Fuel size={11} className="text-neutral-400" /> Bulk Storage Reservoir Level
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Composed Chart */}
        <Card className="bg-white border-neutral-100 rounded-3xl shadow-sm lg:col-span-2 overflow-hidden flex flex-col justify-between">
          <CardHeader className="border-b border-neutral-50 px-6 py-4">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-neutral-400">GENERATOR RUN TIMES</CardDescription>
            <CardTitle className="text-sm font-black text-neutral-900 uppercase tracking-tight mt-0.5">Daily Run Hours vs. Fuel Consumed ({selectedGenerator})</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={fuelChartData} margin={{ top: 10, right: -10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-neutral-100)" />
                  <XAxis dataKey="date" stroke="var(--color-neutral-400)" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} dy={10} />
                  <YAxis yAxisId="left" stroke="var(--color-neutral-400)" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} domain={[0, 10]} label={{ value: "Hours (Hrs)", angle: -90, position: "insideLeft", offset: 10, fill: "var(--color-neutral-400)", fontSize: 9, fontWeight: "black" }} />
                  <YAxis yAxisId="right" orientation="right" stroke="var(--color-neutral-400)" fontSize={9} fontWeight="bold" tickLine={false} axisLine={false} domain={[0, 1500]} label={{ value: "Fuel (L)", angle: 90, position: "insideRight", offset: 10, fill: "var(--color-neutral-400)", fontSize: 9, fontWeight: "black" }} />
                  <Tooltip contentStyle={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--color-neutral-100)', fontSize: '11px', fontWeight: 'bold' }} />
                  <Legend verticalAlign="top" height={36} iconSize={8} wrapperStyle={{ fontSize: '9px', fontWeight: 'black', textTransform: 'uppercase' }} />
                  <Bar yAxisId="left" dataKey={`${chartPrefix}_run_hrs`} name="Run Hours" fill="var(--color-neutral-200)" radius={[4, 4, 0, 0]} barSize={25} />
                  <Line yAxisId="right" type="monotone" dataKey={`${chartPrefix}_fuel_consumed`} name="Fuel Burned" stroke="var(--color-danger-500)" strokeWidth={2} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Scatter Chart - Engine Health */}
        <Card className="bg-white border-neutral-100 rounded-3xl shadow-sm overflow-hidden flex flex-col justify-between">
          <CardHeader className="border-b border-neutral-50 px-6 py-4">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-neutral-400">ENGINE CLUSTERING ANOMALIES</CardDescription>
            <CardTitle className="text-sm font-black text-neutral-900 uppercase tracking-tight mt-0.5">Health Scatter (Temp vs Pressure)</CardTitle>
          </CardHeader>
          <CardContent className="p-6 flex flex-col justify-between flex-1">
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="var(--color-neutral-100)" />
                  <XAxis type="number" dataKey="oil_pressure" name="Oil Pressure" unit=" Bar" stroke="var(--color-neutral-400)" fontSize={9} fontWeight="bold" domain={[0, 6]} tickLine={false} axisLine={false} dy={5} />
                  <YAxis type="number" dataKey="water_temp" name="Water Temp" unit=" °C" stroke="var(--color-neutral-400)" fontSize={9} fontWeight="bold" domain={[60, 110]} tickLine={false} axisLine={false} dx={-5} />
                  <ZAxis type="number" dataKey="batt_voltage" range={[60, 200]} name="Battery Voltage" unit=" V" />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--color-neutral-100)', fontSize: '11px', fontWeight: 'bold' }} />
                  <Legend verticalAlign="top" height={36} iconSize={8} wrapperStyle={{ fontSize: '9px', fontWeight: 'black', textTransform: 'uppercase' }} />
                  <Scatter name="Normal Status" data={engineHealthData.filter(d => d.status === "OK")} fill="var(--color-ok-500)" shape="circle" />
                  <Scatter name="Warning Alerts" data={engineHealthData.filter(d => d.status === "WARNING")} fill="var(--color-warn-500)" shape="triangle" />
                  <Scatter name="Critical Faults" data={engineHealthData.filter(d => d.status === "CRITICAL")} fill="var(--color-danger-500)" shape="square" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            {/* Abnormalities Notice */}
            {engineHealthData.some(d => d.status !== "OK") && (
              <div className="flex items-center gap-3 bg-danger-50 border border-danger-100 rounded-2xl p-3.5 mt-4 text-[10px] font-bold text-danger-700 animate-pulse">
                <ShieldAlert className="w-5 h-5 text-danger-600 shrink-0" />
                <span>Anomaly Detected: Generator telemetry outside normal operating parameters (Check Oil/Water logs).</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Fleet Log Details — scoped to the SAME selected generator as the
          chart above. It previously always showed fleet-wide totals, so
          picking DG-2 in the dropdown changed the chart but not this table —
          the two halves of the same card told different stories. */}
      <Card className="bg-white border-neutral-100 rounded-3xl shadow-sm overflow-hidden">
        <CardHeader className="border-b border-neutral-50 px-6 py-4">
          <CardDescription className="text-[10px] font-black uppercase tracking-widest text-neutral-400">HISTORICAL CHECKS</CardDescription>
          <CardTitle className="text-sm font-black text-neutral-900 uppercase tracking-tight mt-0.5">Generator Operation Ledger ({selectedGenerator})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-neutral-50 border-b border-neutral-100">
              <TableRow>
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-neutral-400 p-4">DATE</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-neutral-400 p-4">RUN HOURS</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-neutral-400 p-4">CALCULATED BURN</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-neutral-400 p-4">BURN RATE</TableHead>
                <TableHead className="text-[9px] font-black uppercase tracking-widest text-neutral-400 p-4 text-right">STATUS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-neutral-100">
              {fuelChartData.map((row, idx) => {
                const runHrs = (row as any)[`${chartPrefix}_run_hrs`] ?? 0;
                const fuelConsumed = (row as any)[`${chartPrefix}_fuel_consumed`] ?? 0;
                // Derived from this row's own numbers, not asserted — a
                // standby day has no burn rate to report at all.
                const burnRate = runHrs > 0 ? (fuelConsumed / runHrs).toFixed(1) : null;

                return (
                  <TableRow key={idx} className="hover:bg-neutral-50/30 transition-colors">
                    <TableCell className="p-4 font-bold text-neutral-800 text-xs">{row.date}</TableCell>
                    <TableCell className="p-4 font-bold text-neutral-950 text-xs font-mono">{runHrs.toFixed(1)} Hrs</TableCell>
                    <TableCell className="p-4 text-neutral-800 font-mono text-xs font-bold">{fuelConsumed.toLocaleString()} Liters</TableCell>
                    <TableCell className="p-4 text-neutral-500 font-semibold text-xs">{burnRate !== null ? `${burnRate} L/Hr` : "—"}</TableCell>
                    <TableCell className="p-4 text-right">
                      <Badge variant="outline" className={`shadow-none font-black text-[9px] uppercase tracking-wider ${runHrs > 0 ? "bg-ok-50 text-ok-700 border-ok-200/50" : "bg-neutral-50 text-neutral-500 border-neutral-200"}`}>
                        {runHrs > 0 ? "RUNNING" : "STANDBY"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default FuelAnalytics;
