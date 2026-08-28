import { useMemo, useState } from "react";
import { Link, useParams, useOutletContext } from "react-router";
import { ArrowLeft, Boxes, AlertTriangle, Printer, ChevronRight } from "lucide-react";
import {
  MetricTile, StatusPill, TrendChart, StatTable, Num, FreshnessPill
} from "@/shared/ui";
import { AssetModelThumb } from "@/shared/ui/model";
import { SERIES } from "@/shared/theme/palette";
import { humanise } from "@/domain/categories";
import { readingStatus, type ReadingStatus } from "@/domain/readingStatus";
import { defaultGrain } from "../hooks/useCategoryDetail";
import type { SeriesPoint, Grain } from "@/domain/series";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { useRoomDetail } from "../hooks/useRoomDetail";
import { useSiteFreshness } from "../hooks/useSiteFreshness";
import type { AnalyticsOutletContext } from "./AnalyticsLayout";

// ─────────────────────────────────────────────────────────────────────────────
// Level 2: one room, every machine in it, on one axis.
//
// THE ROOM AVERAGE IS THE THING THAT HIDES THE FAULT
// A room sitting at 24 °C is either three units at 24, or two at 21 and one at
// 30 about to fail. Those are the same number and completely different
// mornings. So the aggregate is never shown alone: the spread between the
// coolest and the hottest unit is stated beside it, and every unit is drawn.
//
// "Highest average" and "highest reading" are deliberately separate figures.
// One says which machine runs hot all the time — a sizing or a servicing
// problem. The other says the worst moment anything reached — an event. A
// single "maximum" would blur the two, and they are answered by different
// people.
// ─────────────────────────────────────────────────────────────────────────────

const GRAINS: { value: Grain; label: string }[] = [
  { value: "hour",  label: "Hourly" },
  { value: "day",   label: "Daily" },
  { value: "week",  label: "Weekly" },
  { value: "month", label: "Monthly" }
];

function formatBucket(iso: string, grain: Grain): string {
  const d = new Date(iso);
  switch (grain) {
    case "hour":  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    case "day":   return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    case "week":  return "w/c " + d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    case "month": return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
    case "year":  return String(d.getFullYear());
  }
}

/** Series rows → one row per bucket, one column per machine. */
function pivot(points: SeriesPoint[]) {
  const buckets = new Map<string, Record<string, unknown>>();
  const keys = new Set<string>();

  for (const p of points) {
    const k = p.equipment_id ?? "Unknown";
    keys.add(k);
    let row = buckets.get(p.bucket);
    if (!row) { row = { bucket: p.bucket }; buckets.set(p.bucket, row); }
    row[k] = p.avg_num === null ? null : Math.round(p.avg_num * 10) / 10;
  }

  const rows = [...buckets.values()].sort(
    (a, b) => new Date(a.bucket as string).getTime() - new Date(b.bucket as string).getTime()
  );
  return { rows, keys: [...keys] };
}

export function RoomDetail() {
  const { roomId } = useParams();
  const { range } = useOutletContext<AnalyticsOutletContext>();
  const { currentSite } = useCurrentSite();

  const [measure, setMeasure] = useState<string | null>(null);
  const [grain, setGrain]     = useState<Grain | null>(null);
  // Which machine is being followed. Null draws them all at equal weight.
  const [emphasis, setEmphasis] = useState<string | null>(null);

  const activeGrain = grain ?? defaultGrain(range.start, range.end);

  const { measures, selected, series, raw, isLoading, error } = useRoomDetail({
    siteUuid: currentSite?.id ?? null,
    roomId:   roomId ?? null,
    from:     range.start,
    to:       range.end,
    grain:    activeGrain,
    measure
  });

  // Condition, freshness and the model for each machine — the same spine the
  // overview uses, filtered to this room rather than fetched again.
  const { rooms } = useSiteFreshness();
  const room = useMemo(() => rooms.find((r) => r.id === roomId), [rooms, roomId]);

  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of room?.assets ?? []) map.set(a.equipmentId, a.name);
    return (id: string) => map.get(id) ?? humanise(id);
  }, [room]);

  const unit = selected?.unit ?? null;
  const { rows: chartRows, keys } = useMemo(() => pivot(series), [series]);

  const chartData = useMemo(
    () => chartRows.map((r) => ({ ...r, label: formatBucket(r.bucket as string, activeGrain) })),
    [chartRows, activeGrain]
  );

  // ── Per machine ───────────────────────────────────────────────────────────
  const perAsset = useMemo(() => {
    const byId = new Map<string, {
      id: string; sum: number; n: number;
      min: number | null; max: number | null; warns: number; breaches: number;
    }>();

    for (const p of series) {
      const id = p.equipment_id ?? "unknown";
      let row = byId.get(id);
      if (!row) {
        row = { id, sum: 0, n: 0, min: null, max: null, warns: 0, breaches: 0 };
        byId.set(id, row);
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

    return [...byId.values()]
      .map((r) => ({ ...r, name: nameOf(r.id), avg: r.n > 0 ? r.sum / r.n : null }))
      .sort((a, b) => (b.avg ?? -Infinity) - (a.avg ?? -Infinity));
  }, [series, nameOf]);

  // ── The room as a whole ───────────────────────────────────────────────────
  const roomStats = useMemo(() => {
    // Weighted across readings, never the mean of the machine means: a unit
    // read twice must not count as much as one read two hundred times.
    let sum = 0, n = 0;
    for (const p of series) {
      if (p.avg_num === null || p.n_numeric === 0) continue;
      sum += p.avg_num * p.n_numeric;
      n   += p.n_numeric;
    }
    const averages = perAsset.map((a) => a.avg).filter((v): v is number => v !== null);
    const highs    = perAsset.map((a) => a.max).filter((v): v is number => v !== null);
    const lows     = perAsset.map((a) => a.min).filter((v): v is number => v !== null);

    const hottest = perAsset.find((a) => a.avg !== null && a.avg === Math.max(...averages));
    const coolest = perAsset.find((a) => a.avg !== null && a.avg === Math.min(...averages));

    return {
      avg:        n > 0 ? sum / n : null,
      highestAvg: averages.length ? Math.max(...averages) : null,
      lowestAvg:  averages.length ? Math.min(...averages) : null,
      peak:       highs.length ? Math.max(...highs) : null,
      floor:      lows.length ? Math.min(...lows) : null,
      spread:     averages.length > 1 ? Math.max(...averages) - Math.min(...averages) : null,
      hottest:    hottest?.name ?? null,
      coolest:    coolest?.name ?? null,
      readings:   series.reduce((a, p) => a + p.n_numeric, 0),
      breaches:   series.reduce((a, p) => a + p.n_breach, 0),
      warns:      series.reduce((a, p) => a + p.n_warn, 0)
    };
  }, [series, perAsset]);

  const overall: ReadingStatus =
    roomStats.breaches > 0 ? "breach"
    : roomStats.warns > 0  ? "warn"
    : selected && (selected.min !== null || selected.max !== null) ? "ok"
    : "unknown";

  const colourOf = useMemo(() => {
    const map = new Map<string, string>();
    keys.forEach((k, i) => map.set(k, SERIES[i % SERIES.length]));
    return map;
  }, [keys]);

  if (error) {
    return (
      <div className="flex min-h-[20rem] flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle size={22} className="text-danger-500" />
        <p className="text-[13px] font-bold text-neutral-800">Could not load this room</p>
        <p className="max-w-md text-[12px] text-neutral-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen space-y-6 bg-neutral-50/50 p-6 text-neutral-800 print:bg-white print:p-0">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-4 rounded-3xl border border-neutral-100 bg-white p-5 shadow-sm print:rounded-none print:border-0 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
              {range.label} · Room
            </span>
            <h2 className="mt-0.5 text-lg font-black uppercase tracking-tight text-neutral-900">
              {room?.name ?? "Room"}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-neutral-500">
              {room ? `${room.assets.length} machines` : "Loading…"}
              {room && (
                <FreshnessPill
                  freshness={room.freshness}
                  lastReading={room.lastReading}
                  withAge
                  showWhenLive
                />
              )}
              {room && room.partialCount > 0 && (
                <span className="rounded-full border border-warn-200 bg-warn-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-warn-700">
                  {room.partialCount} partial last round
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <Link
              to="/admin/analytics/facility"
              className="flex h-9 items-center gap-1.5 rounded-xl border border-neutral-200 px-3 text-[11px] font-black uppercase tracking-wider text-neutral-500 transition-colors hover:bg-neutral-50"
            >
              <ArrowLeft size={13} /> Facility
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

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <select
            value={selected?.measure ?? ""}
            onChange={(e) => { setMeasure(e.target.value || null); setEmphasis(null); }}
            className="h-9 rounded-xl border border-neutral-200 bg-white px-3 text-[11px] font-bold text-neutral-700 outline-none focus:border-brand-400"
          >
            {measures.map((m) => (
              <option key={m.measure} value={m.measure}>
                {m.label}
                {m.assetCount > 1 ? ` · ${m.assetCount} machines` : ""}
                {m.constantOnly ? " · setpoint" : ""}
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
                  activeGrain === g.value
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-400 hover:text-neutral-700"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── The machines in here ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionTitle eyebrow="In this room" title="Machines" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {(room?.assets ?? []).map((a) => (
            <Link
              key={a.equipmentId}
              to={`/admin/analytics/facility/asset/${encodeURIComponent(a.equipmentId)}`}
              onMouseEnter={() => setEmphasis(a.equipmentId)}
              onMouseLeave={() => setEmphasis(null)}
              className="group flex items-center gap-2.5 rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm transition-colors hover:border-neutral-300"
            >
              <AssetModelThumb
                model={a.model}
                size={44}
                fallback={
                  <span className="grid h-11 w-11 place-items-center rounded-lg bg-neutral-100 text-neutral-400">
                    <Boxes size={16} />
                  </span>
                }
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-black text-neutral-900">{a.name}</p>
                <p className="truncate font-mono text-[9px] uppercase tracking-wider text-neutral-400">
                  {a.coveredLastRound !== null && a.typicalRound !== null
                    ? `${a.coveredLastRound}/${a.typicalRound} of round`
                    : humanise(a.category)}
                </p>
                <div className="mt-1 flex items-center gap-1">
                  {/* The line colour, so a card and its curve are the same thing. */}
                  <span
                    className="h-1.5 w-4 rounded-full"
                    style={{ background: colourOf.get(a.equipmentId) ?? "var(--color-neutral-300)" }}
                    aria-hidden="true"
                  />
                  <FreshnessPill freshness={a.freshness} lastReading={a.lastReading} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── The room as a whole ──────────────────────────────────────────── */}
      {selected && (
        <section className="space-y-3">
          <SectionTitle
            eyebrow="Together"
            title={selected.label}
            aside={<StatusPill status={overall} />}
          />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <MetricTile
              label="Room average" value={roomStats.avg} unit={unit} status={overall}
              footnote={`${roomStats.readings.toLocaleString()} readings`}
            />
            <MetricTile
              label="Highest average" value={roomStats.highestAvg} unit={unit}
              footnote={roomStats.hottest ? `${roomStats.hottest} runs highest` : "Per machine"}
            />
            <MetricTile
              label="Lowest average" value={roomStats.lowestAvg} unit={unit}
              footnote={roomStats.coolest ? `${roomStats.coolest} runs lowest` : "Per machine"}
            />
            <MetricTile
              label="Peak reading" value={roomStats.peak} unit={unit}
              footnote="Worst single moment"
            />
            <MetricTile
              label="Spread" value={roomStats.spread} unit={unit}
              status={roomStats.spread !== null && roomStats.spread > 3 ? "warn" : null}
              footnote="Between the highest and lowest machine"
            />
          </div>

          {/* The averages agreeing is the interesting case as often as not. */}
          {roomStats.spread !== null && roomStats.spread > 3 && (
            <p className="rounded-2xl border border-warn-100 bg-warn-50/60 px-4 py-2.5 text-[11px] font-semibold text-warn-800">
              {roomStats.hottest} averages {roomStats.spread.toFixed(1)}{unit ? ` ${unit}` : ""} above
              {" "}{roomStats.coolest} over this period. Machines sharing a room and a duty are
              expected to track each other; a persistent gap is usually the machine, not the room.
            </p>
          )}
        </section>
      )}

      {/* ── Every machine, on one axis ───────────────────────────────────── */}
      {selected && (
        <section className="space-y-3">
          <SectionTitle
            eyebrow="Over time"
            title="Each machine"
            aside={
              emphasis && (
                <button
                  type="button"
                  onClick={() => setEmphasis(null)}
                  className="text-[10px] font-black uppercase tracking-widest text-neutral-500 hover:text-neutral-800"
                >
                  Show all
                </button>
              )
            }
          />

          {/* Our own legend: clicking isolates, and it lists every machine
              rather than only the ones the chart had room to name. */}
          <div className="flex flex-wrap gap-1.5 print:hidden">
            {keys.map((k) => {
              const on = emphasis === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setEmphasis(on ? null : k)}
                  aria-pressed={on}
                  className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-bold transition-colors ${
                    on
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  <span
                    className="h-1.5 w-3 rounded-full"
                    style={{ background: colourOf.get(k) }}
                    aria-hidden="true"
                  />
                  {nameOf(k)}
                </button>
              );
            })}
          </div>

          <div className="rounded-3xl border border-neutral-100 bg-white p-5 shadow-sm print:border-neutral-300 print:shadow-none">
            <TrendChart
              data={chartData}
              xKey="label"
              unit={unit}
              height={380}
              legend={false}
              emphasis={emphasis}
              band={{
                min: selected.min, max: selected.max,
                warnMin: selected.warnMin, warnMax: selected.warnMax
              }}
              series={keys.map((k) => ({
                key: k, name: nameOf(k), color: colourOf.get(k)
              }))}
              emptyMessage={
                isLoading ? "Loading readings…" : "No readings for this measure in this period."
              }
            />
          </div>
        </section>
      )}

      {/* ── Per machine, in figures ──────────────────────────────────────── */}
      {selected && (
        <section className="space-y-3">
          <SectionTitle eyebrow="Compared" title="Machine by machine" />
          <StatTable
            rows={perAsset}
            rowKey={(r) => r.id}
            rowTone={(r) => r.breaches > 0 ? "breach" : r.warns > 0 ? "warn" : "none"}
            columns={[
              {
                key: "name", header: "Machine",
                render: (r) => (
                  <Link
                    to={`/admin/analytics/facility/asset/${encodeURIComponent(r.id)}`}
                    className="flex items-center gap-2 font-bold text-neutral-900 hover:underline"
                  >
                    <span
                      className="h-1.5 w-3 shrink-0 rounded-full"
                      style={{ background: colourOf.get(r.id) }}
                      aria-hidden="true"
                    />
                    {r.name}
                    <ChevronRight size={12} className="text-neutral-300" />
                  </Link>
                )
              },
              { key: "avg", header: "Average", numeric: true,
                render: (r) => <Num value={r.avg} unit={unit} /> },
              { key: "min", header: "Minimum", numeric: true,
                render: (r) => <Num value={r.min} unit={unit} /> },
              { key: "max", header: "Maximum", numeric: true,
                render: (r) => <Num value={r.max} unit={unit} /> },
              { key: "n", header: "Readings", numeric: true,
                render: (r) => r.n.toLocaleString() },
              {
                key: "status", header: "Status", width: "110px",
                render: (r) => (
                  <StatusPill status={
                    r.breaches > 0 ? "breach"
                    : r.warns > 0  ? "warn"
                    : overall === "unknown" ? "unknown" : "ok"
                  } />
                )
              }
            ]}
          />
        </section>
      )}

      {/* ── The record ───────────────────────────────────────────────────── */}
      {selected && (
        <section className="space-y-3">
          <SectionTitle eyebrow="On the record" title="Every reading, and who took it" />
          <StatTable
            maxHeight={420}
            rows={raw}
            rowKey={(r) => `${r.target_hour}|${r.equipment_id}|${r.parameter_name}`}
            rowTone={(r) => {
              const s = readingStatus(r.value_num, selected.min, selected.max,
                                      selected.warnMin, selected.warnMax);
              return s === "breach" ? "breach" : s === "warn" ? "warn" : "none";
            }}
            emptyMessage="No readings were recorded in this room for this measure."
            columns={[
              {
                key: "when", header: "When", width: "150px",
                render: (r) => (
                  <span className="font-mono text-[11px] text-neutral-600">
                    {new Date(r.target_hour).toLocaleString(undefined, {
                      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
                    })}
                  </span>
                )
              },
              { key: "asset", header: "Machine",
                render: (r) => (
                  <span className="font-bold text-neutral-900">{nameOf(r.equipment_id)}</span>
                ) },
              { key: "value", header: "Reading", numeric: true, width: "110px",
                render: (r) => r.value_num !== null
                  ? <Num value={r.value_num} unit={unit} />
                  : <span className="text-neutral-400">{r.value_text ?? "—"}</span> },
              { key: "who", header: "Technician",
                render: (r) => r.technician_name
                  ? <span className="font-semibold text-neutral-700">{r.technician_name}</span>
                  : <span className="text-neutral-300">Unattributed</span> }
            ]}
          />
        </section>
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

export default RoomDetail;
