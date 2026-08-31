import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import { useReadingsRevision } from "./useReadingsRevision";
import {
  fetchSeries, fetchRawReadings,
  type SeriesPoint, type RawReading, type Grain
} from "@/domain/series";
import { unitFor, humanise } from "@/domain/categories";

// ─────────────────────────────────────────────────────────────────────────────
// Level 3: one machine, everything it records.
//
// TWO QUERIES, DELIBERATELY DIFFERENT SHAPES
// The overview strip wants every parameter at once so a reader can see the
// whole machine — but get_series returns one row per bucket PER PARAMETER, and
// a fifteen-parameter asset at hourly grain over a week is 2,520 rows, past
// PostgREST's 1,000-row cap. Truncated, the last parameters silently show as
// empty, which reads as "this machine does not record that" rather than "the
// query was cut off".
//
// So the strip is pinned to a coarse grain, where fifteen parameters over a
// month is 450 rows and complete. The chart for the ONE selected measure is
// filtered server-side to a single parameter, so it can be as fine as asked
// for and still return a handful of rows.
// ─────────────────────────────────────────────────────────────────────────────

export interface AssetParameter {
  parameterName: string;
  measure:       string;
  label:         string;
  unit:          string | null;
  min:           number | null;
  max:           number | null;
  warnMin:       number | null;
  warnMax:       number | null;
  constant:      boolean;
}

export interface AssetIdentity {
  equipmentId: string;
  name:        string;
  category:    string;
  roomId:      string | null;
  roomName:    string | null;
}

/** One parameter's shape over the period, for the overview strip. */
export interface MeasureSummary {
  parameter: AssetParameter;
  points:    SeriesPoint[];
  latest:    number | null;
  avg:       number | null;
  min:       number | null;
  max:       number | null;
  readings:  number;
  breaches:  number;
  warns:     number;
}

type UntypedFrom = (table: string) => any;
const from = supabase.from.bind(supabase) as unknown as UntypedFrom;

async function fetchAsset(equipmentId: string): Promise<{
  identity: AssetIdentity | null;
  parameters: AssetParameter[];
}> {
  const { data, error } = await from("equipment_registry")
    .select(`equipment_id,name,category,room_id,
             rooms(room_name),
             equipment_parameters(parameter_name,measure,display_label,unit,
                                  min_value,max_value,warn_min,warn_max,
                                  capture_mode,is_active,display_order)`)
    .eq("equipment_id", equipmentId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { identity: null, parameters: [] };

  const e = data as any;
  const parameters: AssetParameter[] = (e.equipment_parameters ?? [])
    .filter((p: any) => p.is_active !== false && p.capture_mode !== "NOT_APPLICABLE")
    .map((p: any) => ({
      parameterName: p.parameter_name,
      measure:       p.measure ?? p.parameter_name,
      label:         p.display_label ?? humanise(p.measure ?? p.parameter_name),
      unit:          unitFor(p.measure ?? p.parameter_name, p.unit),
      min:           p.min_value ?? null,
      max:           p.max_value ?? null,
      warnMin:       p.warn_min ?? null,
      warnMax:       p.warn_max ?? null,
      constant:      p.capture_mode === "CONSTANT"
    }))
    .sort((a: AssetParameter, b: AssetParameter) => a.label.localeCompare(b.label));

  return {
    identity: {
      equipmentId: e.equipment_id,
      name:        e.name ?? e.equipment_id,
      category:    e.category,
      roomId:      e.room_id ?? null,
      roomName:    e.rooms?.room_name ?? null
    },
    parameters
  };
}

export interface AssetDetailArgs {
  siteUuid:    string | null;
  equipmentId: string | null;
  from:        Date;
  to:          Date;
  grain:       Grain;
  /** Null selects the first parameter that actually has readings. */
  measure:     string | null;
}

export interface AssetDetailResult {
  identity:   AssetIdentity | null;
  parameters: AssetParameter[];
  summaries:  MeasureSummary[];
  selected:   AssetParameter | null;
  series:     SeriesPoint[];
  raw:        RawReading[];
  isLoading:  boolean;
  error:      string | null;
}

/** Coarse enough that every parameter fits under the row cap. */
function stripGrain(from: Date, to: Date): Grain {
  const days = (to.getTime() - from.getTime()) / 86_400_000;
  if (days <= 2)  return "hour";
  if (days <= 90) return "day";
  return "week";
}

export function useAssetDetail(args: AssetDetailArgs): AssetDetailResult {
  const { siteUuid, equipmentId, from: rFrom, to: rTo, grain, measure } = args;

  const [identity, setIdentity]     = useState<AssetIdentity | null>(null);
  const [parameters, setParameters] = useState<AssetParameter[]>([]);
  const [allPoints, setAllPoints]   = useState<SeriesPoint[]>([]);
  const [series, setSeries]         = useState<SeriesPoint[]>([]);
  const [raw, setRaw]               = useState<RawReading[]>([]);
  const [isLoading, setLoad]        = useState(true);
  const [error, setError]           = useState<string | null>(null);

  const fromMs = rFrom.getTime();
  const toMs   = rTo.getTime();
  const revision = useReadingsRevision(siteUuid);

  useEffect(() => {
    let cancelled = false;
    if (!equipmentId) { setIdentity(null); setParameters([]); return; }

    fetchAsset(equipmentId)
      .then((r) => {
        if (cancelled) return;
        setIdentity(r.identity);
        setParameters(r.parameters);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message ?? "Could not load this machine");
      });

    return () => { cancelled = true; };
  }, [equipmentId]);

  // Every parameter at once, at a grain that cannot truncate.
  useEffect(() => {
    let cancelled = false;
    if (!siteUuid || !equipmentId) { setLoad(false); return; }

    setLoad(true);
    fetchSeries({
      siteUuid, from: rFrom, to: rTo,
      grain: stripGrain(rFrom, rTo),
      groupBy: "asset",
      equipmentId
    })
      .then((p) => { if (!cancelled) { setAllPoints(p); setLoad(false); } })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message ?? "Could not load this machine's readings");
        setAllPoints([]);
        setLoad(false);
      });

    return () => { cancelled = true; };
  }, [siteUuid, equipmentId, fromMs, toMs, revision]);

  const summaries = useMemo<MeasureSummary[]>(() => {
    const byParam = new Map<string, SeriesPoint[]>();
    for (const p of allPoints) {
      if (!p.parameter_name) continue;
      const list = byParam.get(p.parameter_name);
      if (list) list.push(p);
      else byParam.set(p.parameter_name, [p]);
    }

    return parameters
      .map((parameter) => {
        const points = (byParam.get(parameter.parameterName) ?? [])
          .slice()
          .sort((a, b) => new Date(a.bucket).getTime() - new Date(b.bucket).getTime());

        let sum = 0, n = 0;
        let min: number | null = null;
        let max: number | null = null;
        for (const pt of points) {
          if (pt.avg_num !== null && pt.n_numeric > 0) { sum += pt.avg_num * pt.n_numeric; n += pt.n_numeric; }
          if (pt.min_num !== null) min = min === null ? pt.min_num : Math.min(min, pt.min_num);
          if (pt.max_num !== null) max = max === null ? pt.max_num : Math.max(max, pt.max_num);
        }

        const withValue = [...points].reverse().find((pt) => pt.avg_num !== null);

        return {
          parameter,
          points,
          latest:   withValue?.avg_num ?? null,
          avg:      n > 0 ? sum / n : null,
          min, max,
          readings: points.reduce((a, pt) => a + pt.n_numeric, 0),
          breaches: points.reduce((a, pt) => a + pt.n_breach, 0),
          warns:    points.reduce((a, pt) => a + pt.n_warn, 0)
        };
      })
      // Parameters that recorded nothing sink rather than disappear: "this is
      // registered and was never filled in" is a finding, not an absence.
      .sort((a, b) => b.readings - a.readings || a.parameter.label.localeCompare(b.parameter.label));
  }, [allPoints, parameters]);

  const selected = useMemo(() => {
    if (measure) {
      const found = parameters.find((p) => p.measure === measure);
      if (found) return found;
    }
    return summaries.find((s) => s.readings > 0)?.parameter ?? parameters[0] ?? null;
  }, [parameters, summaries, measure]);

  // The chosen measure at full resolution, plus its raw register.
  useEffect(() => {
    let cancelled = false;
    if (!siteUuid || !equipmentId || !selected) return;

    Promise.all([
      fetchSeries({
        siteUuid, from: rFrom, to: rTo, grain, groupBy: "asset",
        equipmentId, parameterName: selected.parameterName
      }),
      fetchRawReadings({
        siteUuid, from: rFrom, to: rTo,
        equipmentId, parameterNames: [selected.parameterName],
        limit: 1000
      })
    ])
      .then(([s, r]) => { if (!cancelled) { setSeries(s); setRaw(r); } })
      .catch(() => {
        if (!cancelled) { setSeries([]); setRaw([]); }
      });

    return () => { cancelled = true; };
  }, [siteUuid, equipmentId, selected?.parameterName, fromMs, toMs, grain, revision]);

  return { identity, parameters, summaries, selected, series, raw, isLoading, error };
}
