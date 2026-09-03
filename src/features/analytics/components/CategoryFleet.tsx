// src/features/analytics/components/CategoryFleet.tsx
import { Link } from "react-router";
import { MetricTile, StatTable, Num, FreshnessPill } from "@/shared/ui";
import { categoryById } from "@/domain/categories";
import { toneOfDomain } from "@/domain/wayfinding";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { useCategoryFleet, type FleetMember } from "../hooks/useCategoryFleet";
import type { DateRangeValue } from "@/shared/utils/useDateRange";

// ─────────────────────────────────────────────────────────────────────────────
// The fleet band: every machine of one kind, and what the fleet as a whole did.
//
// Sits above the existing summary on each category screen rather than replacing
// it. The old tiles read one hardcoded metric key and this reads the registry,
// so for a while both are on screen and can be compared — that is deliberate,
// and the point at which the old ones come out is a decision to make after
// looking, not before.
// ─────────────────────────────────────────────────────────────────────────────

export function CategoryFleet({
  categoryId,
  range
}: {
  categoryId: string;
  range: DateRangeValue;
}) {
  const { currentSite } = useCurrentSite();
  const category = categoryById(categoryId) ?? null;

  const { members, summary, selected, unit, isLoading, error } = useCategoryFleet({
    siteUuid: currentSite?.id ?? null,
    category,
    from: range.start,
    to: range.end,
    periodLabel: range.label
  });

  if (!category) return null;

  const rail = toneOfDomain(category.id).rail;

  if (error) {
    return (
      <section className="rounded-2xl border border-danger-100 bg-danger-50/60 p-4">
        <p className="text-[12px] font-bold text-danger-800">
          Could not read the fleet for {category.label}. {error}
        </p>
      </section>
    );
  }

  const measureLabel = selected?.label ?? "the headline reading";

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
            Every machine · {range.label}
          </p>
          <h2 className="text-[17px] font-black tracking-tight text-neutral-900">
            {category.label} fleet
          </h2>
        </div>
        <p className="text-[11px] font-semibold text-neutral-500">
          {summary.assetCount} registered · {summary.reporting} reporting
          {selected && <> · measured on <strong className="text-neutral-700">{measureLabel}</strong></>}
        </p>
      </header>

      {/* ── Band 2: what the fleet did, across every machine in it ──────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricTile
          label="Machines reporting"
          value={summary.assetCount === 0 ? null : `${summary.reporting}/${summary.assetCount}`}
          status={summary.silent > 0 ? "warn" : "ok"}
          footnote={summary.silent > 0
            ? `${summary.silent} silent all period`
            : "every machine read"}
          rail={rail}
        />
        <MetricTile
          label="Highest"
          value={summary.worst?.value ?? null}
          unit={unit}
          decimals={1}
          status={summary.worst?.status ?? null}
          footnote={summary.worst?.name ?? "—"}
          rail={rail}
        />
        <MetricTile
          label="Lowest"
          value={summary.best?.value ?? null}
          unit={unit}
          decimals={1}
          status={summary.best?.status ?? null}
          footnote={summary.best?.name ?? "—"}
          rail={rail}
        />
        <MetricTile
          label="Spread"
          value={summary.spread}
          unit={unit}
          decimals={1}
          footnote="highest minus lowest"
          rail={rail}
        />
        <MetricTile
          label="Outside limits"
          value={summary.assetCount === 0 ? null : summary.inBreach}
          status={summary.inBreach > 0 ? "breach" : summary.inWarn > 0 ? "warn" : "ok"}
          footnote={summary.inWarn > 0
            ? `${summary.inWarn} more in the warning band`
            : "machines that breached"}
          rail={rail}
        />
      </div>

      {/* ── Band 1: the roster ──────────────────────────────────────────── */}
      <StatTable<FleetMember>
        rows={members}
        rowKey={(m) => m.equipmentId}
        rowTone={(m) => m.breaches > 0 ? "breach" : m.warns > 0 ? "warn" : "none"}
        maxHeight={420}
        emptyMessage={isLoading
          ? "Reading the fleet…"
          : `No machines are registered under ${category.label} at this site.`}
        columns={[
          {
            key: "name", header: "Machine",
            render: (m) => (
              <Link
                to={`/admin/analytics/facility/asset/${encodeURIComponent(m.equipmentId)}`}
                className="font-bold text-neutral-900 hover:underline"
              >
                {m.name}
              </Link>
            )
          },
          {
            key: "room", header: "Room", width: "22%",
            render: (m) => (
              <span className="text-neutral-500">{m.roomName ?? "—"}</span>
            )
          },
          {
            key: "value", header: selected?.label ?? "Reading", numeric: true, width: "13%",
            render: (m) => <Num value={m.value} decimals={1} unit={unit} />
          },
          {
            key: "range", header: "Min / max", numeric: true, width: "16%",
            render: (m) => (
              <span className="text-neutral-500">
                <Num value={m.min} decimals={1} /> – <Num value={m.max} decimals={1} />
              </span>
            )
          },
          {
            key: "readings", header: "Readings", numeric: true, width: "11%",
            // A zero here is the finding, not a blank: the machine is in the
            // registry and in the round, and nobody recorded it all period.
            render: (m) => m.readings === 0
              ? <span className="font-bold text-warn-700">none</span>
              : <span className="text-neutral-600">{m.readings}</span>
          },
          {
            key: "state", header: "State", width: "16%",
            render: (m) => (
              <div className="flex items-center gap-1.5">
                <FreshnessPill freshness={m.freshness} lastReading={m.lastReading} />
                {m.breaches > 0 && (
                  <span className="rounded bg-danger-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-danger-700">
                    {m.breaches} breach
                  </span>
                )}
                {m.breaches === 0 && m.warns > 0 && (
                  <span className="rounded bg-warn-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-warn-700">
                    {m.warns} warn
                  </span>
                )}
              </div>
            )
          }
        ]}
      />

      <p className="text-[11px] font-semibold text-neutral-400">
        Every machine the registry lists under {category.label}, whether or not it reported.
        Figures are the period average for {measureLabel}.{" "}
        <Link to={`/admin/analytics/detail/${category.id}`} className="font-bold text-brand-600 hover:underline">
          Open the full {category.label.toLowerCase()} detail →
        </Link>
      </p>
    </section>
  );
}
