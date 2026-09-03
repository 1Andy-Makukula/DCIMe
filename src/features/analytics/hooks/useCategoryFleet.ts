// src/features/analytics/hooks/useCategoryFleet.ts
import { useMemo } from "react";
import type { CategoryDef } from "@/domain/categories";
import type { MeasureChoice } from "./useCategoryDetail";
import { useCategoryDetail, defaultGrain } from "./useCategoryDetail";
import { useSiteFreshness } from "./useSiteFreshness";
import { readingStatus, type ReadingStatus } from "@/domain/readingStatus";
import type { Freshness } from "@/domain/freshness";

// ─────────────────────────────────────────────────────────────────────────────
// Every machine of one kind, on one screen.
//
// WHY THIS EXISTS
// The category screens summarised a handful of hardcoded metric keys. Thermal's
// peak temperature was the maximum of server_ambient_temp — one sensor, against
// 60 registered assets. The UPS tiles read
// `ups_1_used_capacity ?? ups_2_used_capacity`: a COALESCE, so the second unit
// only ever appeared when the first was missing, out of four UPS and four
// rectifiers on the site. 107 assets are registered; nine reached a summary.
//
// Nothing about the data was missing. The technicians capture all of it every
// round, get_series() already aggregates it per asset, and get_asset_freshness()
// already knows which machines exist and when each was last read. The two were
// never joined. That join is this hook.
//
// It deliberately reuses useCategoryDetail rather than issuing its own queries:
// the roster and the chart below it must agree about what a measure is and which
// window it covers, and two independent readers of the same RPC eventually
// disagree.
// ─────────────────────────────────────────────────────────────────────────────

export interface FleetMember {
  equipmentId: string;
  name: string;
  roomName: string | null;
  /** Period average for the selected measure. Null where nothing was read. */
  value: number | null;
  min: number | null;
  max: number | null;
  /** Numeric readings captured in the window. 0 means this machine was skipped. */
  readings: number;
  breaches: number;
  warns: number;
  status: ReadingStatus | null;
  freshness: Freshness;
  lastReading: Date | null;
}

export interface FleetSummary {
  /** Machines the registry says belong to this category. */
  assetCount: number;
  /** Of those, how many produced a numeric reading in the window. */
  reporting: number;
  /** Registered, in the round, and silent all period — the ones worth chasing. */
  silent: number;
  worst: FleetMember | null;
  best: FleetMember | null;
  /** Difference between the worst and best period average. */
  spread: number | null;
  inBreach: number;
  inWarn: number;
}

export interface UseCategoryFleetResult {
  members: FleetMember[];
  summary: FleetSummary;
  selected: MeasureChoice | null;
  choices: MeasureChoice[];
  unit: string | null;
  isLoading: boolean;
  error: string | null;
}

const EMPTY_SUMMARY: FleetSummary = {
  assetCount: 0, reporting: 0, silent: 0,
  worst: null, best: null, spread: null, inBreach: 0, inWarn: 0
};

export function useCategoryFleet(args: {
  siteUuid: string | null;
  category: CategoryDef | null;
  from: Date;
  to: Date;
  periodLabel: string;
  /** Null lets the category pick its own most useful measure. */
  measure?: string | null;
}): UseCategoryFleetResult {
  const { siteUuid, category, from, to, periodLabel, measure = null } = args;

  // groupBy is pinned to "asset": a fleet roster is a list of machines, and a
  // room-grouped series cannot be turned back into one.
  const detail = useCategoryDetail({
    siteUuid,
    category,
    from,
    to,
    periodLabel,
    measure,
    grain: defaultGrain(from, to),
    groupBy: "asset",
    roomId: null
  });

  const { all: freshAssets, isLoading: freshLoading } = useSiteFreshness();

  const members = useMemo<FleetMember[]>(() => {
    if (!category) return [];

    const inCategory = new Set<string>(category.dbCategories);

    // The registry is the spine, not the readings. A machine that reported
    // nothing all period is the single most interesting row on this screen, and
    // building the list from the series would drop exactly those.
    const roster = freshAssets.filter((a) => inCategory.has(a.category as never));

    // get_series returns one row per asset per bucket; fold the buckets down to
    // one row per machine so the roster reads as a list of machines.
    const byAsset = new Map<string, {
      sum: number; n: number; min: number | null; max: number | null;
      readings: number; breaches: number; warns: number;
    }>();

    for (const p of detail.series) {
      if (!p.equipment_id) continue;
      let acc = byAsset.get(p.equipment_id);
      if (!acc) {
        acc = { sum: 0, n: 0, min: null, max: null, readings: 0, breaches: 0, warns: 0 };
        byAsset.set(p.equipment_id, acc);
      }
      // Weighted by how many readings each bucket held, so a day with two
      // readings does not count the same as a day with twenty-four.
      if (p.avg_num !== null && p.n_numeric > 0) {
        acc.sum += p.avg_num * p.n_numeric;
        acc.n   += p.n_numeric;
      }
      if (p.min_num !== null) acc.min = acc.min === null ? p.min_num : Math.min(acc.min, p.min_num);
      if (p.max_num !== null) acc.max = acc.max === null ? p.max_num : Math.max(acc.max, p.max_num);
      acc.readings += p.n_numeric;
      acc.breaches += p.n_breach;
      acc.warns    += p.n_warn;
    }

    const sel = detail.selected;

    return roster.map((a) => {
      const acc = byAsset.get(a.equipmentId);
      const value = acc && acc.n > 0 ? acc.sum / acc.n : null;
      return {
        equipmentId: a.equipmentId,
        name: a.name,
        roomName: a.roomName,
        value,
        min: acc?.min ?? null,
        max: acc?.max ?? null,
        readings: acc?.readings ?? 0,
        breaches: acc?.breaches ?? 0,
        warns: acc?.warns ?? 0,
        status: sel
          ? readingStatus(value, sel.min, sel.max, sel.warnMin, sel.warnMax)
          : null,
        freshness: a.freshness,
        lastReading: a.lastReading
      };
    }).sort((x, y) => {
      // Trouble first, then silence, then the rest by name — the reading order
      // somebody scanning this actually wants.
      if (x.breaches !== y.breaches) return y.breaches - x.breaches;
      if (x.warns !== y.warns) return y.warns - x.warns;
      const xSilent = x.readings === 0 ? 0 : 1;
      const ySilent = y.readings === 0 ? 0 : 1;
      if (xSilent !== ySilent) return xSilent - ySilent;
      return x.name.localeCompare(y.name);
    });
  }, [category, freshAssets, detail.series, detail.selected]);

  const summary = useMemo<FleetSummary>(() => {
    if (members.length === 0) return EMPTY_SUMMARY;

    const reporting = members.filter((m) => m.value !== null);
    const withValue = [...reporting].sort((a, b) => (b.value as number) - (a.value as number));

    return {
      assetCount: members.length,
      reporting: reporting.length,
      silent: members.length - reporting.length,
      // "Worst" is the highest reading, which is the wrong way round for a
      // measure where low is bad (battery charge). The status flags carry that
      // judgement; these two are labelled as highest and lowest on screen so
      // the tile never claims a verdict the number does not support.
      worst: withValue[0] ?? null,
      best: withValue[withValue.length - 1] ?? null,
      spread: withValue.length > 1
        ? (withValue[0].value as number) - (withValue[withValue.length - 1].value as number)
        : null,
      inBreach: members.filter((m) => m.breaches > 0).length,
      inWarn: members.filter((m) => m.warns > 0 && m.breaches === 0).length
    };
  }, [members]);

  return {
    members,
    summary,
    selected: detail.selected,
    choices: detail.choices,
    unit: detail.selected?.unit ?? null,
    isLoading: detail.isLoading || freshLoading,
    error: detail.error
  };
}
