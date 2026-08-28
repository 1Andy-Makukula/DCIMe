import { useMemo, useState } from "react";
import { useParams, useOutletContext, Link } from "react-router";
import {
  ThermometerSnowflake, Zap, Fuel, Battery, PlugZap, Server, ShieldCheck,
  Printer, ArrowLeft, Users
} from "lucide-react";
import { MetricTile, StatusPill, TrendChart, StatTable, Num } from "@/shared/ui";
import { SERIES } from "@/shared/theme/palette";
import { categoryById, humanise } from "@/domain/categories";
import { readingStatus, STATUS_TONE, type ReadingStatus } from "@/domain/readingStatus";
import type { SeriesPoint, Grain } from "@/domain/series";
import { useCategoryDetail } from "../hooks/useCategoryDetail";
import { useCurrentSite } from "@/shared/context/SiteContext";
import type { AnalyticsOutletContext } from "./AnalyticsLayout";

// ─────────────────────────────────────────────────────────────────────────────
// One category, in full.
//
// The screen answers four questions in the order somebody actually asks them:
//
//   NOW          what is it, and is that acceptable
//   OVER TIME    what has it been doing
//   BY PLACE     which room or machine is responsible
//   IN WORDS     what all that amounts to, written out
//   ON THE RECORD  every reading behind it, and who took it
//
// The register at the bottom is the point of the other four. A summary that
// cannot be traced back to a named technician and a timestamp is a claim, not a
// record — and this is a signed compliance document.
//
// One component serves every category. The categories differ in which assets
// they cover and what they are called; they do not differ in what a person
// wants to know, so seven near-identical screens would be seven places to fix
// the same bug.
// ─────────────────────────────────────────────────────────────────────────────

const ICONS: Record<string, typeof Zap> = {
  ThermometerSnowflake, Zap, Fuel, Battery, PlugZap, Server, ShieldCheck
};

const GRAINS: { value: Grain; label: string }[] = [
  { value: "hour",  label: "Hourly" },
  { value: "day",   label: "Daily" },
  { value: "week",  label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "year",  label: "Yearly" }
];

/**
 * How many lines a chart can carry before it stops being readable.
 *
 * Grouping thermal by asset yields 27 air conditioners. Twenty-seven lines over
 * eight available colours is not a chart, it is a plaid — and the table below
 * shows every one of them properly anyway. The busiest are drawn and the rest
 * are counted, so nothing is hidden without saying so.
 */
const MAX_CHART_SERIES = 8;

/** Series rows → one row per bucket, one column per room or asset. */
function pivot(points: SeriesPoint[], groupBy: "room" | "asset") {
  const keyOf = (p: SeriesPoint) =>
    groupBy === "room"
      ? (p.room_name ?? "Unassigned")
      : (p.equipment_id ?? "Unknown");

  const buckets = new Map<string, Record<string, unknown>>();
  const weight = new Map<string, number>();

  for (const p of points) {
    const k = keyOf(p);
    weight.set(k, (weight.get(k) ?? 0) + p.n_numeric);
    let row = buckets.get(p.bucket);
    if (!row) { row = { bucket: p.bucket }; buckets.set(p.bucket, row); }
    row[k] = p.avg_num === null ? null : Math.round(p.avg_num * 10) / 10;
  }

  const ranked = [...weight.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k]) => k);

  const rows = [...buckets.values()].sort(
    (a, b) => new Date(a.bucket as string).getTime() - new Date(b.bucket as string).getTime()
  );

  return {
    rows,
    keys: ranked.slice(0, MAX_CHART_SERIES),
    hidden: Math.max(0, ranked.length - MAX_CHART_SERIES)
  };
}

function formatBucket(iso: string, grain: Grain): string {
  const d = new Date(iso);
  switch (grain) {
    case "hour":  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    case "day":   return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    // Labelled by the Monday it starts on. date_trunc('week') is ISO-8601, so
    // "w/c 4 Aug" is literally the bucket's own date rather than a rounding of it.
    case "week":  return "w/c " + d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    case "month": return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
    case "year":  return String(d.getFullYear());
  }
}

/** Weighted mean across buckets — never the mean of the bucket means. */
function weightedAvg(points: SeriesPoint[]): number | null {
  let sum = 0, n = 0;
  for (const p of points) {
    if (p.avg_num === null || p.n_numeric === 0) continue;
    sum += p.avg_num * p.n_numeric;
    n += p.n_numeric;
  }
  return n > 0 ? sum / n : null;
}

/**
 * Remounts on every category change.
 *
 * The measure, grouping and room filter are all chosen relative to ONE
 * category. Moving from Temperature to Generators reuses this component —
 * same route, different param — so a useState initialiser reading
 * category.defaultGroupBy would never run again, and Generators would open
 * grouped by room, filtered to a room that has no generators in it. Keying on
 * the id resets the lot, which is what changing subject should do.
 */
export function CategoryDetail() {
  const { categoryId } = useParams();
  return <CategoryDetailView key={categoryId ?? "none"} categoryId={categoryId} />;
}

function CategoryDetailView({ categoryId }: { categoryId: string | undefined }) {
  const { range } = useOutletContext<AnalyticsOutletContext>();
  const { currentSite } = useCurrentSite();

  const category = categoryId ? categoryById(categoryId) : undefined;

  const [measure, setMeasure]   = useState<string | null>(null);
  const [grain, setGrain]       = useState<Grain | null>(null);
  const [roomId, setRoomId]     = useState<string | null>(null);
  const [groupBy, setGroupBy]   = useState<"room" | "asset">(
    category?.defaultGroupBy ?? "asset");

  const detail = useCategoryDetail({
    siteUuid: currentSite?.id ?? null,
    category: category ?? null,
    from: range.start,
    to: range.end,
    periodLabel: range.label,
    measure,
    grain,
    groupBy,
    roomId
  });

  const { choices, selected, series, raw, narrative, rooms, isLoading, error } = detail;
  const unit = selected?.unit ?? null;

  // ── The headline figures ──────────────────────────────────────────────────
  const summary = useMemo(() => {
    const avg = weightedAvg(series);
    const highs = series.filter((p) => p.max_num !== null).map((p) => p.max_num as number);
    const lows  = series.filter((p) => p.min_num !== null).map((p) => p.min_num as number);
    return {
      avg,
      peak:  highs.length ? Math.max(...highs) : null,
      floor: lows.length  ? Math.min(...lows)  : null,
      readings: series.reduce((a, p) => a + p.n_numeric, 0),
      breaches: series.reduce((a, p) => a + p.n_breach, 0),
      warns:    series.reduce((a, p) => a + p.n_warn, 0),
      zeros:    series.reduce((a, p) => a + (p.n_zero ?? 0), 0),
      nas:      series.reduce((a, p) => a + p.n_na, 0)
    };
  }, [series]);

  const overallStatus: ReadingStatus =
    summary.breaches > 0 ? "breach"
    : summary.warns > 0  ? "warn"
    : (selected && (selected.min !== null || selected.max !== null ||
                    selected.warnMin !== null || selected.warnMax !== null)) ? "ok"
    : "unknown";

  const { rows: chartRows, keys: chartKeys, hidden: chartHidden } = useMemo(
    () => pivot(series, groupBy), [series, groupBy]);

  const chartData = useMemo(
    () => chartRows.map((r) => ({
      ...r,
      label: formatBucket(r.bucket as string, detail.grain)
    })),
    [chartRows, detail.grain]
  );

  // ── Per room or per asset, for the breakdown table ────────────────────────
  const breakdown = useMemo(() => {
    const byKey = new Map<string, {
      key: string; label: string; sum: number; n: number;
      min: number | null; max: number | null; warns: number; breaches: number;
    }>();

    for (const p of series) {
      const key = groupBy === "room"
        ? (p.room_id ?? "unassigned")
        : (p.equipment_id ?? "unknown");
      const label = groupBy === "room"
        ? (p.room_name ?? "Unassigned")
        : humanise(p.equipment_id ?? "Unknown");

      let row = byKey.get(key);
      if (!row) {
        row = { key, label, sum: 0, n: 0, min: null, max: null, warns: 0, breaches: 0 };
        byKey.set(key, row);
      }
      if (p.avg_num !== null && p.n_numeric > 0) {
        row.sum += p.avg_num * p.n_numeric;
        row.n   += p.n_numeric;
      }
      if (p.min_num !== null) row.min = row.min === null ? p.min_num : Math.min(row.min, p.min_num);
      if (p.max_num !== null) row.max = row.max === null ? p.max_num : Math.max(row.max, p.max_num);
      row.warns    += p.n_warn;
      row.breaches += p.n_breach;
    }

    return [...byKey.values()]
      .map((r) => ({ ...r, avg: r.n > 0 ? r.sum / r.n : null }))
      .sort((a, b) => (b.avg ?? -Infinity) - (a.avg ?? -Infinity));
  }, [series, groupBy]);

  if (!category) {
    return (
      <div className="p-10 text-center">
        <p className="text-sm font-black text-neutral-900">No such category.</p>
        <Link to="/admin/analytics/summary"
              className="mt-2 inline-block text-xs font-bold text-brand-600 hover:underline">
          Back to the summary
        </Link>
      </div>
    );
  }

  const Icon = ICONS[category.icon] ?? Zap;

  return (
    <div className="p-6 space-y-6 bg-neutral-50/50 min-h-screen text-neutral-800 print:bg-white print:p-0">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-4 rounded-3xl border border-neutral-100 bg-white p-5 shadow-sm print:rounded-none print:border-0 print:shadow-none print:p-0">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600 print:hidden">
              <Icon size={20} />
            </span>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                {range.label}
              </span>
              <h2 className="mt-0.5 text-lg font-black uppercase tracking-tight text-neutral-900">
                {category.label}
              </h2>
              <p className="mt-1 text-[11px] font-semibold text-neutral-500">{category.blurb}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <Link
              to="/admin/analytics/summary"
              className="flex h-9 items-center gap-1.5 rounded-xl border border-neutral-200 px-3 text-[11px] font-black uppercase tracking-wider text-neutral-500 transition-colors hover:bg-neutral-50"
            >
              <ArrowLeft size={13} /> Back
            </Link>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex h-9 items-center gap-1.5 rounded-xl bg-neutral-900 px-3.5 text-[11px] font-black uppercase tracking-wider text-white transition-colors hover:bg-neutral-700"
            >
              <Printer size={13} /> Print
            </button>
          </div>
        </div>

        {/* Controls. Hidden in print — what was selected is already visible in
            the figures below, and a printed dropdown is just clutter. */}
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <select
            value={selected?.measure ?? ""}
            onChange={(e) => setMeasure(e.target.value || null)}
            className="h-9 rounded-xl border border-neutral-200 bg-white px-3 text-[11px] font-bold text-neutral-700 outline-none focus:border-brand-400"
          >
            {choices.map((c) => (
              <option key={c.measure} value={c.measure}>
                {c.label}
                {c.assetCount > 1 ? ` · ${c.assetCount} assets` : ""}
                {/* The count is what tells a reader which entries are worth
                    opening. Without it every measure looks equally populated
                    and most of them are not. */}
                {c.captured > 0 ? ` · ${c.captured.toLocaleString()} readings` : " · no data"}
                {c.constantOnly ? " · setpoint" : ""}
              </option>
            ))}
          </select>

          <div className="flex rounded-xl border border-neutral-200 bg-white p-0.5">
            {GRAINS.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => setGrain(g.value)}
                className={`rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider transition-colors ${
                  detail.grain === g.value
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-400 hover:text-neutral-700"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>

          <div className="flex rounded-xl border border-neutral-200 bg-white p-0.5">
            {(["room", "asset"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGroupBy(g)}
                className={`rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider transition-colors ${
                  groupBy === g
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-400 hover:text-neutral-700"
                }`}
              >
                By {g}
              </button>
            ))}
          </div>

          {rooms.length > 1 && (
            <select
              value={roomId ?? ""}
              onChange={(e) => setRoomId(e.target.value || null)}
              className="h-9 rounded-xl border border-neutral-200 bg-white px-3 text-[11px] font-bold text-neutral-700 outline-none focus:border-brand-400"
            >
              <option value="">Every room</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          )}
        </div>
      </header>

      {error && (
        <div className="rounded-2xl border border-danger-200 bg-danger-50 p-4 text-[12px] font-bold text-danger-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="rounded-3xl border border-neutral-100 bg-white p-10 text-center text-[12px] font-bold text-neutral-400 shadow-sm">
          Loading {category.label}…
        </div>
      ) : !selected ? (
        <div className="rounded-3xl border border-dashed border-neutral-200 p-10 text-center">
          {/* Labels are not lowercased anywhere: "IT Load" and "UPS" become
              "it load" and "ups", which reads as a typo rather than a sentence. */}
          <p className="text-sm font-black text-neutral-900">
            Nothing is registered under {category.label} yet.
          </p>
          <p className="mt-1 text-[12px] font-semibold text-neutral-500">
            Add equipment and its parameters in Inventory and readings will appear here.
          </p>
        </div>
      ) : (
        <>
          {/* ── NOW ──────────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <SectionTitle
              eyebrow="Now"
              title={selected.label}
              aside={<StatusPill status={overallStatus} />}
            />
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              <MetricTile
                label="Average" value={summary.avg} unit={unit} status={overallStatus}
                footnote={`${summary.readings.toLocaleString()} readings`}
              />
              <MetricTile
                label="Minimum" value={summary.floor} unit={unit}
                footnote={`Lowest in ${range.label.toLowerCase()}`}
              />
              <MetricTile
                label="Maximum" value={summary.peak} unit={unit}
                footnote={`Highest in ${range.label.toLowerCase()}`}
              />
              <MetricTile
                label="Breaches" value={summary.breaches} decimals={0}
                status={summary.breaches > 0 ? "breach" : null}
                footnote={summary.warns > 0 ? `${summary.warns} in the warning band` : "Outside the limits"}
              />
              <MetricTile
                label={groupBy === "room" ? "Rooms" : "Assets"}
                value={breakdown.length} decimals={0}
                footnote={selected.assetCount > 1
                  ? `${selected.assetCount} record this`
                  : "Single source"}
              />
            </div>

            {/* Data-quality note. Only shown when there is something to say —
                a permanent green "data is fine" banner teaches people to
                ignore the space it occupies. */}
            {(summary.zeros > 0 || summary.nas > 0) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-warn-100 bg-warn-50/60 px-4 py-2.5 text-[11px] font-semibold text-warn-800">
                {summary.zeros > 0 && (
                  <span>
                    <strong className="font-black">{summary.zeros.toLocaleString()}</strong> readings
                    were exactly zero
                    {summary.readings > 0 && ` (${Math.round((summary.zeros / summary.readings) * 100)}%)`}
                  </span>
                )}
                {summary.nas > 0 && (
                  <span>
                    <strong className="font-black">{summary.nas.toLocaleString()}</strong> answered
                    “not available”
                  </span>
                )}
              </div>
            )}
          </section>

          {/* ── OVER TIME ────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <SectionTitle
              eyebrow="Over time"
              title={`${selected.label} by ${groupBy}`}
              aside={
                <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                  {GRAINS.find((g) => g.value === detail.grain)?.label}
                </span>
              }
            />
            <div className="rounded-3xl border border-neutral-100 bg-white p-5 shadow-sm print:border-neutral-300 print:shadow-none">
              <TrendChart
                data={chartData}
                xKey="label"
                unit={unit}
                height={380}
                band={{
                  min: selected.min, max: selected.max,
                  warnMin: selected.warnMin, warnMax: selected.warnMax
                }}
                series={chartKeys.map((k, i) => ({
                  key: k, name: k, color: SERIES[i % SERIES.length]
                }))}
              />
              {chartHidden > 0 && (
                <p className="mt-3 text-[11px] font-semibold text-neutral-400">
                  Showing the {chartKeys.length} busiest of {chartKeys.length + chartHidden}{" "}
                  {groupBy === "room" ? "rooms" : "assets"}. Every one of them is in the
                  table below.
                </p>
              )}
            </div>
          </section>

          {/* ── BY PLACE ─────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <SectionTitle
              eyebrow="Interpreted"
              title={groupBy === "room" ? "Per room" : "Per asset"}
            />
            <StatTable
              rows={breakdown}
              rowKey={(r) => r.key}
              rowTone={(r) => r.breaches > 0 ? "breach" : r.warns > 0 ? "warn" : "none"}
              columns={[
                { key: "name", header: groupBy === "room" ? "Room" : "Asset",
                  render: (r) => <span className="font-bold text-neutral-900">{r.label}</span> },
                { key: "avg", header: "Average", numeric: true,
                  render: (r) => <Num value={r.avg} unit={unit} /> },
                { key: "min", header: "Minimum", numeric: true,
                  render: (r) => <Num value={r.min} unit={unit} /> },
                { key: "max", header: "Maximum", numeric: true,
                  render: (r) => <Num value={r.max} unit={unit} /> },
                { key: "n", header: "Readings", numeric: true,
                  render: (r) => r.n.toLocaleString() },
                { key: "status", header: "Status", width: "120px",
                  render: (r) => (
                    <StatusPill status={
                      r.breaches > 0 ? "breach"
                      : r.warns > 0  ? "warn"
                      : overallStatus === "unknown" ? "unknown" : "ok"
                    } />
                  ) }
              ]}
            />
          </section>

          {/* ── IN WORDS ─────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <SectionTitle eyebrow="In words" title="What the period shows" />
            <div className="space-y-2.5 rounded-3xl border border-neutral-100 bg-white p-5 shadow-sm print:border-neutral-300 print:shadow-none">
              {narrative.map((para, i) => (
                <p
                  key={i}
                  className={`border-l-2 pl-3 text-[13px] font-medium leading-relaxed ${
                    para.tone === "breach" ? "border-danger-400 text-neutral-800"
                    : para.tone === "warn" ? "border-warn-400 text-neutral-800"
                    : para.tone === "ok"   ? "border-ok-400 text-neutral-700"
                    : "border-neutral-200 text-neutral-500"
                  }`}
                >
                  {para.text}
                </p>
              ))}
            </div>
          </section>

          {/* ── ON THE RECORD ────────────────────────────────────────────── */}
          <section className="space-y-3">
            <SectionTitle
              eyebrow="On the record"
              title="Every reading, and who took it"
              aside={
                <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                  <Users size={12} />
                  {new Set(raw.map((r) => r.technician_name).filter(Boolean)).size} technicians
                </span>
              }
            />
            {raw.length >= 2000 && (
              <p className="text-[11px] font-bold text-neutral-400">
                Showing the most recent 2,000 readings. Narrow the period to see the rest.
              </p>
            )}
            <StatTable
              maxHeight={520}
              rows={raw}
              rowKey={(r) => `${r.target_hour}|${r.equipment_id}|${r.parameter_name}`}
              rowTone={(r) => {
                const s = readingStatus(r.value_num, selected.min, selected.max,
                                        selected.warnMin, selected.warnMax);
                return s === "breach" ? "breach" : s === "warn" ? "warn" : "none";
              }}
              emptyMessage="No readings were recorded for this measure in this period."
              columns={[
                { key: "when", header: "When", width: "160px",
                  render: (r) => (
                    <span className="font-mono text-[11px] text-neutral-600">
                      {new Date(r.target_hour).toLocaleString(undefined, {
                        day: "2-digit", month: "short",
                        hour: "2-digit", minute: "2-digit"
                      })}
                    </span>
                  ) },
                { key: "asset", header: "Asset",
                  render: (r) => (
                    <span className="font-bold text-neutral-900">{humanise(r.equipment_id)}</span>
                  ) },
                { key: "value", header: "Reading", numeric: true, width: "110px",
                  render: (r) => r.value_num !== null
                    ? <Num value={r.value_num} unit={unit} />
                    : <span className="text-neutral-400">{r.value_text ?? "—"}</span> },
                { key: "status", header: "", width: "40px",
                  render: (r) => {
                    const s = readingStatus(r.value_num, selected.min, selected.max,
                                            selected.warnMin, selected.warnMax);
                    if (!s || s === "unknown") return null;
                    return (
                      <span
                        title={STATUS_TONE[s].label}
                        className={`inline-block h-2 w-2 rounded-full ${STATUS_TONE[s].solid}`}
                      />
                    );
                  } },
                { key: "who", header: "Technician",
                  render: (r) => r.technician_name
                    ? <span className="font-semibold text-neutral-700">{r.technician_name}</span>
                    : <span className="text-neutral-300">Unattributed</span> }
              ]}
            />
          </section>

          {/* Printed footer: a report that cannot say what it covers is not
              evidence of anything. */}
          <footer className="hidden border-t border-neutral-300 pt-3 text-[10px] font-semibold text-neutral-500 print:block">
            {category.label} · {selected.label} · {range.label} ·
            {" "}{summary.readings.toLocaleString()} readings ·
            {" "}Printed {new Date().toLocaleString()}
          </footer>
        </>
      )}
    </div>
  );
}

function SectionTitle({ eyebrow, title, aside }: {
  eyebrow: string; title: string; aside?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
          {eyebrow}
        </span>
        <h3 className="text-sm font-black uppercase tracking-tight text-neutral-900">{title}</h3>
      </div>
      {aside}
    </div>
  );
}

export default CategoryDetail;
