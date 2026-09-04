// src/features/analytics/hooks/usePeriodReview.ts
import { useEffect, useState } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { useReadingsRevision } from "@/shared/api/readingsRevision";

// ─────────────────────────────────────────────────────────────────────────────
// One account of a period, in one call.
//
// Every section of the review shares the window boundaries the RPC was given,
// which is the whole point of asking for the document rather than assembling it
// from six queries that each decide for themselves what "August" means.
// ─────────────────────────────────────────────────────────────────────────────

export interface PeriodCoverage {
  rounds_logged: number;
  rounds_expected: number;
  coverage_pct: number;
  hours_unlogged: number;
  technicians: number;
  first_hour: string | null;
  last_hour: string | null;
}

export interface PeriodIncidents {
  opened: number;
  closed: number;
  still_open: number;
  serious: number;
  mttr_hours: number | null;
}

export interface PlantRow {
  category: string;
  measure: string;
  assets: number;
  readings: number;
  min_num: number | null;
  avg_num: number | null;
  max_num: number | null;
  warns: number;
  breaches: number;
}

export interface ExceptionRow {
  asset_name: string;
  equipment_id: string;
  measure: string;
  breach_readings: number;
  warn_readings: number;
  min_num: number | null;
  max_num: number | null;
  first_seen: string;
  last_seen: string;
}

export interface TechnicianRow { name: string; rounds: number; days: number }
export interface VendorRow { vendor: string; incidents: number }

export interface PeriodReview {
  generated_at: string;
  window_from: string;
  window_to: string;
  window_hours: number;
  coverage: PeriodCoverage;
  incidents: PeriodIncidents;
  plant: PlantRow[];
  exceptions: ExceptionRow[];
  technicians: TechnicianRow[];
  vendors: VendorRow[];
}

/** database.types.ts predates get_period_review. */
type UntypedRpc = (
  fn: string, args?: Record<string, unknown>
) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;

export function usePeriodReview(from: Date, to: Date) {
  const { currentSite } = useCurrentSite();
  const siteUuid = currentSite?.id ?? null;
  const revision = useReadingsRevision(siteUuid);

  const [review, setReview] = useState<PeriodReview | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fromMs = from.getTime();
  const toMs = to.getTime();

  useEffect(() => {
    let cancelled = false;
    if (!siteUuid) { setLoading(true); return; }

    setLoading(true);
    setError(null);

    rpc("get_period_review", {
      p_site_uuid: siteUuid,
      p_from: new Date(fromMs).toISOString(),
      p_to: new Date(toMs).toISOString()
    })
      .then((r) => {
        if (cancelled) return;
        if (r.error) throw new Error(r.error.message);
        setReview((r.data as PeriodReview | null) ?? null);
        setLoading(false);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.message ?? "Could not build the review");
        setReview(null);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [siteUuid, fromMs, toMs, revision]);

  return { review, isLoading, error };
}
