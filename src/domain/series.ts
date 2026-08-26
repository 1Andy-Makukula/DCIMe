import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/shared/api/supabaseClient";

// ─────────────────────────────────────────────────────────────────────────────
// Asking the database for a series.
//
// Every chart, table and printed figure comes through here. The database does
// the aggregation — get_series() picks the right rollup for the grain, so a
// year of monthly data is 603 rows rather than a million — and this module is
// the typed handle on it.
//
// Nothing in this file averages anything. That was the point of Stage 3: the
// browser used to pull raw rows and compute means itself, capped at 3,000 rows,
// which silently truncated any window longer than about four months.
// ─────────────────────────────────────────────────────────────────────────────

/** Which rollup answers the question. 'hour' reads the readings themselves. */
export type Grain = "hour" | "day" | "month" | "year";

/**
 * What each returned row represents.
 *
 * 'room' and 'site' aggregate every matching reading together, so pass a
 * parameter with them unless only the COUNTS are being read — averaging volts
 * with degrees produces a confident, meaningless number.
 */
export type GroupBy = "asset" | "room" | "site";

export interface SeriesPoint {
  bucket: string;
  equipment_id: string | null;
  parameter_name: string | null;
  room_id: string | null;
  room_name: string | null;
  n: number;
  n_numeric: number;
  /** Readings a technician answered 'NA' — counted, never averaged. */
  n_na: number;
  /**
   * Readings that were exactly zero.
   *
   * Reported rather than removed. A generator that did not run really did burn
   * zero litres; a 0.0 °C data hall is a blank box that got saved. Nothing in
   * the schema separates the two until operating limits are set, so the count
   * is surfaced and the reader decides.
   */
  n_zero: number;
  avg_num: number | null;
  min_num: number | null;
  max_num: number | null;
  n_warn: number;
  n_breach: number;
}

export interface SeriesQuery {
  siteUuid: string;
  from: Date;
  to: Date;
  grain?: Grain;
  groupBy?: GroupBy;
  parameterName?: string | null;
  equipmentId?: string | null;
  roomId?: string | null;
  /**
   * What is being measured, independent of which asset measured it —
   * 'return_temp_actual' rather than 'pac_hq_em1_return_temp_actual'.
   *
   * Parameter names embed their asset, so filtering by name pins the answer to
   * a single machine. Filtering by measure spans all 27 air conditioners, which
   * is what makes a per-room average mean anything.
   */
  measure?: string | null;
}

/** database.types.ts predates get_series. */
type UntypedRpc = (
  fn: string,
  args?: Record<string, unknown>
) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;

export async function fetchSeries(q: SeriesQuery): Promise<SeriesPoint[]> {
  const { data, error } = await rpc("get_series", {
    p_site_uuid:      q.siteUuid,
    p_from:           q.from.toISOString(),
    p_to:             q.to.toISOString(),
    p_grain:          q.grain ?? "day",
    p_group_by:       q.groupBy ?? "asset",
    p_parameter_name: q.parameterName ?? null,
    p_equipment_id:   q.equipmentId ?? null,
    p_room_id:        q.roomId ?? null,
    p_measure:        q.measure ?? null
  });
  if (error) throw new Error(error.message);
  return (data as SeriesPoint[] | null) ?? [];
}

export interface UseSeriesResult {
  points: SeriesPoint[];
  isLoading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * A series, refetched whenever the question changes.
 *
 * The window is compared by timestamp rather than by Date identity: a caller
 * computing `new Date()` in render would otherwise produce a different object
 * every pass and refetch forever.
 */
export function useSeries(q: SeriesQuery | null): UseSeriesResult {
  const [points, setPoints] = useState<SeriesPoint[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const fromMs = q?.from.getTime() ?? 0;
  const toMs   = q?.to.getTime() ?? 0;

  useEffect(() => {
    let cancelled = false;
    if (!q) { setPoints([]); setLoading(false); return; }

    setLoading(true);
    setError(null);
    fetchSeries(q)
      .then((p) => { if (!cancelled) { setPoints(p); setLoading(false); } })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message ?? "Could not load the series");
        setPoints([]);
        setLoading(false);
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q?.siteUuid, fromMs, toMs, q?.grain, q?.groupBy,
      q?.parameterName, q?.equipmentId, q?.roomId, q?.measure, nonce]);

  return { points, isLoading, error, reload: useCallback(() => setNonce((n) => n + 1), []) };
}

// ─────────────────────────────────────────────────────────────────────────────
// The raw readings behind a series
// ─────────────────────────────────────────────────────────────────────────────

export interface RawReading {
  target_hour: string;
  equipment_id: string;
  parameter_name: string;
  room_id: string | null;
  value_num: number | null;
  value_text: string | null;
  technician_name: string | null;
}

type UntypedFrom = (table: string) => any;
const from = supabase.from.bind(supabase) as unknown as UntypedFrom;

/**
 * Every reading in a window, with who took it.
 *
 * This is the register the day sheet is — the thing an auditor asks for when a
 * number on a summary is questioned. Capped, because "show me a year" is a
 * reasonable thing to click and an unreasonable thing to render.
 */
export async function fetchRawReadings(q: {
  siteUuid: string;
  from: Date;
  to: Date;
  parameterName?: string | null;
  /**
   * The exact names that share a measure, resolved from the registry.
   *
   * The readings table has no measure column, and matching by suffix would be
   * wrong: '%temp_set' catches both return_temp_set and supply_temp_set. The
   * caller already holds the registry, so it passes the exact list.
   */
  parameterNames?: string[] | null;
  equipmentId?: string | null;
  roomId?: string | null;
  limit?: number;
}): Promise<RawReading[]> {
  let query = from("readings")
    .select("target_hour,equipment_id,parameter_name,room_id,value_num,value_text,technician_name")
    .eq("site_uuid", q.siteUuid)
    .gte("target_hour", q.from.toISOString())
    .lt("target_hour", q.to.toISOString())
    .order("target_hour", { ascending: false })
    .limit(q.limit ?? 2000);

  if (q.parameterNames && q.parameterNames.length) {
    query = query.in("parameter_name", q.parameterNames);
  } else if (q.parameterName) {
    query = query.eq("parameter_name", q.parameterName);
  }
  if (q.equipmentId)   query = query.eq("equipment_id", q.equipmentId);
  if (q.roomId)        query = query.eq("room_id", q.roomId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as RawReading[] | null) ?? [];
}
