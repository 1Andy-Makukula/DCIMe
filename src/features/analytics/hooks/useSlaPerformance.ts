import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";

// ─────────────────────────────────────────────────────────────────────────────
// The management view of the work queue — the Technical -> Admin link.
//
// V1 had incidents and it had an executive dashboard, with nothing between
// them: severity mapped to no obligation, aging was a cosmetic chip, and
// nobody's fault ever became anybody's cost (audit G-02).
//
// Reads work_items through get_sla_performance(), the same table the technician
// queue reads. One source, so the boardroom and the floor cannot disagree.
// ─────────────────────────────────────────────────────────────────────────────

export interface SlaPerformance {
  generated_at:       string;
  window_from:        string;
  open_total:         number;
  unassigned:         number;
  /** Open work nobody has acknowledged — the number that says whether the
   *  queue is being watched at all. */
  unacknowledged:     number;
  breached_now:       number;
  by_severity:        Record<string, number>;
  /** Mean minutes to acknowledgement. Slow here is a staffing or notification
   *  problem, which is a different fix from slow resolution. */
  mtta_minutes:       number | null;
  mttr_minutes:       number | null;
  resolved_in_window: number;
  met_target:         number;
  compliance_pct:     number | null;
  /** Hours, not currency: vendor and labour rates do not exist yet, and an
   *  invented figure would be worse than none. */
  engineer_hours:     number;
  origin_mix:         Record<string, number>;
}

export interface SlaBreach {
  out_id:            string;
  out_title:         string;
  out_severity:      string;
  out_state:         string;
  out_assignee:      string;
  out_overdue_hours: number;
  out_origin:        string;
  out_kind:          string;
}

export interface UseSlaPerformanceResult {
  performance: SlaPerformance | null;
  breaches:    SlaBreach[];
  isLoading:   boolean;
  error:       string | null;
  refresh:     () => void;
}

/** database.types.ts predates these functions — see useWorkQueue for the rationale. */
type UntypedRpc = (
  fn: string,
  args?: Record<string, unknown>
) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;

export function useSlaPerformance(sinceDays = 30): UseSlaPerformanceResult {
  const { currentSite } = useCurrentSite();
  const [performance, setPerformance] = useState<SlaPerformance | null>(null);
  const [breaches, setBreaches]       = useState<SlaBreach[]>([]);
  const [isLoading, setLoad]          = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [nonce, setNonce]             = useState(0);

  const siteId = currentSite?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!siteId) { setLoad(true); return; }

    (async () => {
      setLoad(true);
      setError(null);
      try {
        const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
        const [perf, brs] = await Promise.all([
          rpc("get_sla_performance", { p_site_uuid: siteId, p_since: since }),
          rpc("get_sla_breaches",    { p_site_uuid: siteId })
        ]);
        if (cancelled) return;

        if (perf.error) { setError(perf.error.message); setPerformance(null); }
        else            { setPerformance((perf.data as SlaPerformance | null) ?? null); }

        // A failure to list breaches must not blank the whole panel — the
        // headline numbers are still worth showing.
        setBreaches(brs.error ? [] : ((brs.data as SlaBreach[] | null) ?? []));
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? "Could not load SLA performance");
      } finally {
        if (!cancelled) setLoad(false);
      }
    })();

    return () => { cancelled = true; };
  }, [siteId, sinceDays, nonce]);

  return {
    performance,
    breaches,
    isLoading,
    error,
    refresh: useCallback(() => setNonce(n => n + 1), [])
  };
}
