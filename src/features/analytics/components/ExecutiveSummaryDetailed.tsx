import { useState } from "react";
import { Link } from "react-router";
import { Skeleton } from "@/app/components/ui/skeleton";
import {
  Printer,
  ArrowLeft,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  HelpCircle,
  CheckCircle2,
  Plus,
} from "lucide-react";
import { useCurrentSite } from "@/shared/context/SiteContext";
import {
  useExecutiveSummary,
  Verdict,
  PeriodKey,
  PeriodSnapshot,
  GeneratorLedgerRow,
  UpsLedgerRow,
  ZoneLedgerRow,
  IncidentLedgerRow,
} from "../hooks/useExecutiveSummary";
import { useSiteCommentary, CommentaryType } from "../hooks/useSiteCommentary";

const VERDICT_META: Record<Verdict, { label: string; cls: string; dot: string; Icon: typeof ShieldCheck }> = {
  HEALTHY:  { label: "Healthy",  cls: "text-ok-700 bg-ok-50 border-ok-100", dot: "bg-ok-500", Icon: ShieldCheck },
  WATCH:    { label: "Watch",    cls: "text-warn-700 bg-warn-50 border-warn-100",       dot: "bg-warn-500",   Icon: AlertTriangle },
  CRITICAL: { label: "Critical", cls: "text-danger-700 bg-danger-50 border-danger-100",             dot: "bg-danger-500",     Icon: AlertOctagon },
  NO_DATA:  { label: "No Data",  cls: "text-gray-400 bg-gray-50 border-gray-200",           dot: "bg-gray-300",    Icon: HelpCircle },
};

const PERIOD_ORDER: PeriodKey[] = ["today", "yesterday", "week", "month"];

function Pill({ verdict }: { verdict: Verdict }) {
  const meta = VERDICT_META[verdict];
  const Icon = meta.Icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-full border ${meta.cls}`}>
      <Icon size={10} />
      {meta.label}
    </span>
  );
}

/** A print page = one <section>. Each gets its own page in the printed
 *  report — this is what the old single-scroll layout was missing, and why
 *  long tables used to get sliced at the page boundary instead of starting
 *  fresh on the next page. */
function ReportPage({ children }: { children: React.ReactNode }) {
  return <section className="report-page bg-white border border-gray-100 rounded-3xl shadow-sm p-8 space-y-5">{children}</section>;
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="border-b-2 border-gray-900 pb-3 mb-1">
      <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{eyebrow}</span>
      <h3 className="text-xl font-black text-gray-900 tracking-tight mt-0.5">{title}</h3>
    </div>
  );
}

function fmt(v: number | null, decimals = 1, unit = ""): string {
  return v !== null ? `${v.toFixed(decimals)}${unit}` : "—";
}

function GeneratorTable({ rows }: { rows: GeneratorLedgerRow[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b-2 border-gray-900">
          {["Unit", "Run Hrs", "Battery", "Oil Pressure", "Water Temp", "Status"].map((h) => (
            <th key={h} className="text-left font-black uppercase tracking-widest text-[9px] text-gray-400 pb-2 pr-3">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.unit} className="border-b border-gray-100">
            <td className="py-2 pr-3 font-bold text-gray-900">{r.unit}</td>
            <td className="py-2 pr-3 font-mono">{fmt(r.runHours, 1, " h")}</td>
            <td className="py-2 pr-3 font-mono">{fmt(r.batteryVoltage, 1, " V")}</td>
            <td className="py-2 pr-3 font-mono">{fmt(r.oilPressure, 1, " Bar")}</td>
            <td className="py-2 pr-3 font-mono">{fmt(r.waterTemp, 0, "°C")}</td>
            <td className="py-2"><Pill verdict={r.verdict} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function UpsTable({ rows }: { rows: UpsLedgerRow[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b-2 border-gray-900">
          {["Unit", "Capacity", "Battery", "Rectifier", "Phase A/B/C (A)", "Status"].map((h) => (
            <th key={h} className="text-left font-black uppercase tracking-widest text-[9px] text-gray-400 pb-2 pr-3">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.unit} className="border-b border-gray-100">
            <td className="py-2 pr-3 font-bold text-gray-900">{r.unit}</td>
            <td className="py-2 pr-3 font-mono">{fmt(r.capacityPct, 0, "%")}</td>
            <td className="py-2 pr-3 font-mono">{fmt(r.batteryPct, 0, "%")}</td>
            <td className="py-2 pr-3 font-mono">{fmt(r.rectifierVoltage, 1, " V")}</td>
            <td className="py-2 pr-3 font-mono">{fmt(r.phaseAmps.a, 0)} / {fmt(r.phaseAmps.b, 0)} / {fmt(r.phaseAmps.c, 0)}</td>
            <td className="py-2"><Pill verdict={r.verdict} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ZoneGrid({ zones }: { zones: ZoneLedgerRow[] }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {zones.map((z) => {
        const meta = VERDICT_META[z.verdict];
        return (
          <div key={z.name} className={`rounded-2xl border p-4 ${meta.cls}`}>
            <div className="text-[10px] font-black uppercase tracking-wider opacity-70">{z.name}</div>
            <div className="text-2xl font-black font-mono mt-1">{fmt(z.tempC, 1, "°C")}</div>
            <div className="text-[10px] font-bold opacity-70 mt-1">{fmt(z.humidityPct, 0, "% RH")}</div>
          </div>
        );
      })}
    </div>
  );
}

function IncidentTable({ rows }: { rows: IncidentLedgerRow[] }) {
  if (rows.length === 0) {
    return <p className="text-xs font-semibold text-gray-400 py-4">No incidents logged today.</p>;
  }
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b-2 border-gray-900">
          {["Ticket", "Asset", "Severity", "Status"].map((h) => (
            <th key={h} className="text-left font-black uppercase tracking-widest text-[9px] text-gray-400 pb-2 pr-3">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.ticketNumber} className="border-b border-gray-100 align-top">
            <td className="py-2 pr-3 font-mono font-bold text-gray-900 whitespace-nowrap">{r.ticketNumber}</td>
            <td className="py-2 pr-3">{r.assetId.toUpperCase().replace(/_/g, " ")}</td>
            <td className="py-2 pr-3 capitalize">{r.severity}</td>
            <td className="py-2">
              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${r.status === "RESOLVED" ? "bg-ok-50 text-ok-700" : "bg-danger-50 text-danger-700"}`}>
                {r.status}
              </span>
              {/* Real text already recorded by a human, never generated. */}
              {(r.resolutionDetails || r.notes) && (
                <p className="text-[11px] text-gray-500 font-medium mt-1 max-w-md">{r.resolutionDetails || r.notes}</p>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CompareTable({ periods, rows }: {
  periods: Record<PeriodKey, PeriodSnapshot>;
  rows: { label: string; pick: (p: PeriodSnapshot) => number | null; unit: string; decimals?: number }[];
}) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b-2 border-gray-900">
          <th className="text-left font-black uppercase tracking-widest text-[9px] text-gray-400 pb-2">Metric</th>
          {PERIOD_ORDER.map((k) => (
            <th key={k} className="text-center font-black uppercase tracking-widest text-[9px] text-gray-400 pb-2 px-2">{periods[k].label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className="border-b border-gray-100">
            <td className="py-2 font-bold text-gray-700">{row.label}</td>
            {PERIOD_ORDER.map((k) => {
              const v = row.pick(periods[k]);
              return <td key={k} className="py-2 px-2 text-center font-mono font-black text-gray-900">{fmt(v, row.decimals ?? 1, row.unit)}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " · " +
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

/** Screen-only composer for a new note — never rendered in print, an empty
 *  form on a printed page would be meaningless. */
function NoteComposer({ onSubmit }: { onSubmit: (type: CommentaryType, body: string) => Promise<unknown> }) {
  const [type, setType] = useState<CommentaryType>("COMMENTARY");
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!body.trim()) return;
    setIsSubmitting(true);
    try {
      await onSubmit(type, body);
      setBody("");
    } catch (err: any) {
      alert(err?.message || "Failed to save note.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="print:hidden rounded-2xl border border-gray-200 bg-gray-50/60 p-4 space-y-3">
      <div className="flex gap-1.5">
        {(["COMMENTARY", "ONGOING"] as CommentaryType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
              type === t ? "bg-slate-900 text-white" : "bg-white border border-gray-200 text-gray-500"
            }`}
          >
            {t === "COMMENTARY" ? "Commentary" : "Ongoing Item"}
          </button>
        ))}
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder={type === "COMMENTARY"
          ? "What's really going on today, in your own words…"
          : "An ongoing item to keep visible until it's resolved…"}
        className="w-full p-3 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-800 placeholder-gray-400 focus:outline-none focus:border-slate-800 resize-none"
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isSubmitting || !body.trim()}
        className="flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      >
        <Plus size={12} />
        {isSubmitting ? "Saving…" : "Add Note"}
      </button>
    </div>
  );
}

export function ExecutiveSummaryDetailed() {
  const { currentSite } = useCurrentSite();
  const { isLoading, error, periods, todayDetail, sectors } = useExecutiveSummary();
  const { commentary, ongoing, addNote, resolveOngoing } = useSiteCommentary();
  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  if (isLoading) {
    return (
      <div className="p-6 space-y-5 bg-slate-50/50 min-h-screen">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64 w-full bg-slate-200 rounded-3xl" />)}
      </div>
    );
  }

  if (error || !periods || !todayDetail || !sectors) {
    return (
      <div className="p-6 bg-slate-50/50 min-h-screen">
        <div className="bg-danger-50 border border-danger-100 text-danger-700 p-4 rounded-3xl text-xs font-semibold">
          {error || "No site selected — unable to build the full report."}
        </div>
      </div>
    );
  }

  const today = periods.today;

  return (
    <div className="p-6 bg-slate-50/50 min-h-screen text-slate-800" id="exec-summary-detailed-print-area">
      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          /* No visibility/position hack here — every surrounding layer
             (AdminLayout's header, AnalyticsLayout's sub-nav, both flex
             shells) is genuinely display:none or overflow-visible in print
             (see those components), so this area already renders alone, in
             normal document flow. That normal flow is exactly what lets
             break-after:page paginate correctly — position:absolute here
             previously defeated pagination and silently capped the whole
             report to one page. */
          #exec-summary-detailed-print-area {
            width: 100% !important;
            padding: 0 !important; background: white !important;
          }
          .report-page {
            box-shadow: none !important; border: none !important; border-radius: 0 !important;
            break-after: page; padding: 0 !important;
          }
          .report-page:last-of-type { break-after: auto; }
          @page { size: A4 portrait; margin: 12mm; }
        }
      `}} />

      {/* Toolbar */}
      <div className="print:hidden flex items-center justify-between mb-5 max-w-4xl mx-auto">
        <Link to="/admin/analytics/summary" className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-gray-500 hover:text-gray-800">
          <ArrowLeft size={13} /> Back to Brief Summary
        </Link>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-slate-900 text-white text-[11px] font-black uppercase tracking-wider hover:bg-slate-800 active:scale-[0.98] transition-all cursor-pointer"
        >
          <Printer size={13} />
          Print / Download Full Report
        </button>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* PAGE 1 — Cover + snapshot */}
        <ReportPage>
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Daily Operations Brief — Full Report</span>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight mt-1">{currentSite?.site_name || "Site"} — {todayLabel}</h1>
            <p className="text-xs text-gray-400 font-semibold mt-1">Per-asset detail behind the brief summary. Every figure below is a live reading — nothing here is estimated except where explicitly labelled.</p>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Grid Uptime", value: fmt(today.gridUptimePct, 1, "%"), verdict: sectors.power.verdict },
              { label: "PUE (Approx.)", value: fmt(today.puEstimate, 2), verdict: "NO_DATA" as Verdict },
              { label: "Peak Load", value: fmt(today.peakLoadKw, 0, " kW"), verdict: "NO_DATA" as Verdict },
              { label: "Open Incidents", value: String(todayDetail.incidents.filter(i => i.status !== "RESOLVED").length), verdict: sectors.incidents.verdict },
            ].map((t) => (
              <div key={t.label} className={`rounded-2xl border p-4 ${VERDICT_META[t.verdict].cls}`}>
                <div className="text-[9px] font-black uppercase tracking-wider opacity-70">{t.label}</div>
                <div className="text-2xl font-black font-mono mt-1">{t.value}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(["power", "generators", "ups", "thermal", "incidents"] as const).map((k) => (
              <div key={k} className="rounded-2xl border border-gray-100 p-3.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">{k}</span>
                  <Pill verdict={sectors[k].verdict} />
                </div>
                <p className="text-xs font-black text-gray-900">{sectors[k].headline}</p>
                <p className="text-[11px] text-gray-500 font-semibold mt-0.5">{sectors[k].detail}</p>
              </div>
            ))}
          </div>
        </ReportPage>

        {/* PAGE 2 — Grid & Power */}
        <ReportPage>
          <SectionHeading eyebrow="Sector Detail" title="Grid & Power" />
          <div className="grid grid-cols-2 gap-6">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">3-Phase Voltage — Latest Reading</span>
              <table className="w-full text-xs">
                <tbody>
                  {[["R", todayDetail.gridVoltage.r], ["Y", todayDetail.gridVoltage.y], ["B", todayDetail.gridVoltage.b]].map(([ph, v]) => (
                    <tr key={ph as string} className="border-b border-gray-100">
                      <td className="py-2 font-bold">Phase {ph}</td>
                      <td className="py-2 text-right font-mono">{fmt(v as number | null, 1, " V")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">Outage Hours Today</span>
              {todayDetail.offlineHours.length === 0 ? (
                <p className="text-xs font-semibold text-gray-400">No outage hours logged today.</p>
              ) : (
                <p className="text-xs font-semibold text-gray-700">
                  Grid logged OFFLINE during: {todayDetail.offlineHours.map(h => `${String(h).padStart(2, "0")}:00`).join(", ")}.
                  <span className="block text-[10px] text-gray-400 mt-1 font-medium">Hourly telemetry resolution — exact minute-level start/end is not recorded.</span>
                </p>
              )}
            </div>
          </div>
        </ReportPage>

        {/* PAGE 3 — Generators & Fuel */}
        <ReportPage>
          <SectionHeading eyebrow="Sector Detail" title="Generators & Fuel" />
          <GeneratorTable rows={todayDetail.generators} />
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="rounded-2xl border border-gray-100 p-4">
              <div className="text-[9px] font-black uppercase tracking-widest text-gray-400">Fuel Reserve (Bulk Tank)</div>
              <div className="text-xl font-black font-mono mt-1">{fmt(todayDetail.fuelBalanceLiters, 0, " L")}</div>
            </div>
            <div className="rounded-2xl border border-gray-100 p-4">
              <div className="text-[9px] font-black uppercase tracking-widest text-gray-400">Fleet Run Hours / Fuel Today</div>
              <div className="text-xl font-black font-mono mt-1">{fmt(today.genRunHours, 1, " h")} · {fmt(today.genFuelConsumed, 0, " L")}</div>
            </div>
          </div>
        </ReportPage>

        {/* PAGE 4 — UPS & DC */}
        <ReportPage>
          <SectionHeading eyebrow="Sector Detail" title="UPS & DC Rectifiers" />
          <UpsTable rows={todayDetail.ups} />
        </ReportPage>

        {/* PAGE 5 — Thermal */}
        <ReportPage>
          <SectionHeading eyebrow="Sector Detail" title="Thermal & HVAC — All Zones" />
          <ZoneGrid zones={todayDetail.zones} />
        </ReportPage>

        {/* PAGE 6 — Incidents */}
        <ReportPage>
          <SectionHeading eyebrow="Sector Detail" title="Incident Ledger — Today" />
          <IncidentTable rows={todayDetail.incidents} />
        </ReportPage>

        {/* PAGE 7 — Period comparison */}
        <ReportPage>
          <SectionHeading eyebrow="Trend" title="Period Comparison — Today / Yesterday / Last 7 Days / This Month" />
          <CompareTable
            periods={periods}
            rows={[
              { label: "Grid Uptime", pick: (p) => p.gridUptimePct, unit: "%" },
              { label: "Peak Site Load", pick: (p) => p.peakLoadKw, unit: " kW", decimals: 0 },
              { label: "Peak Server Temp", pick: (p) => p.peakTempC, unit: "°C" },
              { label: "Avg Humidity", pick: (p) => p.avgHumidityPct, unit: "%" },
              { label: "UPS Peak Capacity", pick: (p) => p.upsPeakCapacityPct, unit: "%", decimals: 0 },
              { label: "UPS Min Battery", pick: (p) => p.upsMinBatteryPct, unit: "%", decimals: 0 },
              { label: "Generator Run Hours", pick: (p) => p.genRunHours, unit: " h" },
              { label: "Fuel Consumed", pick: (p) => p.genFuelConsumed, unit: " L", decimals: 0 },
              { label: "PUE (Approx.)", pick: (p) => p.puEstimate, unit: "", decimals: 2 },
              { label: "Incidents Logged", pick: (p) => p.incidentsOpened, unit: "", decimals: 0 },
              { label: "Critical Incidents", pick: (p) => p.incidentsCritical, unit: "", decimals: 0 },
            ]}
          />
        </ReportPage>

        {/* PAGE 8 — Ongoing items & site manager commentary */}
        <ReportPage>
          <SectionHeading eyebrow="Site Manager" title="Ongoing Items & Commentary" />

          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">
              Ongoing At The Site {ongoing.length > 0 && `(${ongoing.length})`}
            </span>
            {ongoing.length === 0 ? (
              <p className="text-xs font-semibold text-gray-400">Nothing ongoing right now.</p>
            ) : (
              <ul className="space-y-2">
                {ongoing.map((o) => (
                  <li key={o.id} className="flex items-start justify-between gap-3 rounded-xl border border-warn-100 bg-warn-50/50 p-3">
                    <div>
                      <p className="text-xs font-semibold text-gray-800 leading-relaxed">{o.body}</p>
                      <p className="text-[10px] text-gray-400 font-bold mt-1">{o.author_name} · since {formatWhen(o.created_at)}</p>
                    </div>
                    <button
                      onClick={() => resolveOngoing(o.id)}
                      className="print:hidden flex items-center gap-1 shrink-0 text-[9px] font-black uppercase tracking-wider text-ok-700 hover:text-ok-900 cursor-pointer"
                    >
                      <CheckCircle2 size={12} /> Resolve
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">
              Commentary History {commentary.length > 0 && `(${commentary.length})`}
            </span>
            {commentary.length === 0 ? (
              <p className="text-xs font-semibold text-gray-400">No commentary logged yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {commentary.map((c) => (
                  <li key={c.id} className="rounded-xl border border-gray-100 p-3">
                    <p className="text-xs font-medium text-gray-800 leading-relaxed font-serif">{c.body}</p>
                    <p className="text-[10px] text-gray-400 font-bold mt-1.5">{c.author_name} · {formatWhen(c.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <NoteComposer onSubmit={addNote} />

          <div className="grid grid-cols-2 gap-8 pt-4 border-t border-gray-100 mt-2">
            <div>
              <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-6">Prepared By</div>
              <div className="border-b border-gray-300 mb-1.5"></div>
              <div className="text-[10px] text-gray-400 font-semibold">Site Duty Manager</div>
            </div>
            <div>
              <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-6">Reviewed / Signed Off</div>
              <div className="border-b border-gray-300 mb-1.5"></div>
              <div className="text-[10px] text-gray-400 font-semibold">&nbsp;</div>
            </div>
          </div>
        </ReportPage>
      </div>
    </div>
  );
}

export default ExecutiveSummaryDetailed;
