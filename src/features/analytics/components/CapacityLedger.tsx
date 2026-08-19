import { AlertTriangle, Loader2, RefreshCw, ShieldCheck, ShieldAlert, Info } from "lucide-react";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { siteLabel } from "@/shared/utils/branding";
import {
  useCapacitySummary,
  type Posture,
  type RedundancyGroup
} from "@/features/analytics/hooks/useCapacitySummary";

// ─────────────────────────────────────────────────────────────────────────────
// The capacity ledger.
//
// Phrased as a constraint and its cause, because "AC SERVER DB carries 25 kW and
// keeps 175 kW after its largest feed fails" is a sentence that justifies
// capital expenditure. "2.5% utilised" is true and useless.
//
// Everything here comes from the reverse pass — the reason Stage 4b existed.
// ─────────────────────────────────────────────────────────────────────────────

const POSTURE: Record<Posture, { label: string; cls: string; note: string }> = {
  healthy: {
    label: "Healthy",
    cls: "bg-ok-50 text-ok-700 border-ok-200",
    note: "Every redundant group survives its worst single failure."
  },
  constrained: {
    label: "Constrained",
    cls: "bg-warn-50 text-warn-700 border-warn-200",
    note: "Redundancy intact, but equipment is above 70% utilisation."
  },
  "at-risk": {
    label: "At risk",
    cls: "bg-danger-50 text-danger-700 border-danger-200",
    note: "A single failure would drop load. Redundancy is not satisfied."
  }
};

function Stat({ label, value, unit, hint }: {
  label: string; value: string; unit?: string; hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-gray-400">{label}</p>
      <p className="mt-1 text-[22px] font-black tabular-nums leading-none text-gray-900">
        {value}
        {unit && <span className="ml-1 text-[12px] font-bold text-gray-400">{unit}</span>}
      </p>
      {hint && <p className="mt-1.5 text-[10px] leading-snug text-gray-400">{hint}</p>}
    </div>
  );
}

function RedundancyRow({ g }: { g: RedundancyGroup }) {
  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="py-2.5 pr-3">
        <p className="text-[12px] font-bold text-gray-900">{g.name}</p>
        <p className="font-mono text-[10px] uppercase tracking-wider text-gray-400">
          {g.feeders} feeds · {g.policy}
        </p>
      </td>
      <td className="py-2.5 pr-3 text-right font-mono text-[12px] tabular-nums text-gray-700">
        {g.load_kw.toFixed(1)}
      </td>
      <td className="py-2.5 pr-3 text-right font-mono text-[12px] tabular-nums text-gray-700">
        {g.n_plus_1_kw.toFixed(1)}
      </td>
      <td className="py-2.5 text-right">
        {g.n_plus_1_ok ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-ok-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ok-700">
            <ShieldCheck size={11} /> N+1
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-danger-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-danger-700">
            <ShieldAlert size={11} /> Breach
          </span>
        )}
      </td>
    </tr>
  );
}

export function CapacityLedger() {
  const { currentSite } = useCurrentSite();
  const { summary, posture, isLoading, error, refresh } = useCapacitySummary();

  if (isLoading) {
    return (
      <div className="flex min-h-[16rem] items-center justify-center text-gray-400">
        <Loader2 size={18} className="mr-2 animate-spin" />
        <span className="text-[12px] font-bold uppercase tracking-wider">Analysing capacity…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[16rem] flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle size={22} className="text-danger-500" />
        <p className="text-[13px] font-bold text-gray-800">Could not analyse capacity</p>
        <p className="max-w-md text-[12px] text-gray-500">{error}</p>
        <button onClick={refresh}
          className="mt-1 flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-600 hover:bg-gray-50">
          <RefreshCw size={13} /> Retry
        </button>
      </div>
    );
  }

  if (!summary || summary.redundancy.length === 0) {
    return (
      <div className="flex min-h-[16rem] flex-col items-center justify-center gap-3 p-6 text-center">
        <Info size={22} className="text-gray-400" />
        <p className="text-[13px] font-bold text-gray-800">No capacity model for this site</p>
        <p className="max-w-md text-[12px] text-gray-500">
          Capacity is derived from the power topology. Once equipment and its
          connections are recorded, headroom appears here.
        </p>
      </div>
    );
  }

  const p = POSTURE[posture];
  const total = summary.it_load_kw + summary.cooling_load_kw;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-black uppercase tracking-wider text-gray-900">
            Capacity &amp; Redundancy
          </h2>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-gray-400">
            {siteLabel(currentSite?.site_name)} · derived from the power topology
          </p>
        </div>
        <div className={`rounded-xl border px-3 py-2 ${p.cls}`}>
          <p className="text-[11px] font-black uppercase tracking-wider">{p.label}</p>
          <p className="mt-0.5 max-w-[16rem] text-[10px] leading-snug opacity-80">{p.note}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="IT load" value={summary.it_load_kw.toFixed(1)} unit="kW"
              hint="At the conversion tier — UPS and rectifier output" />
        <Stat label="Cooling load" value={summary.cooling_load_kw.toFixed(1)} unit="kW"
              hint="Estimated from thermal rating and COP" />
        <Stat label="Total drawn" value={total.toFixed(1)} unit="kW" />
        <Stat label="N+1 breaches" value={String(summary.n_plus_1_breaches)}
              hint={summary.n_plus_1_breaches === 0
                    ? "Every group survives its largest failure"
                    : "A single failure would drop load"} />
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-3">
          <h3 className="text-[12px] font-black uppercase tracking-wider text-gray-900">
            Redundant groups
          </h3>
          <p className="mt-0.5 text-[10px] text-gray-400">
            Headroom remaining after the largest feeder in each group fails — the
            figure that governs whether equipment can be installed.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-gray-400">Fed equipment</th>
                <th className="py-2 pr-3 text-right font-mono text-[10px] uppercase tracking-wider text-gray-400">Load kW</th>
                <th className="py-2 pr-3 text-right font-mono text-[10px] uppercase tracking-wider text-gray-400">N+1 kW</th>
                <th className="px-4 py-2 text-right font-mono text-[10px] uppercase tracking-wider text-gray-400">Status</th>
              </tr>
            </thead>
            <tbody className="px-4">
              {summary.redundancy.map(g => (
                <RedundancyRow key={g.target} g={g} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {summary.constrained.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-warn-200 bg-warn-50/40">
          <div className="border-b border-warn-100 px-4 py-3">
            <h3 className="text-[12px] font-black uppercase tracking-wider text-warn-900">
              Above 70% utilisation
            </h3>
          </div>
          <ul className="divide-y divide-warn-100">
            {summary.constrained.map(c => (
              <li key={c.equipment} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                <span className="text-[12px] font-bold text-warn-900">{c.name}</span>
                <span className="font-mono text-[11px] tabular-nums text-warn-800">
                  {c.load_pct.toFixed(1)}% · {c.headroom_kw.toFixed(1)} kW free
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Stated on screen, not buried in a doc: a number whose provenance is
          unclear is a number that fails under questioning. */}
      <p className="text-[10px] leading-relaxed text-gray-400">
        Load is accumulated upstream through the recorded topology. Redundant
        feeds share load; changeovers carry it on their primary source alone.
        Cooling draw is estimated from thermal rating and coefficient of
        performance — replace with nameplate figures for a definitive result.
      </p>
    </div>
  );
}
