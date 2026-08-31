import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import { useReadingsRevision } from "@/shared/api/readingsRevision";
import {
  fetchSeries, fetchRawReadings,
  type SeriesPoint, type RawReading, type Grain
} from "@/domain/series";
import { buildNarrative, type NarrativeParagraph } from "@/domain/narrative";
import { unitFor, humanise, type CategoryDef } from "@/domain/categories";

// ─────────────────────────────────────────────────────────────────────────────
// Everything one category detail screen needs.
//
// WHY NOT useSiteModel()
// siteModel serves the reading FORM: what to show a technician, in what order,
// carried forward from where. It knows nothing about warning bands or which
// parameters are worth charting, because a form does not care. Widening that
// cached fetch to carry analytics columns would make one request answer two
// unrelated questions and invalidate the form's cache whenever a band moved.
// So this is a second, narrow read of the same tables — deliberately.
//
// MEASURES, NOT PARAMETERS
// Nobody browses for 'pac_hq_em1_return_temp_actual'. They browse for return
// air temperature and expect every air conditioner in it. equipment_parameters
// .measure carries the parameter name with its asset prefix stripped, so the
// 27 aircon parameters collapse to one entry in the picker and 27 lines on the
// chart.
// ─────────────────────────────────────────────────────────────────────────────

export interface CategoryParameter {
  equipmentId: string;
  equipmentName: string;
  category: string;
  roomId: string | null;
  roomName: string | null;
  parameterName: string;
  measure: string;
  label: string;
  unit: string | null;
  min: number | null;
  max: number | null;
  warnMin: number | null;
  warnMax: number | null;
  isGraphable: boolean;
  captureMode: string;
}

type UntypedFrom = (table: string) => any;
const from = supabase.from.bind(supabase) as unknown as UntypedFrom;

async function fetchCategoryParameters(
  siteUuid: string,
  dbCategories: string[]
): Promise<CategoryParameter[]> {
  const { data, error } = await from("equipment_registry")
    .select(`equipment_id,name,category,room_id,is_active,
             rooms(room_name),
             equipment_parameters(parameter_name,measure,display_label,unit,is_graphable,
                                  min_value,max_value,warn_min,warn_max,
                                  capture_mode,is_active,display_order)`)
    .eq("site_uuid", siteUuid)
    .in("category", dbCategories)
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  const out: CategoryParameter[] = [];
  for (const e of (data ?? []) as any[]) {
    for (const p of e.equipment_parameters ?? []) {
      if (p.is_active === false) continue;
      // NOT_APPLICABLE parameters were registered so the Excel templates stay
      // complete; 221 of them have never been read and never will be. Listing
      // them would fill the picker with entries that open onto nothing.
      //
      // CONSTANT ones DO stay. capture_mode describes the form — whether a
      // technician retypes the value each round — not whether the value is
      // worth looking at. humidity_actual is marked CONSTANT and still has 231
      // readings per air conditioner; excluding it would empty the humidity
      // half of a screen called Temperature & Humidity.
      if (p.capture_mode === "NOT_APPLICABLE") continue;
      out.push({
        equipmentId:   e.equipment_id,
        equipmentName: e.name ?? e.equipment_id,
        category:      e.category,
        roomId:        e.room_id ?? null,
        // rooms.room_name, not rooms.name — the column carries the table's own
        // prefix. PostgREST reports the mismatch as "column rooms_1.name does
        // not exist" and fails the WHOLE fetch, which is why the screen then
        // claimed nothing was registered.
        roomName:      e.rooms?.room_name ?? null,
        parameterName: p.parameter_name,
        measure:       p.measure ?? p.parameter_name,
        label:         p.display_label ?? humanise(p.measure ?? p.parameter_name),
        unit:          unitFor(p.measure ?? p.parameter_name, p.unit),
        min:           p.min_value ?? null,
        max:           p.max_value ?? null,
        warnMin:       p.warn_min ?? null,
        warnMax:       p.warn_max ?? null,
        isGraphable:   Boolean(p.is_graphable),
        captureMode:   p.capture_mode
      });
    }
  }
  return out;
}

/** One browsable thing: what is measured, and everything that measures it. */
export interface MeasureChoice {
  measure: string;
  label: string;
  unit: string | null;
  min: number | null;
  max: number | null;
  warnMin: number | null;
  warnMax: number | null;
  assetCount: number;
  roomCount: number;
  graphable: boolean;
  /** True where every contributing parameter is a setpoint or nameplate. */
  constantOnly: boolean;
  /** The exact parameter names, for querying the raw register. */
  parameterNames: string[];
  /** Numeric readings actually captured in the window. 0 until volumes load. */
  captured: number;
}

/** What was actually recorded per measure, as opposed to what could be. */
export interface MeasureVolume {
  measure: string;
  n: number;
  n_numeric: number;
  n_zero: number;
  assets: number;
  rooms: number;
  last_seen: string | null;
}

type UntypedRpc = (
  fn: string, args?: Record<string, unknown>
) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;

async function fetchMeasureVolumes(
  siteUuid: string, fromDate: Date, toDate: Date, categories: string[]
): Promise<Map<string, MeasureVolume>> {
  // Named fromDate rather than from: `from` is the supabase table binding at
  // module scope, and shadowing it here reads as a bug even when it is not.
  const { data, error } = await rpc("get_measure_volumes", {
    p_site_uuid:  siteUuid,
    p_from:       fromDate.toISOString(),
    p_to:         toDate.toISOString(),
    p_categories: categories
  });
  if (error) throw new Error(error.message);
  const map = new Map<string, MeasureVolume>();
  for (const v of (data as MeasureVolume[] | null) ?? []) map.set(v.measure, v);
  return map;
}

function collapseToChoices(
  params: CategoryParameter[],
  volumes: Map<string, MeasureVolume>
): MeasureChoice[] {
  const byMeasure = new Map<string, MeasureChoice & { rooms: Set<string> }>();

  for (const p of params) {
    let m = byMeasure.get(p.measure);
    if (!m) {
      m = {
        measure: p.measure,
        label: p.label,
        unit: p.unit,
        min: p.min, max: p.max, warnMin: p.warnMin, warnMax: p.warnMax,
        assetCount: 0,
        roomCount: 0,
        graphable: false,
        constantOnly: true,
        parameterNames: [],
        captured: volumes.get(p.measure)?.n_numeric ?? 0,
        rooms: new Set<string>()
      };
      byMeasure.set(p.measure, m);
    }
    m.assetCount += 1;
    m.parameterNames.push(p.parameterName);
    if (p.roomId) m.rooms.add(p.roomId);
    m.graphable = m.graphable || p.isGraphable;
    if (p.captureMode === "CAPTURED") m.constantOnly = false;

    // Assets can disagree about limits. Taking the widest keeps the drawn band
    // a superset of every asset's own, so nothing is shaded as a breach on a
    // chart that its own asset would call acceptable.
    if (p.min !== null)     m.min     = m.min     === null ? p.min     : Math.min(m.min, p.min);
    if (p.max !== null)     m.max     = m.max     === null ? p.max     : Math.max(m.max, p.max);
    if (p.warnMin !== null) m.warnMin = m.warnMin === null ? p.warnMin : Math.min(m.warnMin, p.warnMin);
    if (p.warnMax !== null) m.warnMax = m.warnMax === null ? p.warnMax : Math.max(m.warnMax, p.warnMax);
  }

  return [...byMeasure.values()]
    .map(({ rooms, ...rest }) => ({ ...rest, roomCount: rooms.size }))
    // Two rules, in this order.
    //
    // FIRST, a real measurement beats a setpoint. Thermal holds 5,500
    // humidity_actual readings against 5,170 return_temp_actual — but
    // humidity_actual is CONSTANT and behaves like it, sitting at exactly 50.0
    // with occasional zeros. Sorting on volume alone opened Temperature &
    // Humidity onto an echoed setpoint, beating the actual temperature by 330
    // rows. A flat line is not what somebody came to see.
    //
    // THEN, among real measurements, whatever was actually captured most.
    // Sorting by the registry alone put Generators on batt_voltage: chartable,
    // five assets, and four readings in total against 6,524 in the category.
    // is_graphable describes intent; the reading count describes what happened,
    // so the flag survives only as a tiebreak.
    .sort((a, b) =>
      Number(a.constantOnly) - Number(b.constantOnly) ||
      b.captured - a.captured ||
      Number(b.graphable) - Number(a.graphable) ||
      b.assetCount - a.assetCount ||
      a.label.localeCompare(b.label));
}

/** A window of the same length immediately before this one. */
function previousWindow(from: Date, to: Date): { from: Date; to: Date } {
  const span = to.getTime() - from.getTime();
  return { from: new Date(from.getTime() - span), to: new Date(from.getTime()) };
}

/** The finest grain that will not return thousands of buckets. */
export function defaultGrain(from: Date, to: Date): Grain {
  const days = (to.getTime() - from.getTime()) / 86_400_000;
  if (days <= 3)   return "hour";
  if (days <= 60)  return "day";
  // Between two months and a year, weeks beat both neighbours: days give 300+
  // unreadable buckets, months give four. A quarter is thirteen points.
  if (days <= 400) return "week";
  if (days <= 800) return "month";
  return "year";
}

export interface CategoryDetailArgs {
  siteUuid: string | null;
  category: CategoryDef | null;
  from: Date;
  to: Date;
  periodLabel: string;
  /** Null selects the most useful measure in the category. */
  measure: string | null;
  grain: Grain | null;
  groupBy: "room" | "asset";
  roomId: string | null;
}

export interface CategoryDetailResult {
  choices: MeasureChoice[];
  selected: MeasureChoice | null;
  parameters: CategoryParameter[];
  series: SeriesPoint[];
  previous: SeriesPoint[];
  raw: RawReading[];
  narrative: NarrativeParagraph[];
  /** Rooms present in this category, for the room filter. */
  rooms: { id: string; name: string }[];
  grain: Grain;
  isLoading: boolean;
  error: string | null;
}

export function useCategoryDetail(args: CategoryDetailArgs): CategoryDetailResult {
  const { siteUuid, category, from: rFrom, to: rTo, periodLabel,
          measure, grain: grainOverride, groupBy, roomId } = args;

  const [parameters, setParameters] = useState<CategoryParameter[]>([]);
  const [volumes, setVolumes]   = useState<Map<string, MeasureVolume>>(new Map());
  const [series, setSeries]     = useState<SeriesPoint[]>([]);
  const [previous, setPrevious] = useState<SeriesPoint[]>([]);
  const [raw, setRaw]           = useState<RawReading[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const fromMs = rFrom.getTime();
  const toMs   = rTo.getTime();
  const grain  = grainOverride ?? defaultGrain(rFrom, rTo);
  const dbCats = category?.dbCategories.join(",") ?? "";
  const revision = useReadingsRevision(siteUuid);

  // ── The registry half: what can be looked at here ─────────────────────────
  useEffect(() => {
    let cancelled = false;
    if (!siteUuid || !category) { setParameters([]); return; }

    fetchCategoryParameters(siteUuid, category.dbCategories)
      .then((p) => { if (!cancelled) setParameters(p); })
      .catch((e: any) => { if (!cancelled) setError(e?.message ?? "Could not load the registry"); });

    return () => { cancelled = true; };
  }, [siteUuid, dbCats]);

  // ── What was actually captured in this window ─────────────────────────────
  // Refetched when the period moves: "which measure has data" is a question
  // about the window on screen, not about all of history.
  useEffect(() => {
    let cancelled = false;
    if (!siteUuid || !category) { setVolumes(new Map()); return; }

    fetchMeasureVolumes(siteUuid, rFrom, rTo, category.dbCategories)
      .then((v) => { if (!cancelled) setVolumes(v); })
      .catch(() => {
        // A failure here costs a better default, not the screen. Fall back to
        // the registry ordering rather than showing an error for something the
        // reader never asked for.
        if (!cancelled) setVolumes(new Map());
      });

    return () => { cancelled = true; };
  }, [siteUuid, dbCats, fromMs, toMs, revision]);

  const choices = useMemo(
    () => collapseToChoices(parameters, volumes), [parameters, volumes]);

  const rooms = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of parameters) {
      if (p.roomId && !seen.has(p.roomId)) seen.set(p.roomId, p.roomName ?? p.roomId);
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [parameters]);

  const selected = useMemo(() => {
    if (!choices.length) return null;
    if (measure) {
      const found = choices.find((c) => c.measure === measure);
      if (found) return found;
    }
    // choices is sorted by what was actually captured in this window, so the
    // head is the measure most likely to be worth looking at.
    return choices[0];
  }, [choices, measure]);

  // The exact parameter names behind the selected measure, for the raw register
  // and for keeping the effect's dependency a primitive.
  const selectedNames = useMemo(
    () => (selected ? [...selected.parameterNames].sort() : []),
    [selected]
  );
  const namesKey = selectedNames.join(",");

  // ── The readings half ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    if (!siteUuid || !selected) { setLoading(false); return; }

    setLoading(true);
    setError(null);

    const prev = previousWindow(rFrom, rTo);

    Promise.all([
      fetchSeries({
        siteUuid, from: rFrom, to: rTo, grain, groupBy,
        measure: selected.measure, roomId: roomId ?? null
      }),
      // The comparison is one number, so it is asked for at site level: the
      // previous period's mean, not its shape.
      fetchSeries({
        siteUuid, from: prev.from, to: prev.to, grain, groupBy: "site",
        measure: selected.measure, roomId: roomId ?? null
      }),
      fetchRawReadings({
        siteUuid, from: rFrom, to: rTo,
        parameterNames: selectedNames,
        roomId: roomId ?? null,
        limit: 2000
      })
    ])
      .then(([s, p, r]) => {
        if (cancelled) return;
        setSeries(s); setPrevious(p); setRaw(r);
        setLoading(false);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message ?? "Could not load readings");
        setSeries([]); setPrevious([]); setRaw([]);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [siteUuid, selected?.measure, namesKey, fromMs, toMs, grain, groupBy, roomId, revision]);

  const narrative = useMemo(() => {
    if (!selected) return [];
    return buildNarrative({
      subject: selected.label,
      unit: selected.unit,
      points: series,
      previous,
      periodLabel
    });
  }, [selected, series, previous, periodLabel]);

  return {
    choices, selected, parameters, series, previous, raw, narrative, rooms,
    grain, isLoading, error
  };
}
