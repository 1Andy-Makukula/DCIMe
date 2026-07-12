import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Skeleton } from "@/app/components/ui/skeleton";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/app/components/ui/accordion";
import { AlertCircle, Clock, CheckCircle2, User } from 'lucide-react';
import { useDashboardData } from '../hooks/useDashboardData';
import {
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

export function IncidentAnalytics() {
  const [timePeriod] = useState("Today");
  const { isLoading, isUsingMockData, incidentBubbles, ticketsLedger, kpis } = useDashboardData();

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
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">QUALITY OF SERVICE</span>
          <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight mt-0.5">Incident Lifecycle</h2>
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
        {/* KPI 1: Total Incidents */}
        <Card className="bg-white border-gray-100 rounded-3xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">TOTAL INCIDENTS (MTD)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 font-mono">{kpis.incidents.totalIncidents}</span>
              <span className="text-xs font-black text-gray-400 uppercase tracking-wider">Tickets</span>
            </div>
            <p className="text-[10px] text-gray-400 font-semibold mt-1 flex items-center gap-1">
              <AlertCircle size={11} className="text-slate-400" /> Month-to-date logged outages/alarms
            </p>
          </CardContent>
        </Card>

        {/* KPI 2: Open Tickets */}
        <Card className="bg-white border-gray-100 rounded-3xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">OPEN TICKETS</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 font-mono">{kpis.incidents.openTickets}</span>
              <span className={`text-xs font-black px-1.5 py-0.5 rounded border ${kpis.incidents.openTickets > 0 ? "bg-amber-50 text-amber-700 border-amber-100" : "bg-emerald-50 text-emerald-700 border-emerald-100"}`}>
                {kpis.incidents.openTickets > 0 ? "Action Required" : "All Clear"}
              </span>
            </div>
            <p className="text-[10px] text-gray-400 font-semibold mt-1 flex items-center gap-1">
              <Clock size={11} className="text-amber-500" /> Active outstanding repairs
            </p>
          </CardContent>
        </Card>

        {/* KPI 3: MTTR */}
        <Card className="bg-white border-gray-100 rounded-3xl shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">MEAN TIME TO RESOLUTION</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 font-mono">{kpis.incidents.mttr}</span>
              <span className="text-xs font-black text-gray-400 uppercase tracking-wider">Hours</span>
            </div>
            <p className="text-[10px] text-gray-400 font-semibold mt-1 flex items-center gap-1">
              <CheckCircle2 size={11} className="text-emerald-500" /> Average close-out cycle time
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bubble Timeline Scatter Chart */}
        <Card className="bg-white border-gray-100 rounded-3xl shadow-sm lg:col-span-2 overflow-hidden flex flex-col justify-between">
          <CardHeader className="border-b border-gray-50 px-6 py-4">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">INCIDENT SEVERITY & STATUS</CardDescription>
            <CardTitle className="text-sm font-black text-gray-900 uppercase tracking-tight mt-0.5">Timeline Severity Bubble Chart</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#F1F5F9" />
                  <XAxis type="number" dataKey="dayIndex" name="Date" stroke="#94A3B8" fontSize={9} fontWeight="bold" domain={['dataMin', 'dataMax']} tickFormatter={(val) => new Date(val).toLocaleDateString([], { month: 'short', day: '2-digit' })} tickLine={false} axisLine={false} dy={5} />
                  <YAxis type="number" dataKey="yValue" name="Incident Slot" stroke="#94A3B8" fontSize={9} fontWeight="bold" domain={[0, 6]} tick={false} tickLine={false} axisLine={false} />
                  <ZAxis type="number" dataKey="severity" range={[100, 1000]} name="Severity Score" />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: '#fff', borderRadius: '12px', border: '1px solid #F1F5F9', fontSize: '11px', fontWeight: 'bold' }} />
                  <Legend verticalAlign="top" height={36} iconSize={8} wrapperStyle={{ fontSize: '9px', fontWeight: 'black', textTransform: 'uppercase' }} />
                  <Scatter name="Resolved Tickets" data={incidentBubbles.filter(d => d.status === "Resolved")} fill="#10B981" shape="circle" />
                  <Scatter name="Open Tickets" data={incidentBubbles.filter(d => d.status === "Open")} fill="#EF4444" shape="circle" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Secondary Accordion List */}
        <Card className="bg-white border-gray-100 rounded-3xl shadow-sm overflow-hidden flex flex-col justify-between">
          <CardHeader className="border-b border-gray-50 px-6 py-4">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-gray-400">ACTIVE TICKETS LEDGER</CardDescription>
            <CardTitle className="text-sm font-black text-gray-900 uppercase tracking-tight mt-0.5">Incident Details & Resolutions</CardTitle>
          </CardHeader>
          <CardContent className="p-6 flex-1 overflow-y-auto max-h-[300px]">
            <Accordion type="single" collapsible className="w-full space-y-2">
              {ticketsLedger.map((t) => (
                <AccordionItem key={t.id} value={t.id} className="border border-slate-100 rounded-2xl px-4 py-1.5 bg-slate-50/30">
                  <AccordionTrigger className="hover:no-underline text-xs font-black text-slate-800 py-3 flex justify-between items-center w-full">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`shadow-none font-black text-[8px] tracking-wider uppercase ${t.status === "Resolved" ? "bg-green-50 text-green-700 border-green-200/50" : "bg-red-50 text-red-700 border-red-200/50"}`}>
                        {t.status}
                      </Badge>
                      <span>{t.id}: {t.name}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="text-[11px] text-slate-500 font-semibold space-y-3 pb-3 border-t border-slate-100 pt-2.5">
                    <p className="leading-relaxed"><strong className="text-slate-700 block mb-0.5">Description:</strong> {t.desc}</p>
                    <p className="leading-relaxed"><strong className="text-slate-700 block mb-0.5">Resolution Notes:</strong> {t.resolution}</p>
                    <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[9px] font-black uppercase text-slate-400">
                      <span className="flex items-center gap-1"><User size={12} /> Tech: {t.tech}</span>
                      <span>Date: {t.date}</span>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default IncidentAnalytics;
