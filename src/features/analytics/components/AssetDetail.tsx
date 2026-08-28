import { useMemo, useState } from "react";
import { Link, useParams, useOutletContext } from "react-router";
import { ArrowLeft, Boxes, AlertTriangle, Printer, Wrench } from "lucide-react";
import {
  MetricTile, StatusPill, TrendChart, StatTable, Num, FreshnessPill
} from "@/shared/ui";
import { AssetModelView } from "@/shared/ui/model";
import { SERIES } from "@/shared/theme/palette";
import { humanise } from "@/domain/categories";
import { modelFor } from "@/domain/assetModels";
import { toneOfCategory } from "@/domain/wayfinding";
import { readingStatus, worstStatus, type ReadingStatus } from "@/domain/readingStatus";
import { CONDITION_TONE } from "@/shared/api/equipmentCondition";
import { AssetHistory } from "@/features/topology/components/AssetHistory";
import { defaultGrain } from "../hooks/useCategoryDetail";
import type { Grain } from "@/domain/series";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { useAssetDetail, type MeasureSummary } from "../hooks/useAssetDetail";
import { useSiteFreshness } from "../hooks/useSiteFreshness";
import type { AnalyticsOutletContext } from "./AnalyticsLayout";

// ─────────────────────────────────────────────────────────────────────────────
// Level 3: one machine, in full.
//
// This is where the three records that were never in the same place finally
// are: what it is reading now, what has been changed on it, and whether anyone
// has flagged it as faulty. registry_audit has been recording every limit
// change since it was built and AssetHistory was wired to nothing;
// equipment_condition knows a machine is DEGRADED and no analytics screen ever
// said so. A number, its provenance and the state of the thing that produced it
// belong on one page, because that is the set of facts somebody disputing a
// reading actually needs.
//
// The model is the only live canvas in the application. Everything else uses a
// rendered picture — see modelCache — because browsers discard WebGL contexts
// once a page holds too many.
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

/** A measure's verdict from what the database already counted. */
function verdictOf(s: MeasureSummary): ReadingStatus {
  if (s.breaches > 0) return "breach";
  if (s.warns > 0)    return "warn";
  const p = s.parameter;
  const banded = p.min !== null || p.max !== null || p.warnMin !== null || p.warnMax !== null;
  return s.readings > 0 && banded ? "ok" : "unknown";
}

export function AssetDetail() {
  const { equipmentId: raw } = useParams();
  const equipmentId = raw ? decodeURIComponent(raw) : null;
  const { range } = useOutletContext<AnalyticsOutletContext>();
  const { currentSite } = useCurrentSite();

  const [measure, setMeasure] = useState<string | null>(null);
  const [grain, setGrain]     = useState<Grain | null>(null);
  const activeGrain = grain ?? defaultGrain(range.start, range.end);

  const {
    identity, summaries, selected, series, raw: readings, isLoading, error
  } = useAssetDetail({
    siteUuid: currentSite?.id ?? null,
    equipmentId,
    from: range.start,
    to:   range.end,
    grain: activeGrain,
    measure
  });

  // Condition and freshness ride on the same spine the other levels use.
  const { all } = useSiteFreshness();
  const asset = useMemo(
    () => all.find((a) => a.equipmentId === equipmentId),
    [all, equipmentId]
  );

  const model = useMemo(
    () => modelFor(identity?.category ?? asset?.category ?? null),
    [identity, asset]
  );

  const domainTone = toneOfCategory(identity?.category ?? asset?.category ?? null);
  const unit = selected?.unit ?? null;

  const chartData = useMemo(
    () => series
      .slice()
      .sort((a, b) => new Date(a.bucket).getTime() - new Date(b.bucket).getTime())
      .map((p) => ({
        label: formatBucket(p.bucket, activeGrain),
        value: p.avg_num === null ? null : Math.round(p.avg_num * 100) / 100
      })),
    [series, activeGrain]
  );

  const selectedSummary = useMemo(
    () => summaries.find((s) => s.parameter.parameterName === selected?.parameterName) ?? null,
    [summaries, selected]
  );

  // The machine's overall state is the worst of anything it records — one
  // breached parameter makes the machine a breach, however calm the rest is.
  const overall = useMemo(
    () => worstStatus(summaries.filter((s) => s.readings > 0).map(verdictOf)) ?? "unknown",
    [summaries]
  );

  if (error) {
    return (
      <div className="flex min-h-[20rem] flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle size={22} className="text-danger-500" />
        <p className="text-[13px] font-bold text-neutral-800">Could not load this machine</p>
        <p className="max-w-md text-[12px] text-neutral-500">{error}</p>
      </div>
    );
  }

  const condition = asset?.condition;
  const tone = condition ? CONDITION_TONE[condition] : null;

  return (
    <div className="min-h-screen space-y-6 bg-neutral-50/50 p-6 text-neutral-800 print:bg-white print:p-0">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-neutral-100 bg-white p-5 shadow-sm print:rounded-none print:border-0 print:shadow-none">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
            {range.label} · {humanise(identity?.category ?? asset?.category ?? "")}
          </span>
          <h2 className="mt-0.5 text-lg font-black uppercase tracking-tight text-neutral-900">
            {identity?.name ?? asset?.name ?? equipmentId}
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-neutral-500">
            <span className="font-mono">{equipmentId}</span>
            {identity?.roomName && identity.roomId && (
              <>
                <span aria-hidden="true">·</span>
                <Link
                  to={`/admin/analytics/facility/room/${identity.roomId}`}
                  className="font-bold text-neutral-700 hover:underline"
                >
                  {identity.roomName}
                </Link>
              </>
            )}
            {asset && (
              <FreshnessPill
                freshness={asset.freshness}
                lastReading={asset.lastReading}
                withAge
                showWhenLive
              />
            )}
            {tone && (
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                tone.tone === "ok"      ? "border-ok-200 bg-ok-50 text-ok-700"
                : tone.tone === "warn"   ? "border-warn-200 bg-warn-50 text-warn-700"
                : tone.tone === "danger" ? "border-danger-200 bg-danger-50 text-danger-700"
                : "border-neutral-200 bg-neutral-50 text-neutral-500"
              }`}>
                {tone.label}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 print:hidden">
          <Link
            to={identity?.roomId
              ? `/admin/analytics/facility/room/${identity.roomId}`
              : "/admin/analytics/facility"}
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
      </header>

      {/* ── The machine, and where it stands ─────────────────────────────── */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
        <div className="print:hidden">
          <AssetModelView
            model={model}
            status={overall}
            height={260}
            fallback={
              <span className={`flex flex-col items-center gap-2 ${domainTone.icon}`}>
                <Boxes size={32} />
                <span className="text-[10px] font-black uppercase tracking-widest">
                  No model for this kind
                </span>
              </span>
            }
          />
          {asset?.lastTechnician && (
            <p className="mt-2 text-center text-[10px] font-semibold text-neutral-400">
              Last read by {asset.lastTechnician}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <MetricTile
            rail={domainTone.rail}
            label="Readings" value={selectedSummary?.readings ?? 0} decimals={0}
            footnote={selected?.label ?? "This period"}
          />
          <MetricTile
            rail={domainTone.rail}
            label="Average" value={selectedSummary?.avg ?? null} unit={unit}
            status={selectedSummary ? verdictOf(selectedSummary) : null}
            footnote="Across the period"
          />
          <MetricTile
            rail={domainTone.rail}
            label="Latest" value={selectedSummary?.latest ?? null} unit={unit}
            footnote={asset?.lastReading
              ? `Taken ${asset.lastReading.toLocaleString(undefined, {
                  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`
              : "Never read"}
          />
          <MetricTile
            rail={domainTone.rail}
            label="Minimum" value={selectedSummary?.min ?? null} unit={unit} />
          <MetricTile
            rail={domainTone.rail}
            label="Maximum" value={selectedSummary?.max ?? null} unit={unit} />
          <MetricTile
            rail={domainTone.rail}
            label="Round coverage"
            value={asset?.coveredLastRound ?? null} decimals={0}
            status={asset?.isPartial ? "warn" : null}
            footnote={asset?.typicalRound !== null && asset?.typicalRound !== undefined
              ? `of ${asset.typicalRound} normally taken`
              : "No history yet"}
          />
        </div>
      </section>

      {/* ── Everything this machine records ──────────────────────────────── */}
      <section className="space-y-3">
        <SectionTitle
          eyebrow="Everything it records"
          title={`${summaries.length} measure${summaries.length === 1 ? "" : "s"}`}
          aside={
            <div className="flex rounded-xl border border-neutral-200 bg-white p-0.5 print:hidden">
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
          }
        />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {summaries.map((s) => {
            const on = s.parameter.parameterName === selected?.parameterName;
            const verdict = verdictOf(s);
            return (
              <button
                key={s.parameter.parameterName}
                type="button"
                onClick={() => setMeasure(s.parameter.measure)}
                aria-pressed={on}
                className={`rounded-2xl border p-3 text-left shadow-sm transition-colors ${
                  on ? "border-neutral-900 bg-white" : "border-neutral-200 bg-white hover:border-neutral-300"
                }`}
              >
                <div className="flex items-start justify-between gap-1.5">
                  <p className="truncate text-[11px] font-black uppercase tracking-wider text-neutral-500">
                    {s.parameter.label}
                  </p>
                  <StatusPill status={verdict} />
                </div>
                <div className="mt-1.5 flex items-baseline gap-1">
                  <span className={`font-mono text-[19px] font-black tabular-nums ${
                    s.latest === null ? "text-neutral-300" : "text-neutral-900"
                  }`}>
                    {s.latest === null ? "—" : s.latest.toFixed(1)}
                  </span>
                  {s.parameter.unit && s.latest !== null && (
                    <span className="text-[10px] font-bold text-neutral-400">{s.parameter.unit}</span>
                  )}
                </div>
                <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-neutral-400">
                  {s.readings > 0
                    ? `${s.readings.toLocaleString()} readings`
                    : "never recorded"}
                  {s.parameter.constant && " · setpoint"}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── The chosen measure over time ─────────────────────────────────── */}
      {selected && (
        <section className="space-y-3">
          <SectionTitle
            eyebrow="Over time"
            title={selected.label}
            aside={selectedSummary && <StatusPill status={verdictOf(selectedSummary)} />}
          />
          <div className="rounded-3xl border border-neutral-100 bg-white p-5 shadow-sm print:border-neutral-300 print:shadow-none">
            <TrendChart
              data={chartData}
              xKey="label"
              unit={unit}
              height={320}
              band={{
                min: selected.min, max: selected.max,
                warnMin: selected.warnMin, warnMax: selected.warnMax
              }}
              series={[{ key: "value", name: selected.label, color: SERIES[0] }]}
              emptyMessage={
                isLoading ? "Loading readings…" : "This measure has no readings in this period."
              }
            />
          </div>
        </section>
      )}

      {/* ── What has been changed on it ──────────────────────────────────── */}
      {equipmentId && (
        <section className="space-y-3">
          <SectionTitle
            eyebrow="Provenance"
            title="What has been changed on this machine"
            aside={
              <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                <Wrench size={12} /> Registry audit
              </span>
            }
          />
          <div className="rounded-3xl border border-neutral-100 bg-white p-5 shadow-sm">
            <AssetHistory equipmentId={equipmentId} />
          </div>
        </section>
      )}

      {/* ── The record ───────────────────────────────────────────────────── */}
      {selected && (
        <section className="space-y-3">
          <SectionTitle eyebrow="On the record" title="Every reading, and who took it" />
          <StatTable
            maxHeight={420}
            rows={readings}
            rowKey={(r) => `${r.target_hour}|${r.parameter_name}`}
            rowTone={(r) => {
              const s = readingStatus(r.value_num, selected.min, selected.max,
                                      selected.warnMin, selected.warnMax);
              return s === "breach" ? "breach" : s === "warn" ? "warn" : "none";
            }}
            emptyMessage="No readings were recorded for this measure in this period."
            columns={[
              {
                key: "when", header: "When", width: "170px",
                render: (r) => (
                  <span className="font-mono text-[11px] text-neutral-600">
                    {new Date(r.target_hour).toLocaleString(undefined, {
                      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
                    })}
                  </span>
                )
              },
              { key: "value", header: "Reading", numeric: true, width: "120px",
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

export default AssetDetail;
