import { Link } from "react-router";
import { Card, CardContent } from "@/app/components/ui/card";
import { Skeleton } from "@/app/components/ui/skeleton";
import {
  Printer,
  FileStack,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  HelpCircle,
  Zap,
  Fuel,
  Battery,
  ThermometerSnowflake,
  Activity,
  Info,
} from "lucide-react";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { SlaPanel } from "./SlaPanel";
import { useExecutiveSummary, SectorSummary, Verdict, PeriodSnapshot, PeriodKey } from "../hooks/useExecutiveSummary";

const VERDICT_META: Record<Verdict, { label: string; cls: string; Icon: typeof ShieldCheck }> = {
  HEALTHY:  { label: "Healthy",  cls: "text-ok-700 bg-ok-50 border-ok-100", Icon: ShieldCheck },
  WATCH:    { label: "Watch",    cls: "text-warn-700 bg-warn-50 border-warn-100",       Icon: AlertTriangle },
  CRITICAL: { label: "Critical", cls: "text-danger-700 bg-danger-50 border-danger-100",             Icon: AlertOctagon },
  NO_DATA:  { label: "No Data",  cls: "text-neutral-400 bg-neutral-50 border-neutral-200",           Icon: HelpCircle },
};

const PERIOD_ORDER: PeriodKey[] = ["today", "yesterday", "week", "month"];

function SectorCard({
  icon: Icon,
  title,
  summary,
}: {
  icon: typeof Zap;
  title: string;
  summary: SectorSummary;
}) {
  const meta = VERDICT_META[summary.verdict];
  const VerdictIcon = meta.Icon;

  return (
    <Card className="bg-white border-neutral-100 rounded-3xl shadow-sm break-inside-avoid">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-neutral-50 border border-neutral-100 flex items-center justify-center">
              <Icon size={15} className="text-neutral-500" />
            </div>
            <span className="text-[11px] font-black uppercase tracking-widest text-neutral-500">{title}</span>
          </div>
          <span className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-full border ${meta.cls}`}>
            <VerdictIcon size={10} />
            {meta.label}
          </span>
        </div>
        <div>
          <p className="text-sm font-black text-neutral-900 leading-tight">{summary.headline}</p>
          <p className="text-[11px] text-neutral-500 font-semibold mt-1 leading-relaxed">{summary.detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/** One row of the comparison table: a metric across all four periods. */
function ComparisonRow({
  label,
  periods,
  pick,
  unit,
  decimals = 1,
}: {
  label: string;
  periods: Record<PeriodKey, PeriodSnapshot>;
  pick: (p: PeriodSnapshot) => number | null;
  unit: string;
  decimals?: number;
}) {
  return (
    <tr className="border-b border-neutral-50 last:border-0">
      <td className="py-2.5 pr-4 text-[11px] font-bold text-neutral-600 whitespace-nowrap">{label}</td>
      {PERIOD_ORDER.map((key) => {
        const val = pick(periods[key]);
        return (
          <td key={key} className="py-2.5 px-2 text-center text-[12px] font-black text-neutral-900 font-mono">
            {val !== null ? `${val.toFixed(decimals)}${unit}` : "—"}
          </td>
        );
      })}
    </tr>
  );
}

export function ExecutiveSummary() {
  const { currentSite } = useCurrentSite();
  const { isLoading, error, periods, sectors } = useExecutiveSummary();

  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 bg-neutral-50/50 min-h-screen">
        <Skeleton className="h-16 w-full bg-neutral-200 rounded-3xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-32 w-full bg-neutral-100 rounded-3xl" />)}
        </div>
      </div>
    );
  }

  if (error || !sectors || !periods) {
    return (
      <div className="p-6 bg-neutral-50/50 min-h-screen">
        <div className="bg-danger-50 border border-danger-100 text-danger-700 p-4 rounded-3xl text-xs font-semibold">
          {error || "No site selected — unable to build the executive summary."}
        </div>
      </div>
    );
  }

  const today = periods.today;

  return (
    <div className="p-6 space-y-6 bg-neutral-50/50 min-h-screen text-neutral-800" id="exec-summary-print-area">
      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          /* No visibility/position hack — AdminLayout's header and
             AnalyticsLayout's sub-nav are genuinely display:none in print,
             so this area already renders alone in normal document flow. */
          #exec-summary-print-area {
            width: 100% !important;
            padding: 0 !important; background: white !important;
          }
          @page { size: A4 portrait; margin: 10mm; }
        }
      `}} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-neutral-100 rounded-3xl p-5 shadow-sm">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Daily Site Brief</span>
          <h2 className="text-lg font-black text-neutral-900 uppercase tracking-tight mt-0.5">
            {currentSite?.site_name || "Site"} — {todayLabel}
          </h2>
          <p className="text-[11px] text-neutral-400 font-semibold mt-0.5">
            A one-page status check, not a data dump — drill into the tabs above for full detail on any sector.
          </p>
        </div>
        <div className="print:hidden flex items-center gap-2 shrink-0">
          <Link
            to="/admin/analytics/summary/full"
            className="flex items-center gap-1.5 h-9 px-4 rounded-xl border border-neutral-200 bg-white text-[11px] font-black uppercase tracking-wider text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50 active:scale-[0.98] transition-all"
          >
            <FileStack size={13} />
            More Details — Full Report
          </Link>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-neutral-900 text-white text-[11px] font-black uppercase tracking-wider hover:bg-neutral-800 active:scale-[0.98] transition-all cursor-pointer"
          >
            <Printer size={13} />
            Print Short Version
          </button>
        </div>
      </div>

      {/* PUE — approximate, explicitly labelled as such */}
      <Card className="bg-white border-neutral-100 rounded-3xl shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Power Usage Effectiveness (Approx.)</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-black text-neutral-900 font-mono">
                  {today.puEstimate !== null ? today.puEstimate.toFixed(2) : "—"}
                </span>
                {periods.yesterday.puEstimate !== null && (
                  <span className="text-[10px] font-bold text-neutral-400">
                    yesterday {periods.yesterday.puEstimate.toFixed(2)}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2 bg-info-50/60 border border-info-100 rounded-2xl px-3 py-2 max-w-sm">
              <Info size={13} className="text-info-500 shrink-0 mt-0.5" />
              <p className="text-[10px] text-info-800 font-semibold leading-relaxed">
                Estimated as average site load ÷ average UPS output load over each window — a proxy, not a certified
                IT-load meter reading. Treat as directional until dedicated IT-load metering is confirmed.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sector cards — today's health, at a glance */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <SectorCard icon={Zap} title="Grid & Power" summary={sectors.power} />
        <SectorCard icon={Fuel} title="Generators" summary={sectors.generators} />
        <SectorCard icon={Battery} title="UPS & DC" summary={sectors.ups} />
        <SectorCard icon={ThermometerSnowflake} title="Thermal & HVAC" summary={sectors.thermal} />
        <SectorCard icon={Activity} title="Incidents" summary={sectors.incidents} />
      </div>

      {/* Full comparison table — Today / Yesterday / Last 7 Days / This Month */}
      <Card className="bg-white border-neutral-100 rounded-3xl shadow-sm break-inside-avoid">
        <CardContent className="p-5">
          <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400 block mb-3">
            Period Comparison
          </span>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-100">
                  <th className="text-left text-[9px] font-black uppercase tracking-widest text-neutral-400 pb-2">Metric</th>
                  {PERIOD_ORDER.map((key) => (
                    <th key={key} className="text-center text-[9px] font-black uppercase tracking-widest text-neutral-400 pb-2 px-2">
                      {periods[key].label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <ComparisonRow label="Grid Uptime" periods={periods} pick={(p) => p.gridUptimePct} unit="%" />
                <ComparisonRow label="Peak Site Load" periods={periods} pick={(p) => p.peakLoadKw} unit=" kW" />
                <ComparisonRow label="Peak Server Temp" periods={periods} pick={(p) => p.peakTempC} unit="°C" />
                <ComparisonRow label="Avg Humidity" periods={periods} pick={(p) => p.avgHumidityPct} unit="%" />
                <ComparisonRow label="UPS Peak Capacity" periods={periods} pick={(p) => p.upsPeakCapacityPct} unit="%" />
                <ComparisonRow label="UPS Min Battery" periods={periods} pick={(p) => p.upsMinBatteryPct} unit="%" />
                <ComparisonRow label="Generator Run Hours" periods={periods} pick={(p) => p.genRunHours} unit="h" />
                <ComparisonRow label="Fuel Consumed" periods={periods} pick={(p) => p.genFuelConsumed} unit=" L" decimals={0} />
                <ComparisonRow label="PUE (Approx.)" periods={periods} pick={(p) => p.puEstimate} unit="" decimals={2} />
                <ComparisonRow label="Incidents Logged" periods={periods} pick={(p) => p.incidentsOpened} unit="" decimals={0} />
                <ComparisonRow label="Critical Incidents" periods={periods} pick={(p) => p.incidentsCritical} unit="" decimals={0} />
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Technical -> Admin: the work queue expressed as management numbers.
          Same table the technician reads, so the floor and the boardroom
          cannot disagree. */}
      <Card className="bg-white border-neutral-100 rounded-3xl shadow-sm">
        <CardContent className="p-5">
          <SlaPanel />
        </CardContent>
      </Card>
    </div>
  );
}

export default ExecutiveSummary;
