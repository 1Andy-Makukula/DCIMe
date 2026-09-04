// src/features/analytics/components/SiteVitals.tsx
import { useMemo } from "react";
import { Link } from "react-router";
import { MetricTile, FreshnessPill } from "@/shared/ui";
import { CATEGORIES } from "@/domain/categories";
import { toneOfDomain } from "@/domain/wayfinding";
import { useSiteFreshness } from "../hooks/useSiteFreshness";
import { useSlaPerformance } from "../hooks/useSlaPerformance";
import type { Freshness } from "@/domain/freshness";

// ─────────────────────────────────────────────────────────────────────────────
// The overview's vital signs.
//
// The Overview opened on three counts — how many assets exist, how many alarms
// are open, how many rooms there are — none of which change from one day to the
// next. Two of them are inventory facts rather than news. Meanwhile the site's
// actual position was sitting one or two clicks away on sub-pages: which
// machines have stopped being read, and how much open work is already past its
// SLA.
//
// Both answers come from RPCs the platform already runs. Nothing here queries
// anything new; it puts the numbers on the page somebody actually opens first.
//
// Every route out of here is a link, because a vital sign that says "6 breached"
// and cannot tell you which six is a decoration.
// ─────────────────────────────────────────────────────────────────────────────

/** Which category screen a registry category belongs to. */
const SCREEN_FOR: Record<string, string> = {
  thermal:   "/admin/analytics/thermal",
  utility:   "/admin/analytics/grid",
  generator: "/admin/analytics/fuel",
  ups:       "/admin/analytics/ups",
  rectifier: "/admin/analytics/ups",
  load:      "/admin/analytics/load",
  safety:    "/admin/analytics/safety"
};

/** Worst wins: one cold machine makes the row cold, however many are live. */
const FRESHNESS_RANK: Record<Freshness, number> = {
  live: 0, due: 1, stale: 2, cold: 3, never: 4
};

interface CategoryRow {
  id: string;
  label: string;
  rail: string;
  href: string;
  registered: number;
  behind: number;
  never: number;
  worst: Freshness;
  lastReading: Date | null;
}

export function SiteVitals() {
  const { all, summary, isLoading: freshLoading } = useSiteFreshness();
  const { performance, isLoading: slaLoading } = useSlaPerformance(30);

  const rows = useMemo<CategoryRow[]>(() => {
    return CATEGORIES.map((c) => {
      const set = new Set<string>(c.dbCategories);
      const members = all.filter((a) => set.has(a.category as never));

      let worst: Freshness = "live";
      let last: Date | null = null;
      for (const m of members) {
        if (FRESHNESS_RANK[m.freshness] > FRESHNESS_RANK[worst]) worst = m.freshness;
        if (m.lastReading && (!last || m.lastReading > last)) last = m.lastReading;
      }

      return {
        id: c.id,
        label: c.label,
        rail: toneOfDomain(c.id).rail,
        href: SCREEN_FOR[c.id] ?? `/admin/analytics/detail/${c.id}`,
        registered: members.length,
        behind: members.filter((m) => m.freshness === "stale" || m.freshness === "cold").length,
        never: members.filter((m) => m.freshness === "never").length,
        worst: members.length === 0 ? "never" : worst,
        lastReading: last
      };
    // A category with nothing registered against it is a configuration gap, not
    // a reading gap, and belongs on the inventory screen rather than here.
    }).filter((r) => r.registered > 0);
  }, [all]);

  const watched = summary.assets - summary.behind - summary.never;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Vital signs ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricTile
          label="Machines being read"
          value={freshLoading ? null : `${watched}/${summary.assets}`}
          status={summary.behind + summary.never > 0 ? "warn" : "ok"}
          footnote={
            <span className="inline-flex items-center gap-1.5">
              <FreshnessPill
                freshness={summary.freshness}
                lastReading={summary.lastReading}
                showWhenLive
                withAge
              />
            </span>
          }
        />
        <MetricTile
          label="Fallen behind"
          value={freshLoading ? null : summary.behind + summary.never}
          status={summary.never > 0 ? "breach" : summary.behind > 0 ? "warn" : "ok"}
          footnote={
            summary.behind + summary.never === 0
              ? "every machine read this round"
              : <Link to="/admin/analytics/facility" className="font-bold text-brand-600 hover:underline">
                  Which machines →
                </Link>
          }
        />
        <MetricTile
          label="Open work"
          value={slaLoading ? null : performance?.open_total ?? 0}
          status={(performance?.unacknowledged ?? 0) > 0 ? "warn" : "ok"}
          footnote={
            (performance?.unacknowledged ?? 0) > 0
              ? `${performance?.unacknowledged} nobody has acknowledged`
              : "all acknowledged"
          }
        />
        <MetricTile
          label="Past its SLA"
          value={slaLoading ? null : performance?.breached_now ?? 0}
          status={(performance?.breached_now ?? 0) > 0 ? "breach" : "ok"}
          footnote={
            (performance?.breached_now ?? 0) > 0
              ? <Link to="/admin/jobs" className="font-bold text-danger-600 hover:underline">
                  Open the queue →
                </Link>
              : "nothing overdue"
          }
        />
      </div>

      {/* ── Is every system being watched ───────────────────────────────── */}
      <div className="rounded-3xl border border-neutral-100 bg-white p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-neutral-400">
              Every system
            </p>
            <h3 className="text-[15px] font-black tracking-tight text-neutral-900">
              Coverage by system
            </h3>
          </div>
          <p className="text-[10px] font-semibold text-neutral-400">
            {summary.assets} machines in the round
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <Link
              key={r.id}
              to={r.href}
              className="group flex items-center gap-3 rounded-2xl border border-neutral-100 bg-neutral-50/60 px-3 py-2.5 transition-colors hover:border-brand-100 hover:bg-brand-50/30"
            >
              <span className={`h-8 w-1 shrink-0 rounded-full ${r.rail}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-black text-neutral-900 group-hover:text-brand-700">
                  {r.label}
                </div>
                <div className="mt-0.5 text-[10px] font-semibold text-neutral-400">
                  {r.registered} machine{r.registered === 1 ? "" : "s"}
                  {r.behind > 0 && <span className="text-warn-700"> · {r.behind} behind</span>}
                  {r.never > 0 && <span className="text-danger-600"> · {r.never} never read</span>}
                </div>
              </div>
              <FreshnessPill freshness={r.worst} lastReading={r.lastReading} showWhenLive />
            </Link>
          ))}
        </div>

        {rows.length === 0 && !freshLoading && (
          <p className="text-[11px] font-semibold text-neutral-400">
            No equipment is registered against this site yet.
          </p>
        )}
      </div>
    </div>
  );
}
