// src/features/analytics/hooks/useSystemSnapshot.ts
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { useReadingsRevision } from "@/shared/api/readingsRevision";
import { CATEGORIES, type CategoryDef } from "@/domain/categories";
import { readingStatus, type ReadingStatus } from "@/domain/readingStatus";

// ─────────────────────────────────────────────────────────────────────────────
// Every system's current position, for the screen people open first.
//
// One RPC returns the whole grid — each registry category crossed with each
// measure it captured in the window — and the categories config decides which
// of those rows heads each system. Doing it the other way round, with the
// database picking the measure by reading count, would headline the cooling on
// humidity rather than temperature.
// ─────────────────────────────────────────────────────────────────────────────

interface SnapshotRow {
  category: string;
  measure: string;
  unit: string | null;
  assets_registered: number;
  assets_reporting: number;
  n_numeric: number;
  min_num: number | null;
  avg_num: number | null;
  max_num: number | null;
  n_breach: number;
  n_warn: number;
  last_reading: string | null;
}

export interface SystemSnapshot {
  category: CategoryDef;
  /** Null where this system captured nothing numeric in the window. */
  measure: string | null;
  unit: string | null;
  registered: number;
  reporting: number;
  readings: number;
  min: number | null;
  avg: number | null;
  max: number | null;
  breaches: number;
  warns: number;
  status: ReadingStatus | null;
  lastReading: Date | null;
}

/** database.types.ts predates get_system_snapshot. */
type UntypedRpc = (
  fn: string, args?: Record<string, unknown>
) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;

export function useSystemSnapshot(hours = 24): {
  systems: SystemSnapshot[];
  isLoading: boolean;
  error: string | null;
} {
  const { currentSite } = useCurrentSite();
  const siteUuid = currentSite?.id ?? null;
  const revision = useReadingsRevision(siteUuid);

  const [rows, setRows] = useState<SnapshotRow[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!siteUuid) { setLoading(true); return; }

    setLoading(true);
    setError(null);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    rpc("get_system_snapshot", { p_site_uuid: siteUuid, p_since: since })
      .then((r) => {
        if (cancelled) return;
        if (r.error) throw new Error(r.error.message);
        setRows((r.data as SnapshotRow[] | null) ?? []);
        setLoading(false);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message ?? "Could not read the systems");
        setRows([]);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [siteUuid, hours, revision]);

  const systems = useMemo<SystemSnapshot[]>(() => {
    return CATEGORIES.map((c) => {
      const dbCats = new Set<string>(c.dbCategories);

      // A category can span several registry categories — thermal covers both
      // ENVIRONMENT and AIRCON — so fold the matching rows together rather than
      // showing whichever one happened to sort first.
      const mine = rows.filter((r) => dbCats.has(r.category));
      const headline = c.headline
        ? mine.filter((r) => r.measure === c.headline)
        : [];

      const registered = mine.length
        ? [...new Set(mine.map((r) => r.category))]
            .reduce((sum, cat) => sum + (mine.find((r) => r.category === cat)?.assets_registered ?? 0), 0)
        : 0;

      if (headline.length === 0) {
        return {
          category: c, measure: null, unit: null,
          registered, reporting: 0, readings: 0,
          min: null, avg: null, max: null,
          breaches: 0, warns: 0, status: null, lastReading: null
        };
      }

      const readings  = headline.reduce((a, r) => a + r.n_numeric, 0);
      const reporting = headline.reduce((a, r) => a + r.assets_reporting, 0);
      const mins = headline.map((r) => r.min_num).filter((v): v is number => v !== null);
      const maxs = headline.map((r) => r.max_num).filter((v): v is number => v !== null);
      // Weighted, so a registry category contributing three readings does not
      // pull the average as hard as one contributing three hundred.
      const avg = readings > 0
        ? headline.reduce((a, r) => a + (r.avg_num ?? 0) * r.n_numeric, 0) / readings
        : null;

      const breaches = headline.reduce((a, r) => a + r.n_breach, 0);
      const warns    = headline.reduce((a, r) => a + r.n_warn, 0);
      const last = headline
        .map((r) => r.last_reading)
        .filter((v): v is string => !!v)
        .sort()
        .pop();

      return {
        category: c,
        measure: c.headline,
        unit: headline.find((r) => r.unit)?.unit ?? null,
        registered,
        reporting,
        readings,
        min: mins.length ? Math.min(...mins) : null,
        avg,
        max: maxs.length ? Math.max(...maxs) : null,
        breaches,
        warns,
        // Derived from what actually happened rather than from the average: a
        // system that spent an hour outside its limits is not "ok" because the
        // day averaged out.
        status: breaches > 0 ? "breach" : warns > 0 ? "warn" : readings > 0 ? "ok" : null,
        lastReading: last ? new Date(last) : null
      };
    });
  }, [rows]);

  return { systems, isLoading, error };
}

/** Re-exported so a card can colour a bare number without importing the domain. */
export { readingStatus };
