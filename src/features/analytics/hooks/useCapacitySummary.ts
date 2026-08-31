import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { useReadingsRevision } from "./useReadingsRevision";

// ─────────────────────────────────────────────────────────────────────────────
// Capacity, as governed by redundancy rather than by utilisation.
//
// Naive headroom lies in a redundant facility. Two UPS each at 45% look like
// "55% free", but losing either drives the survivor to 90% — so the installable
// headroom is nearly zero. Every rack added on the strength of that 55% is a
// rack that drops when one UPS trips.
//
// N+1 headroom is capacity remaining AFTER the worst single upstream failure.
// It is computable only because the graph knows which feeds are redundant.
//
// Served by SQL rather than the WASM engine: a dashboard needs this for every
// site at once, cached, with no browser running a simulation. The engine stays
// authoritative for LIVE state; these two must agree.
// ─────────────────────────────────────────────────────────────────────────────

export interface RedundancyGroup {
  target:      string;
  name:        string;
  policy:      "ANY" | "ALL" | "PRIORITY";
  feeders:     number;
  load_kw:     number;
  n_plus_1_kw: number;
  n_plus_1_ok: boolean;
}

export interface ConstrainedItem {
  equipment:   string;
  name:        string;
  load_pct:    number;
  headroom_kw: number;
}

export interface CapacitySummary {
  generated_at:      string;
  /** Measured at the conversion tier (UPS + rectifier output), never by summing
   *  racks — racks sit downstream of that meter, so counting both double-counts. */
  it_load_kw:        number;
  cooling_load_kw:   number;
  redundancy:        RedundancyGroup[];
  constrained:       ConstrainedItem[];
  n_plus_1_breaches: number;
}

export type Posture = "healthy" | "constrained" | "at-risk";

export interface UseCapacitySummaryResult {
  summary:   CapacitySummary | null;
  /** Site posture, derived from redundancy — not from a utilisation percentage. */
  posture:   Posture;
  isLoading: boolean;
  error:     string | null;
  refresh:   () => void;
}

/**
 * database.types.ts predates these functions. Delete once regenerated against a
 * database carrying 20260817_capacity_analysis.sql.
 */
type UntypedRpc = (
  fn: string,
  args?: Record<string, unknown>
) => Promise<{ data: unknown; error: { message: string } | null }>;

const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;

/**
 * A breached N+1 group outranks any amount of spare capacity: it means a single
 * failure drops load. Utilisation alone never reaches "at-risk", because a
 * facility at 85% with intact redundancy is in better shape than one at 40%
 * running on a single feed.
 */
function derivePosture(s: CapacitySummary | null): Posture {
  if (!s) return "healthy";
  if (s.n_plus_1_breaches > 0) return "at-risk";
  if (s.constrained.some(c => c.load_pct > 90)) return "at-risk";
  if (s.constrained.length > 0) return "constrained";
  return "healthy";
}

export function useCapacitySummary(siteUuid?: string): UseCapacitySummaryResult {
  const { currentSite } = useCurrentSite();
  const [summary, setSummary] = useState<CapacitySummary | null>(null);
  const [isLoading, setLoad]  = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [nonce, setNonce]     = useState(0);

  const targetSite = siteUuid ?? currentSite?.id ?? null;
  const revision = useReadingsRevision(targetSite);

  useEffect(() => {
    let cancelled = false;
    if (!targetSite) { setLoad(true); return; }

    (async () => {
      setLoad(true);
      setError(null);
      try {
        const { data, error: rpcError } = await rpc("get_capacity_summary", {
          p_site_uuid: targetSite
        });
        if (cancelled) return;
        if (rpcError) { setError(rpcError.message); setSummary(null); }
        else          { setSummary((data as CapacitySummary | null) ?? null); }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? "Could not load capacity analysis");
          setSummary(null);
        }
      } finally {
        if (!cancelled) setLoad(false);
      }
    })();

    return () => { cancelled = true; };
  }, [targetSite, nonce, revision]);

  return {
    summary,
    posture: derivePosture(summary),
    isLoading,
    error,
    refresh: useCallback(() => setNonce(n => n + 1), [])
  };
}
