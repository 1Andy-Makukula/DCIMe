import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import { useReadingsRevision } from "./useReadingsRevision";

// ─────────────────────────────────────────────────────────────────────────────
// What each technician recorded, and how consistently.
//
// READ THIS BEFORE USING IT TO JUDGE ANYBODY
// Reading counts measure who was rostered. WILLARD logged 13,648 readings and
// WAMANYIKWA 838, and the whole of that difference is twelve days on shift
// against one. Sorting people by volume would rank the roster and call it
// performance.
//
// The rates are different. Every technician walks the same rooms and reads the
// same 47 assets, so the share of readings that come back 'NA' or exactly zero
// is comparable between people in a way the totals never are — and it varies
// four-fold. That is a habit worth a conversation, not a building fault.
// ─────────────────────────────────────────────────────────────────────────────

export interface TechnicianActivity {
  technician_id: string;
  technician_name: string | null;
  n_readings: number;
  n_numeric: number;
  n_na: number;
  n_zero: number;
  n_breach: number;
  n_days: number;
  n_assets: number;
  n_rooms: number;
  n_shifts: number;
  first_seen: string | null;
  last_seen: string | null;
}

/** The same row with the comparable figures worked out. */
export interface TechnicianRow extends TechnicianActivity {
  /** Share of all readings answered 'not available'. */
  naRate: number;
  /** Share of numeric readings entered as exactly zero. */
  zeroRate: number;
  /** Readings per day on shift — pace, independent of how often rostered. */
  perDay: number;
}

type UntypedRpc = (
  fn: string, args?: Record<string, unknown>
) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;

export interface UseTechnicianActivityResult {
  rows: TechnicianRow[];
  /** Site-wide figures, for comparing an individual against the whole team. */
  totals: {
    people: number;
    readings: number;
    naRate: number;
    zeroRate: number;
    days: number;
  };
  isLoading: boolean;
  error: string | null;
}

export function useTechnicianActivity(
  siteUuid: string | null, from: Date, to: Date
): UseTechnicianActivityResult {
  const [raw, setRaw] = useState<TechnicianActivity[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fromMs = from.getTime();
  const toMs   = to.getTime();
  const revision = useReadingsRevision(siteUuid);

  useEffect(() => {
    let cancelled = false;
    if (!siteUuid) { setRaw([]); setLoading(false); return; }

    setLoading(true);
    setError(null);

    rpc("get_technician_activity", {
      p_site_uuid: siteUuid,
      p_from: from.toISOString(),
      p_to: to.toISOString()
    })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) throw new Error(error.message);
        setRaw((data as TechnicianActivity[] | null) ?? []);
        setLoading(false);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message ?? "Could not load technician activity");
        setRaw([]);
        setLoading(false);
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteUuid, fromMs, toMs, revision]);

  const rows = useMemo<TechnicianRow[]>(() =>
    raw
      .map((t) => ({
        ...t,
        naRate:   t.n_readings > 0 ? t.n_na / t.n_readings : 0,
        zeroRate: t.n_numeric  > 0 ? t.n_zero / t.n_numeric : 0,
        perDay:   t.n_days     > 0 ? t.n_readings / t.n_days : 0
      }))
      // Default order is by volume, because that is what a reader expects to
      // see first — but the columns that matter are the rates beside it.
      .sort((a, b) => b.n_readings - a.n_readings),
    [raw]);

  const totals = useMemo(() => {
    const readings = raw.reduce((a, t) => a + t.n_readings, 0);
    const numeric  = raw.reduce((a, t) => a + t.n_numeric, 0);
    return {
      people:   raw.length,
      readings,
      naRate:   readings > 0 ? raw.reduce((a, t) => a + t.n_na, 0) / readings : 0,
      zeroRate: numeric  > 0 ? raw.reduce((a, t) => a + t.n_zero, 0) / numeric : 0,
      // Distinct days cannot be summed across people without double-counting a
      // shared shift, so this is the busiest individual's day count — a floor
      // on how many days the site was covered, never an overstatement.
      days: raw.reduce((m, t) => Math.max(m, t.n_days), 0)
    };
  }, [raw]);

  return { rows, totals, isLoading, error };
}
