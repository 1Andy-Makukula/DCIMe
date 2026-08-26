import { useMemo } from "react";
import { useOutletContext } from "react-router";
import { Printer, Users, AlertCircle } from "lucide-react";
import { MetricTile, StatTable, Num } from "@/shared/ui";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { useTechnicianActivity, type TechnicianRow } from "../hooks/useTechnicianActivity";
import type { AnalyticsOutletContext } from "./AnalyticsLayout";

// ─────────────────────────────────────────────────────────────────────────────
// Who recorded what.
//
// Deliberately not a leaderboard. The screen leads with volume because that is
// what a reader looks for first, then puts the two comparable rates beside it
// and says in plain words why the volume column is the least interesting thing
// on the page.
//
// The bar next to each rate is drawn against the SITE average rather than
// against the worst performer, so a team that is uniformly fine looks uniformly
// fine instead of manufacturing a laggard out of ordinary variation.
// ─────────────────────────────────────────────────────────────────────────────

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/** A rate against the site average — over-average bars lean amber. */
function RateBar({ value, average }: { value: number; average: number }) {
  // Full width is twice the site average, so average sits mid-bar and the eye
  // reads "about normal" without needing the number.
  const scale = average > 0 ? Math.min(1, value / (average * 2)) : 0;
  const over = average > 0 && value > average * 1.25;

  return (
    <div className="flex items-center justify-end gap-2">
      <span className="font-mono tabular-nums">{pct(value)}</span>
      <span className="hidden h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-neutral-100 sm:block print:hidden">
        <span
          className={`block h-full rounded-full ${over ? "bg-warn-500" : "bg-neutral-300"}`}
          style={{ width: `${Math.max(4, scale * 100)}%` }}
        />
      </span>
    </div>
  );
}

export function TechnicianAnalytics() {
  const { range } = useOutletContext<AnalyticsOutletContext>();
  const { currentSite } = useCurrentSite();

  const { rows, totals, isLoading, error } =
    useTechnicianActivity(currentSite?.id ?? null, range.start, range.end);

  // The SPREAD, not a culprit.
  //
  // Naming whoever sits highest reads as an accusation and is the less useful
  // half of the finding. What matters is that the range is wide and somebody is
  // at the bottom of it: if one technician can finish a round with 2.6% zeros,
  // the round can be finished that way, and the higher rates are avoidable
  // rather than inherent. Framing it as a range says that; naming a worst
  // performer does not.
  //
  // Only technicians with enough readings to have a meaningful rate are
  // considered — a 4-fold rate over 20 readings is noise wearing a percentage.
  const spread = useMemo(() => {
    const eligible = rows.filter((r) => r.n_numeric >= 200);
    if (eligible.length < 3 || totals.zeroRate <= 0) return null;

    const sorted = [...eligible].sort((a, b) => a.zeroRate - b.zeroRate);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    if (best.zeroRate <= 0 || worst.zeroRate < best.zeroRate * 3) return null;

    return { best, worst, ratio: worst.zeroRate / best.zeroRate };
  }, [rows, totals]);

  return (
    <div className="min-h-screen space-y-6 bg-neutral-50/50 p-6 text-neutral-800 print:bg-white print:p-0">

      <header className="flex flex-col gap-4 rounded-3xl border border-neutral-100 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
            {range.label}
          </span>
          <h2 className="mt-0.5 text-lg font-black uppercase tracking-tight text-neutral-900">
            Technician Activity
          </h2>
          <p className="mt-1 text-[11px] font-semibold text-neutral-500">
            Who recorded what, and how consistently.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex h-9 w-fit items-center gap-1.5 rounded-xl bg-neutral-900 px-3.5 text-[11px] font-black uppercase tracking-wider text-white transition-colors hover:bg-neutral-700 print:hidden"
        >
          <Printer size={13} /> Print
        </button>
      </header>

      {error && (
        <div className="rounded-2xl border border-danger-200 bg-danger-50 p-4 text-[12px] font-bold text-danger-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="rounded-3xl border border-neutral-100 bg-white p-10 text-center text-[12px] font-bold text-neutral-400 shadow-sm">
          Loading technician activity…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-neutral-200 p-10 text-center">
          <p className="text-sm font-black text-neutral-900">
            No readings were attributed to anyone in this period.
          </p>
          <p className="mt-1 text-[12px] font-semibold text-neutral-500">
            Widen the period, or check that rounds are being logged.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricTile
              label="Technicians" value={totals.people} decimals={0}
              footnote={`Across ${totals.days} days on shift`}
            />
            <MetricTile
              label="Readings taken" value={totals.readings} decimals={0}
              footnote="Every logged round in this period"
            />
            <MetricTile
              label="Answered NA" value={totals.naRate * 100} decimals={1} unit="%"
              footnote="Site average across everyone"
            />
            <MetricTile
              label="Entered as zero" value={totals.zeroRate * 100} decimals={1} unit="%"
              status={totals.zeroRate > 0.05 ? "warn" : null}
              footnote="Site average across everyone"
            />
          </div>

          {/* What the table does and does not mean. Placed ABOVE it, because a
              caveat underneath is a caveat nobody reads. */}
          <div className="flex gap-3 rounded-2xl border border-info-100 bg-info-50/60 px-4 py-3 text-[12px] font-medium leading-relaxed text-info-900">
            <Users size={15} className="mt-0.5 shrink-0 text-info-600" />
            <p>
              <strong className="font-black">Readings taken is a roster count, not a score.</strong>{" "}
              The spread between the busiest and quietest technician here is almost
              entirely a difference in days on shift. The two rate columns are the
              comparable ones — everybody walks the same rooms and reads the same
              assets, so those can fairly be set side by side.
            </p>
          </div>

          {spread && (
            <div className="flex gap-3 rounded-2xl border border-warn-100 bg-warn-50/60 px-4 py-3 text-[12px] font-medium leading-relaxed text-warn-900">
              <AlertCircle size={15} className="mt-0.5 shrink-0 text-warn-600" />
              <p>
                Zeros range from{" "}
                <strong className="font-black">{pct(spread.best.zeroRate)}</strong> of numeric
                readings ({spread.best.technician_name}) to{" "}
                <strong className="font-black">{pct(spread.worst.zeroRate)}</strong>{" "}
                ({spread.worst.technician_name}) — a {spread.ratio.toFixed(1)}-fold difference
                on the same rounds and the same instruments. The low end is the useful part:
                it shows the round can be completed that way, so the higher rates are worth
                asking about rather than accepting as normal.
              </p>
            </div>
          )}

          <StatTable
            rows={rows}
            rowKey={(r) => r.technician_id}
            rowTone={(r) =>
              totals.zeroRate > 0 && r.zeroRate > totals.zeroRate * 1.5 && r.n_numeric >= 200
                ? "warn" : "none"}
            columns={[
              { key: "name", header: "Technician",
                render: (r: TechnicianRow) => (
                  <span className="font-bold text-neutral-900">
                    {r.technician_name ?? "Unattributed"}
                  </span>
                ) },
              { key: "readings", header: "Readings", numeric: true,
                render: (r) => r.n_readings.toLocaleString() },
              { key: "days", header: "Days", numeric: true,
                render: (r) => r.n_days.toLocaleString() },
              { key: "perday", header: "Per day", numeric: true,
                render: (r) => <Num value={r.perDay} decimals={0} /> },
              { key: "assets", header: "Assets", numeric: true,
                render: (r) => r.n_assets.toLocaleString() },
              { key: "na", header: "NA", numeric: true, width: "130px",
                render: (r) => <RateBar value={r.naRate} average={totals.naRate} /> },
              { key: "zero", header: "Zero", numeric: true, width: "130px",
                render: (r) => <RateBar value={r.zeroRate} average={totals.zeroRate} /> },
              { key: "last", header: "Last seen",
                render: (r) => (
                  <span className="font-mono text-[11px] text-neutral-500">
                    {r.last_seen
                      ? new Date(r.last_seen).toLocaleDateString(undefined,
                          { day: "numeric", month: "short" })
                      : "—"}
                  </span>
                ) }
            ]}
          />

          <footer className="hidden border-t border-neutral-300 pt-3 text-[10px] font-semibold text-neutral-500 print:block">
            Technician activity · {range.label} · {totals.people} technicians ·
            {" "}{totals.readings.toLocaleString()} readings ·
            {" "}Printed {new Date().toLocaleString()}
          </footer>
        </>
      )}
    </div>
  );
}

export default TechnicianAnalytics;
