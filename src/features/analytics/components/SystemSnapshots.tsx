// src/features/analytics/components/SystemSnapshots.tsx
import { Link } from "react-router";
import { toneOfDomain } from "@/domain/wayfinding";
import { useSystemSnapshot, type SystemSnapshot } from "../hooks/useSystemSnapshot";

// ─────────────────────────────────────────────────────────────────────────────
// One card per system, on the screen people open first.
//
// The Overview carried a thermal bar chart and nothing else about the plant —
// the UPS, the rectifiers, the generators and the utility feed had no presence
// on it at all. Each card is the same shape so the row reads as a set: the
// headline reading over the last day, the range it moved through, how many
// machines contributed, and whether any of them went outside their limits.
//
// The range bar is drawn to the readings themselves rather than to a fixed
// scale — a bar that is always half full says nothing. Where a system captured
// nothing numeric, the card says so instead of drawing an empty gauge.
// ─────────────────────────────────────────────────────────────────────────────

const SCREEN_FOR: Record<string, string> = {
  thermal:   "/admin/analytics/thermal",
  utility:   "/admin/analytics/grid",
  generator: "/admin/analytics/fuel",
  ups:       "/admin/analytics/ups",
  rectifier: "/admin/analytics/ups",
  load:      "/admin/analytics/load",
  safety:    "/admin/analytics/safety"
};

const fmt = (v: number | null, unit: string | null) => {
  if (v === null || !Number.isFinite(v)) return "—";
  const n = Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1);
  return unit ? `${n}${unit === "%" ? "%" : ` ${unit}`}` : n;
};

function SystemCard({ s }: { s: SystemSnapshot }) {
  const tone = toneOfDomain(s.category.id);
  const href = SCREEN_FOR[s.category.id] ?? `/admin/analytics/detail/${s.category.id}`;

  // Where the average sits between the low and the high of the period. Only
  // meaningful once the two ends differ.
  const span = s.min !== null && s.max !== null ? s.max - s.min : 0;
  const pos = span > 0 && s.avg !== null
    ? Math.min(100, Math.max(0, ((s.avg - (s.min as number)) / span) * 100))
    : null;

  const accent =
    s.status === "breach" ? "text-danger-600"
    : s.status === "warn" ? "text-warn-700"
    : "text-neutral-900";

  return (
    <Link
      to={href}
      className="group flex flex-col gap-3 rounded-2xl border border-neutral-100 bg-white p-4 transition-colors hover:border-brand-100 hover:bg-brand-50/20"
    >
      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 h-7 w-1 shrink-0 rounded-full ${tone.rail}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-black uppercase tracking-[0.1em] text-neutral-500 group-hover:text-brand-700">
            {s.category.label}
          </div>
          <div className="text-[10px] font-semibold text-neutral-400">
            {s.category.headlineLabel}
            {s.registered > 0 && <> · {s.reporting}/{s.registered} reporting</>}
          </div>
        </div>
        {s.breaches > 0 && (
          <span className="shrink-0 rounded bg-danger-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-danger-700">
            {s.breaches}
          </span>
        )}
        {s.breaches === 0 && s.warns > 0 && (
          <span className="shrink-0 rounded bg-warn-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-warn-700">
            {s.warns}
          </span>
        )}
      </div>

      {s.measure === null || s.readings === 0 ? (
        <div className="flex flex-1 flex-col justify-center py-2">
          <p className="text-[12px] font-bold text-neutral-400">No readings captured</p>
          <p className="mt-0.5 text-[10px] font-semibold text-neutral-300">
            {s.registered > 0
              ? `${s.registered} machine${s.registered === 1 ? "" : "s"} registered, nothing numeric logged`
              : "nothing registered against this system"}
          </p>
        </div>
      ) : (
        <>
          <div className={`font-mono text-[26px] font-black leading-none ${accent}`}>
            {fmt(s.avg, s.unit)}
          </div>

          {/* The range the system actually moved through, drawn to itself. */}
          <div>
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
              {pos !== null && (
                <span
                  className={`absolute top-0 h-full w-1.5 rounded-full ${
                    s.status === "breach" ? "bg-danger-500"
                    : s.status === "warn" ? "bg-warn-500"
                    : "bg-ok-500"
                  }`}
                  style={{ left: `calc(${pos}% - 3px)` }}
                  aria-hidden="true"
                />
              )}
            </div>
            <div className="mt-1 flex justify-between font-mono text-[9.5px] font-bold text-neutral-400">
              <span>{fmt(s.min, s.unit)}</span>
              <span className="text-neutral-300">{s.readings} readings · 24 h</span>
              <span>{fmt(s.max, s.unit)}</span>
            </div>
          </div>
        </>
      )}
    </Link>
  );
}

export function SystemSnapshots() {
  const { systems, isLoading, error } = useSystemSnapshot(24);

  if (error) {
    return (
      <p className="text-[11px] font-bold text-danger-700">
        Could not read the systems. {error}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-neutral-400">
            Last 24 hours
          </p>
          <h3 className="text-[15px] font-black tracking-tight text-neutral-900">
            Every system at a glance
          </h3>
        </div>
        <p className="text-[10px] font-semibold text-neutral-400">
          Period average, with the range it moved through
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading && systems.every((s) => s.readings === 0)
          ? Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-[132px] animate-pulse rounded-2xl border border-neutral-100 bg-neutral-50" />
            ))
          : systems.map((s) => <SystemCard key={s.category.id} s={s} />)}
      </div>
    </div>
  );
}
