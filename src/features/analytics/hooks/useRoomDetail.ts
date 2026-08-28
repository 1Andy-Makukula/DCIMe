import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import {
  fetchSeries, fetchRawReadings,
  type SeriesPoint, type RawReading, type Grain
} from "@/domain/series";
import { unitFor, humanise } from "@/domain/categories";

// ─────────────────────────────────────────────────────────────────────────────
// Level 2: one room, and every machine in it.
//
// WHY NOT useCategoryDetail()
// That hook is scoped by CATEGORY across the whole site — every air conditioner
// wherever it lives. This is scoped by ROOM across categories, which is how
// somebody standing in front of a problem thinks: "Power Room 1 is warm, what
// is in there and which one is doing it."
//
// Same query layer underneath. get_series already accepts a room filter and an
// asset grouping; nothing new was needed in the database, only a screen that
// asks the question this way round.
//
// MEASURES, NOT PARAMETERS
// Three air conditioners in a room record return_temp_actual under three
// different parameter names, each carrying its own asset prefix. Charting by
// parameter would draw three unrelated lines with three legend entries nobody
// can compare. equipment_parameters.measure is the name with the prefix
// stripped, so the three collapse to one subject — "return air temperature" —
// with one line per machine underneath it.
// ─────────────────────────────────────────────────────────────────────────────

export interface RoomMeasure {
  measure: string;
  label:   string;
  unit:    string | null;
  min:     number | null;
  max:     number | null;
  warnMin: number | null;
  warnMax: number | null;
  /** How many machines in this room record it. */
  assetCount: number;
  /** Exact parameter names, for the raw register. */
  parameterNames: string[];
  /** True where every contributor is a setpoint rather than a measurement. */
  constantOnly: boolean;
}

type UntypedFrom = (table: string) => any;
const from = supabase.from.bind(supabase) as unknown as UntypedFrom;

interface RoomParameterRow {
  equipmentId:   string;
  parameterName: string;
  measure:       string;
  label:         string;
  unit:          string | null;
  min:           number | null;
  max:           number | null;
  warnMin:       number | null;
  warnMax:       number | null;
  captureMode:   string;
}

async function fetchRoomParameters(roomId: string): Promise<RoomParameterRow[]> {
  const { data, error } = await from("equipment_registry")
    .select(`equipment_id,name,category,room_id,is_active,
             equipment_parameters(parameter_name,measure,display_label,unit,
                                  min_value,max_value,warn_min,warn_max,
                                  capture_mode,is_active)`)
    .eq("room_id", roomId)
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  const out: RoomParameterRow[] = [];
  for (const e of (data ?? []) as any[]) {
    for (const p of e.equipment_parameters ?? []) {
      if (p.is_active === false) continue;
      // Registered so the Excel templates stay complete, never read. Listing
      // them fills the picker with entries that open onto an empty chart.
      if (p.capture_mode === "NOT_APPLICABLE") continue;
      out.push({
        equipmentId:   e.equipment_id,
        parameterName: p.parameter_name,
        measure:       p.measure ?? p.parameter_name,
        label:         p.display_label ?? humanise(p.measure ?? p.parameter_name),
        unit:          unitFor(p.measure ?? p.parameter_name, p.unit),
        min:           p.min_value ?? null,
        max:           p.max_value ?? null,
        warnMin:       p.warn_min ?? null,
        warnMax:       p.warn_max ?? null,
        captureMode:   p.capture_mode
      });
    }
  }
  return out;
}

function collapse(rows: RoomParameterRow[]): RoomMeasure[] {
  const byMeasure = new Map<string, RoomMeasure & { assets: Set<string> }>();

  for (const r of rows) {
    let m = byMeasure.get(r.measure);
    if (!m) {
      m = {
        measure: r.measure, label: r.label, unit: r.unit,
        min: r.min, max: r.max, warnMin: r.warnMin, warnMax: r.warnMax,
        assetCount: 0, parameterNames: [], constantOnly: true,
        assets: new Set<string>()
      };
      byMeasure.set(r.measure, m);
    }
    m.assets.add(r.equipmentId);
    m.parameterNames.push(r.parameterName);
    if (r.captureMode === "CAPTURED") m.constantOnly = false;

    // Machines can disagree about their limits. Taking the widest keeps the
    // drawn band a superset of every unit's own, so nothing is shaded as a
    // breach on a chart that its own machine would call acceptable.
    if (r.min     !== null) m.min     = m.min     === null ? r.min     : Math.min(m.min, r.min);
    if (r.max     !== null) m.max     = m.max     === null ? r.max     : Math.max(m.max, r.max);
    if (r.warnMin !== null) m.warnMin = m.warnMin === null ? r.warnMin : Math.min(m.warnMin, r.warnMin);
    if (r.warnMax !== null) m.warnMax = m.warnMax === null ? r.warnMax : Math.max(m.warnMax, r.warnMax);
  }

  return [...byMeasure.values()]
    .map(({ assets, ...rest }) => ({ ...rest, assetCount: assets.size }))
    // A real measurement beats a setpoint, then whatever the most machines
    // record — a subject shared by every unit in the room is the one most
    // likely to explain a difference between them.
    .sort((a, b) =>
      Number(a.constantOnly) - Number(b.constantOnly) ||
      b.assetCount - a.assetCount ||
      a.label.localeCompare(b.label));
}

export interface RoomDetailArgs {
  siteUuid: string | null;
  roomId:   string | null;
  from:     Date;
  to:       Date;
  grain:    Grain;
  /** Null selects the measure the most machines in the room record. */
  measure:  string | null;
}

export interface RoomDetailResult {
  measures:  RoomMeasure[];
  selected:  RoomMeasure | null;
  series:    SeriesPoint[];
  raw:       RawReading[];
  isLoading: boolean;
  error:     string | null;
}

export function useRoomDetail(args: RoomDetailArgs): RoomDetailResult {
  const { siteUuid, roomId, from: rFrom, to: rTo, grain, measure } = args;

  const [rows, setRows]     = useState<RoomParameterRow[]>([]);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [raw, setRaw]       = useState<RawReading[]>([]);
  const [isLoading, setLoad] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  const fromMs = rFrom.getTime();
  const toMs   = rTo.getTime();

  useEffect(() => {
    let cancelled = false;
    if (!roomId) { setRows([]); return; }

    fetchRoomParameters(roomId)
      .then((r) => { if (!cancelled) setRows(r); })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message ?? "Could not load this room's equipment");
      });

    return () => { cancelled = true; };
  }, [roomId]);

  const measures = useMemo(() => collapse(rows), [rows]);

  const selected = useMemo(() => {
    if (!measures.length) return null;
    if (measure) {
      const found = measures.find((m) => m.measure === measure);
      if (found) return found;
    }
    return measures[0];
  }, [measures, measure]);

  const namesKey = useMemo(
    () => (selected ? [...selected.parameterNames].sort().join(",") : ""),
    [selected]
  );

  useEffect(() => {
    let cancelled = false;
    if (!siteUuid || !roomId || !selected) { setLoad(false); return; }

    setLoad(true);
    setError(null);

    Promise.all([
      // Grouped by asset, filtered to this room: one line per machine, and the
      // room's own aggregate derived from those lines rather than asked for
      // separately — two queries could disagree at a bucket boundary.
      fetchSeries({
        siteUuid, from: rFrom, to: rTo, grain,
        groupBy: "asset", measure: selected.measure, roomId
      }),
      fetchRawReadings({
        siteUuid, from: rFrom, to: rTo,
        parameterNames: selected.parameterNames,
        roomId,
        limit: 2000
      })
    ])
      .then(([s, r]) => {
        if (cancelled) return;
        setSeries(s); setRaw(r); setLoad(false);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message ?? "Could not load readings for this room");
        setSeries([]); setRaw([]); setLoad(false);
      });

    return () => { cancelled = true; };
  }, [siteUuid, roomId, selected?.measure, namesKey, fromMs, toMs, grain]);

  return { measures, selected, series, raw, isLoading, error };
}
