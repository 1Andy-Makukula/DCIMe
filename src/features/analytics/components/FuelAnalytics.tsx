import { useState, useMemo } from "react";
import { 
  Fuel, 
  Clock, 
  Download, 
  ArrowUpRight
} from "lucide-react";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from "@/app/components/ui/card";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/app/components/ui/tabs";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/app/components/ui/select";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/app/components/ui/table";
import { Badge } from "@/app/components/ui/badge";
import { Progress } from "@/app/components/ui/progress";
import { Button } from "@/app/components/ui/button";

import {
  ComposedChart,
  AreaChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ── Constant ────────────────────────────────────────────────────────────────
const BURN_RATE_LPH = 150;

// ── Step 1: Raw 14-Day Daily Logs ───────────────────────────────────────────
const RAW_DAILY_LOGS = [
  { date: "Jun 26", mainReservoirReported: 28000, dg1_run_hrs_cumulative: 1200.0, dg2_run_hrs_cumulative: 950.0, dg3_run_hrs_cumulative: 1100.0, dg4_run_hrs_cumulative: 800.0, dghq_run_hrs_cumulative: 500.0 },
  { date: "Jun 27", mainReservoirReported: 27500, dg1_run_hrs_cumulative: 1202.5, dg2_run_hrs_cumulative: 951.0, dg3_run_hrs_cumulative: 1100.5, dg4_run_hrs_cumulative: 800.0, dghq_run_hrs_cumulative: 501.2 },
  { date: "Jun 28", mainReservoirReported: 26800, dg1_run_hrs_cumulative: 1205.0, dg2_run_hrs_cumulative: 952.5, dg3_run_hrs_cumulative: 1101.5, dg4_run_hrs_cumulative: 801.0, dghq_run_hrs_cumulative: 502.8 },
  { date: "Jun 29", mainReservoirReported: 26100, dg1_run_hrs_cumulative: 1207.2, dg2_run_hrs_cumulative: 954.0, dg3_run_hrs_cumulative: 1102.8, dg4_run_hrs_cumulative: 802.2, dghq_run_hrs_cumulative: 504.0 },
  { date: "Jun 30", mainReservoirReported: 25400, dg1_run_hrs_cumulative: 1209.8, dg2_run_hrs_cumulative: 955.8, dg3_run_hrs_cumulative: 1104.2, dg4_run_hrs_cumulative: 803.5, dghq_run_hrs_cumulative: 505.5 },
  { date: "Jul 01", mainReservoirReported: 24700, dg1_run_hrs_cumulative: 1212.0, dg2_run_hrs_cumulative: 957.0, dg3_run_hrs_cumulative: 1105.0, dg4_run_hrs_cumulative: 804.8, dghq_run_hrs_cumulative: 506.7 },
  { date: "Jul 02", mainReservoirReported: 23900, dg1_run_hrs_cumulative: 1215.1, dg2_run_hrs_cumulative: 958.8, dg3_run_hrs_cumulative: 1106.8, dg4_run_hrs_cumulative: 806.0, dghq_run_hrs_cumulative: 508.2 },
  { date: "Jul 03", mainReservoirReported: 23200, dg1_run_hrs_cumulative: 1217.5, dg2_run_hrs_cumulative: 960.0, dg3_run_hrs_cumulative: 1107.5, dg4_run_hrs_cumulative: 807.2, dghq_run_hrs_cumulative: 509.5 },
  // Refuel event on Jul 04: mainReservoirReported rises from 23200 to 29000
  { date: "Jul 04", mainReservoirReported: 29000, dg1_run_hrs_cumulative: 1219.0, dg2_run_hrs_cumulative: 961.5, dg3_run_hrs_cumulative: 1108.8, dg4_run_hrs_cumulative: 808.5, dghq_run_hrs_cumulative: 511.0 },
  { date: "Jul 05", mainReservoirReported: 28300, dg1_run_hrs_cumulative: 1221.8, dg2_run_hrs_cumulative: 963.2, dg3_run_hrs_cumulative: 1110.2, dg4_run_hrs_cumulative: 809.8, dghq_run_hrs_cumulative: 512.2 },
  { date: "Jul 06", mainReservoirReported: 27600, dg1_run_hrs_cumulative: 1224.2, dg2_run_hrs_cumulative: 964.8, dg3_run_hrs_cumulative: 1111.8, dg4_run_hrs_cumulative: 811.0, dghq_run_hrs_cumulative: 513.8 },
  // Anomaly: a sudden drop in mainReservoirReported on Jul 07
  { date: "Jul 07", mainReservoirReported: 25800, dg1_run_hrs_cumulative: 1226.5, dg2_run_hrs_cumulative: 966.0, dg3_run_hrs_cumulative: 1112.5, dg4_run_hrs_cumulative: 812.2, dghq_run_hrs_cumulative: 515.0 },
  { date: "Jul 08", mainReservoirReported: 25100, dg1_run_hrs_cumulative: 1229.0, dg2_run_hrs_cumulative: 967.5, dg3_run_hrs_cumulative: 1113.8, dg4_run_hrs_cumulative: 813.5, dghq_run_hrs_cumulative: 516.5 },
  { date: "Jul 09", mainReservoirReported: 24350, dg1_run_hrs_cumulative: 1231.8, dg2_run_hrs_cumulative: 969.2, dg3_run_hrs_cumulative: 1115.2, dg4_run_hrs_cumulative: 814.8, dghq_run_hrs_cumulative: 518.2 },
];

const AUDIT_EVENTS = [
  { date: "Jul 07", type: "NEGATIVE VARIANCE", reported: 25800, calculated: 27000, variance: -1200, tech: "Emma" },
  { date: "Jul 04", type: "BULK DELIVERY", reported: 29000, calculated: 29000, variance: 0, tech: "David" },
  { date: "Jul 01", type: "ROUTINE AUDIT", reported: 24700, calculated: 24700, variance: 0, tech: "Erick" },
  { date: "Jun 28", type: "ROUTINE AUDIT", reported: 26800, calculated: 26800, variance: 0, tech: "Emma" },
];

// Helper to format numeric values to max 2 decimal places
const formatNum = (num: number): string => {
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export function FuelAnalytics() {
  const [selectedGenerator, setSelectedGenerator] = useState("dg1");
  const [timePeriod, setTimePeriod] = useState("14d");

  // ── Math Engine: processedData ─────────────────────────────────────────────
  const processedData = useMemo(() => {
    const result = [];
    let prevCalculatedBalance = RAW_DAILY_LOGS[0].mainReservoirReported;

    for (let i = 0; i < RAW_DAILY_LOGS.length; i++) {
      const current = RAW_DAILY_LOGS[i];

      if (i === 0) {
        result.push({
          ...current,
          dg1_delta_hrs: 0,
          dg2_delta_hrs: 0,
          dg3_delta_hrs: 0,
          dg4_delta_hrs: 0,
          dghq_delta_hrs: 0,
          dg1_fuel_consumed: 0,
          dg2_fuel_consumed: 0,
          dg3_fuel_consumed: 0,
          dg4_fuel_consumed: 0,
          dghq_fuel_consumed: 0,
          facility_daily_burn: 0,
          mainReservoirCalculated: current.mainReservoirReported,
          variance: 0,
        });
        continue;
      }

      const prev = RAW_DAILY_LOGS[i - 1];

      // Calculate deltas
      const dg1_delta = Math.max(0, current.dg1_run_hrs_cumulative - prev.dg1_run_hrs_cumulative);
      const dg2_delta = Math.max(0, current.dg2_run_hrs_cumulative - prev.dg2_run_hrs_cumulative);
      const dg3_delta = Math.max(0, current.dg3_run_hrs_cumulative - prev.dg3_run_hrs_cumulative);
      const dg4_delta = Math.max(0, current.dg4_run_hrs_cumulative - prev.dg4_run_hrs_cumulative);
      const dghq_delta = Math.max(0, current.dghq_run_hrs_cumulative - prev.dghq_run_hrs_cumulative);

      // Apply burn rate
      const dg1_burn = dg1_delta * BURN_RATE_LPH;
      const dg2_burn = dg2_delta * BURN_RATE_LPH;
      const dg3_burn = dg3_delta * BURN_RATE_LPH;
      const dg4_burn = dg4_delta * BURN_RATE_LPH;
      const dghq_burn = dghq_delta * BURN_RATE_LPH;

      const daily_burn = dg1_burn + dg2_burn + dg3_burn + dg4_burn + dghq_burn;

      // Handle refuel inflow detection
      const reportedChange = current.mainReservoirReported - prev.mainReservoirReported;
      let refuelInflow = 0;
      if (reportedChange > 0) {
        refuelInflow = reportedChange + daily_burn;
      }

      const calculatedBalance = prevCalculatedBalance + refuelInflow - daily_burn;
      prevCalculatedBalance = calculatedBalance;

      const variance = current.mainReservoirReported - calculatedBalance;

      result.push({
        ...current,
        dg1_delta_hrs: dg1_delta,
        dg2_delta_hrs: dg2_delta,
        dg3_delta_hrs: dg3_delta,
        dg4_delta_hrs: dg4_delta,
        dghq_delta_hrs: dghq_delta,
        dg1_fuel_consumed: dg1_burn,
        dg2_fuel_consumed: dg2_burn,
        dg3_fuel_consumed: dg3_burn,
        dg4_fuel_consumed: dg4_burn,
        dghq_fuel_consumed: dghq_burn,
        facility_daily_burn: daily_burn,
        mainReservoirCalculated: calculatedBalance,
        variance: variance,
      });
    }

    return result;
  }, []);

  // ── KPI Summary Calculations ───────────────────────────────────────────────
  const kpis = useMemo(() => {
    // Exclude index 0 since deltas start on day 1
    const deltaDays = processedData.slice(1);
    
    let totalRunHrs = 0;
    let totalBurn = 0;
    
    deltaDays.forEach(day => {
      totalRunHrs += day.dg1_delta_hrs + day.dg2_delta_hrs + day.dg3_delta_hrs + day.dg4_delta_hrs + day.dghq_delta_hrs;
      totalBurn += day.facility_daily_burn;
    });

    const latestLog = processedData[processedData.length - 1];
    const latestReportedBalance = latestLog.mainReservoirReported;

    // Average daily burn (from the 13 delta days)
    const avgDailyBurn = totalBurn / deltaDays.length;
    const estDaysRemaining = avgDailyBurn > 0 ? latestReportedBalance / avgDailyBurn : 0;

    return {
      totalRunHrs,
      totalBurn,
      latestReportedBalance,
      estDaysRemaining
    };
  }, [processedData]);

  // Custom tooltips to match Shadcn styling
  const MacroTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-100 rounded-xl shadow-lg text-xs space-y-1">
          <p className="font-black text-gray-950 uppercase tracking-wider mb-1">{label}</p>
          {payload.map((item: any) => (
            <div key={item.name} className="flex justify-between gap-4 font-semibold">
              <span className="text-gray-500">
                {item.name === "mainReservoirReported" ? "Reported Balance" : "Calculated Balance"}:
              </span>
              <span className={item.name === "mainReservoirReported" ? "text-emerald-600 font-bold" : "text-red-500 font-bold"}>
                {formatNum(item.value)} L
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const MicroTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-100 rounded-xl shadow-lg text-xs space-y-1">
          <p className="font-black text-gray-950 uppercase tracking-wider mb-1">{label}</p>
          {payload.map((item: any) => (
            <div key={item.name} className="flex justify-between gap-4 font-semibold">
              <span className="text-gray-500">
                {item.name.includes("delta_hrs") ? "Run Hours Delta" : "Fuel Burned"}:
              </span>
              <span className={item.name.includes("delta_hrs") ? "text-slate-900 font-bold" : "text-red-500 font-bold"}>
                {formatNum(item.value)} {item.name.includes("delta_hrs") ? "Hrs" : "L"}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="p-6 space-y-6">
      {/* ── Step 2: Header Section ───────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-gray-100 rounded-3xl p-5 shadow-xs">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">OPERATIONAL METRICS</span>
          <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight mt-0.5">Generators & Fuel Analytics</h2>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timePeriod} onValueChange={setTimePeriod}>
            <SelectTrigger className="w-[140px] bg-slate-50 border-gray-200 text-xs font-black uppercase tracking-wider h-10 rounded-xl text-slate-900">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent className="bg-white border-gray-100 rounded-xl">
              <SelectItem value="14d" className="text-xs font-bold uppercase tracking-wider text-slate-900 hover:bg-slate-50">Last 14 Days</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            variant="outline" 
            className="flex items-center gap-1.5 h-10 px-4 border border-gray-200 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-50 active:scale-[0.98] transition-all cursor-pointer text-slate-900 animate-none"
          >
            <Download size={13} />
            <span>Export CSV</span>
          </Button>
        </div>
      </div>

      {/* ── Step 2: KPI Grid ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Run Hours */}
        <Card className="bg-white border-gray-100 rounded-3xl shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">TOTAL FACILITY RUN HOURS</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 font-mono">{formatNum(kpis.totalRunHrs)}</span>
              <span className="text-xs font-black text-gray-400 uppercase tracking-wider">Hrs</span>
            </div>
            <p className="text-[10px] text-gray-400 font-semibold mt-1 flex items-center gap-1">
              <Clock size={11} className="text-gray-400" /> Active fleet cumulative deltas
            </p>
          </CardContent>
        </Card>

        {/* KPI 2: Total Burn */}
        <Card className="bg-white border-gray-100 rounded-3xl shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">TOTAL FACILITY BURN</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 font-mono">{formatNum(kpis.totalBurn)}</span>
              <span className="text-xs font-black text-gray-400 uppercase tracking-wider">Liters</span>
            </div>
            <p className="text-[10px] text-gray-400 font-semibold mt-1 flex items-center gap-1">
              <Fuel size={11} className="text-gray-400" /> Calculated at {BURN_RATE_LPH} L/Hr
            </p>
          </CardContent>
        </Card>

        {/* KPI 3: Reservoir Balance */}
        <Card className="bg-white border-gray-100 rounded-3xl shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">MAIN RESERVOIR BALANCE</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 font-mono">{formatNum(kpis.latestReportedBalance)}</span>
              <span className="text-xs font-black text-gray-400 uppercase tracking-wider">Liters</span>
            </div>
            
            <Progress value={(kpis.latestReportedBalance / 30000) * 100} className="bg-gray-100 [&>[data-slot=progress-indicator]]:bg-emerald-500 h-1.5" />
            
            <div className="flex justify-between text-[8px] font-black text-gray-400 uppercase tracking-widest pt-0.5">
              <span>{formatNum(kpis.latestReportedBalance)} L</span>
              <span>30,000 L CAP</span>
            </div>
          </CardContent>
        </Card>

        {/* KPI 4: Days Remaining */}
        <Card className="bg-white border-gray-100 rounded-3xl shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">EST. DAYS REMAINING</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 font-mono">{formatNum(kpis.estDaysRemaining)}</span>
              <span className="text-xs font-black text-gray-400 uppercase tracking-wider">Days</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="bg-blue-50 border border-blue-100 text-blue-600 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider flex items-center gap-0.5">
                <ArrowUpRight size={10} /> Safe
              </span>
              <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide">Based on 14-day average</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Step 3: Main Visualization Area ──────────────────────────────────── */}
      <Card className="bg-white border-gray-100 rounded-3xl shadow-xs overflow-hidden">
        <Tabs defaultValue="macro" className="w-full">
          <CardHeader className="border-b border-gray-50 flex flex-col md:flex-row md:items-center md:justify-between gap-4 px-6 py-4">
            <div>
              <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">TELEMETRY CHARTS</CardDescription>
              <CardTitle className="text-sm font-black text-gray-900 uppercase tracking-tight mt-0.5">Operational Performance</CardTitle>
            </div>
            
            <TabsList className="bg-slate-100 rounded-xl p-1 border border-slate-200/50 w-fit self-start md:self-auto">
              <TabsTrigger 
                value="macro" 
                className="px-4.5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer data-[state=active]:bg-white data-[state=active]:text-slate-900 text-slate-500 hover:text-slate-700"
              >
                Macro (Reservoir)
              </TabsTrigger>
              <TabsTrigger 
                value="micro" 
                className="px-4.5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer data-[state=active]:bg-white data-[state=active]:text-slate-900 text-slate-500 hover:text-slate-700"
              >
                Micro (Generators)
              </TabsTrigger>
            </TabsList>
          </CardHeader>

          <CardContent className="p-6">
            {/* View A: Macro AreaChart */}
            <TabsContent value="macro" className="mt-0 outline-none space-y-4">
              <div className="flex flex-wrap gap-4 text-[10px] font-black uppercase tracking-widest text-gray-400 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 bg-emerald-100 rounded-md border border-emerald-300" />
                  <span>Reported Reservoir Balance</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-red-500 relative" />
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full -ml-2.5" />
                  <span>Calculated Reservoir Balance</span>
                </div>
              </div>

              <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={processedData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#94A3B8" 
                      fontSize={10} 
                      fontWeight="bold" 
                      tickLine={false} 
                      axisLine={false} 
                      dy={10}
                    />
                    <YAxis 
                      stroke="#94A3B8" 
                      fontSize={10} 
                      fontWeight="bold" 
                      tickLine={false} 
                      axisLine={false}
                      domain={[0, 30000]}
                      label={{ value: "Liters", angle: -90, position: "insideLeft", offset: 0, fill: "#94A3B8", fontSize: 9, fontWeight: "black", textAnchor: "middle" }}
                    />
                    <Tooltip content={<MacroTooltip />} />
                    <Area 
                      type="monotone" 
                      dataKey="mainReservoirReported" 
                      stroke="#10B981" 
                      fill="#E6F4EA" 
                      strokeWidth={2} 
                    />
                    <Area 
                      type="monotone" 
                      dataKey="mainReservoirCalculated" 
                      stroke="#EF4444" 
                      fill="transparent" 
                      strokeWidth={2} 
                      strokeDasharray="5 5" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>

            {/* View B: Micro ComposedChart */}
            <TabsContent value="micro" className="mt-0 outline-none space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2">
                <div className="flex flex-wrap gap-4 text-[10px] font-black uppercase tracking-widest text-gray-400">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 bg-slate-200 rounded-md border border-slate-300" />
                    <span>Run Hours Delta (L-Axis)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-red-500" />
                    <span>Fuel Burned (R-Axis)</span>
                  </div>
                </div>

                <Select value={selectedGenerator} onValueChange={setSelectedGenerator}>
                  <SelectTrigger className="w-[140px] bg-slate-50 border-gray-200 text-xs font-black uppercase tracking-wider h-8 rounded-lg self-end sm:self-auto text-slate-900">
                    <SelectValue placeholder="Generator" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-100 rounded-lg">
                    <SelectItem value="dg1" className="text-xs font-bold uppercase tracking-wider text-slate-900 hover:bg-slate-50">DG-1</SelectItem>
                    <SelectItem value="dg2" className="text-xs font-bold uppercase tracking-wider text-slate-900 hover:bg-slate-50">DG-2</SelectItem>
                    <SelectItem value="dg3" className="text-xs font-bold uppercase tracking-wider text-slate-900 hover:bg-slate-50">DG-3</SelectItem>
                    <SelectItem value="dg4" className="text-xs font-bold uppercase tracking-wider text-slate-900 hover:bg-slate-50">DG-4</SelectItem>
                    <SelectItem value="dghq" className="text-xs font-bold uppercase tracking-wider text-slate-900 hover:bg-slate-50">DG-HQ</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={processedData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#94A3B8" 
                      fontSize={10} 
                      fontWeight="bold" 
                      tickLine={false} 
                      axisLine={false} 
                      dy={10}
                    />
                    <YAxis 
                      yAxisId="left" 
                      orientation="left" 
                      stroke="#94A3B8" 
                      fontSize={10} 
                      fontWeight="bold" 
                      tickLine={false} 
                      axisLine={false}
                      label={{ value: "Hours Delta", angle: -90, position: "insideLeft", offset: 0, fill: "#94A3B8", fontSize: 9, fontWeight: "black", textAnchor: "middle" }}
                    />
                    <YAxis 
                      yAxisId="right" 
                      orientation="right" 
                      stroke="#94A3B8" 
                      fontSize={10} 
                      fontWeight="bold" 
                      tickLine={false} 
                      axisLine={false}
                      label={{ value: "Liters Burned", angle: 90, position: "insideRight", offset: 0, fill: "#94A3B8", fontSize: 9, fontWeight: "black", textAnchor: "middle" }}
                    />
                    <Tooltip content={<MicroTooltip />} />
                    <Bar 
                      yAxisId="left" 
                      dataKey={`${selectedGenerator}_delta_hrs`} 
                      fill="#E2E8F0" 
                      radius={[4, 4, 0, 0]} 
                      barSize={40} 
                    />
                    <Line 
                      yAxisId="right" 
                      type="monotone" 
                      dataKey={`${selectedGenerator}_fuel_consumed`} 
                      stroke="#EF4444" 
                      strokeWidth={2} 
                      activeDot={{ r: 6 }} 
                      dot={{ r: 4 }} 
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>

      {/* ── Step 4: Refuel & Anomaly Drawer ────────────────────────────────── */}
      <Card className="bg-white border-gray-100 rounded-3xl shadow-xs overflow-hidden">
        <CardHeader className="border-b border-gray-50 px-6 py-4">
          <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">OPERATIONAL EXCEPTION LEDGER</CardDescription>
          <CardTitle className="text-sm font-black text-gray-900 uppercase tracking-tight mt-0.5">Refuel Events & Discrepancies</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50 border-b border-gray-100">
                <TableRow>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-gray-400 p-4">DATE</TableHead>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-gray-400 p-4">EVENT TYPE</TableHead>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-gray-400 p-4">REPORTED BALANCE</TableHead>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-gray-400 p-4">CALCULATED BALANCE</TableHead>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-gray-400 p-4">VARIANCE (LITERS)</TableHead>
                  <TableHead className="text-[9px] font-black uppercase tracking-widest text-gray-400 p-4 text-right">SHIFT TECH</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100">
                {AUDIT_EVENTS.map((event, index) => {
                  let badgeClass = "";
                  switch (event.type) {
                    case "BULK DELIVERY":
                      badgeClass = "bg-green-50 text-green-700 border-green-200/50 hover:bg-green-50 shadow-none font-black text-[9px] uppercase tracking-wider";
                      break;
                    case "NEGATIVE VARIANCE":
                      badgeClass = "bg-red-50 text-red-700 border-red-200/50 hover:bg-red-50 shadow-none font-black text-[9px] uppercase tracking-wider";
                      break;
                    default:
                      badgeClass = "bg-slate-50 text-slate-700 border-slate-200/50 hover:bg-slate-50 shadow-none font-black text-[9px] uppercase tracking-wider";
                  }

                  return (
                    <TableRow key={index} className="hover:bg-slate-50/30 transition-colors">
                      <TableCell className="p-4 font-bold text-gray-800 text-xs">{event.date}</TableCell>
                      <TableCell className="p-4">
                        <Badge variant="outline" className={badgeClass}>{event.type}</Badge>
                      </TableCell>
                      <TableCell className="p-4 font-bold text-gray-950 text-xs font-mono">{formatNum(event.reported)} L</TableCell>
                      <TableCell className="p-4 text-slate-800 font-mono text-xs font-bold">{formatNum(event.calculated)} L</TableCell>
                      <TableCell className={`p-4 font-mono text-xs font-bold ${event.variance < 0 ? "text-red-500" : "text-gray-500"}`}>
                        {event.variance < 0 ? "-" : ""}{formatNum(Math.abs(event.variance))} L
                      </TableCell>
                      <TableCell className="p-4 text-gray-500 font-semibold text-xs text-right">{event.tech}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default FuelAnalytics;
