import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";
import type { TopologyGraph, TopologyNode } from "@/features/topology/utils/topologyGeometry";

// ─────────────────────────────────────────────────────────────────────────────
// Loads a site's power topology over the get_topology_graph() contract.
//
// The contract types and geometry helpers live in
// features/topology/utils/topologyGeometry.ts, deliberately free of any network
// dependency so the renderer can be built and tested without a database.
//
// The RPC runs SECURITY INVOKER, so RLS applies to the calling user: a
// technician can only ever pull their own site's graph.
// ─────────────────────────────────────────────────────────────────────────────

export type {
  EngineType, RenderShape, InputPolicy,
  TopologyNode, TopologyEdge, TopologyGraph, ViewBox
} from "@/features/topology/utils/topologyGeometry";
export { computeViewBox, fallbackPath } from "@/features/topology/utils/topologyGeometry";

export interface UseTopologyGraphResult {
  graph:     TopologyGraph | null;
  /** Nodes the physics engine should load — a subset of graph.nodes. */
  simulated: TopologyNode[];
  isLoading: boolean;
  error:     string | null;
  refresh:   () => void;
}

const EMPTY: TopologyNode[] = [];

/**
 * src/shared/types/database.types.ts predates get_topology_graph, so the
 * generated `Database` type carries no signature for it and the typed client
 * rejects the call.
 *
 * This is the single, narrow escape hatch. Delete it and call
 * `supabase.rpc("get_topology_graph", …)` directly once types have been
 * regenerated against a database carrying 20260814_topology_layout.sql:
 *
 *     npx supabase gen types typescript --project-id <id> > src/shared/types/database.types.ts
 */
type UntypedRpc = (
  fn: string,
  args?: Record<string, unknown>
) => Promise<{ data: unknown; error: { message: string } | null }>;

const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;

/**
 * Loads a site's power topology.
 *
 * Pass a siteUuid to inspect a specific site (the sandbox, for instance);
 * omit it and the RPC resolves the caller's own site from their JWT.
 */
export function useTopologyGraph(siteUuid?: string): UseTopologyGraphResult {
  const { currentSite } = useCurrentSite();
  const [graph, setGraph]         = useState<TopologyGraph | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError]         = useState<string | null>(null);
  const [nonce, setNonce]         = useState<number>(0);

  const targetSite = siteUuid ?? currentSite?.id ?? null;

  useEffect(() => {
    let cancelled = false;

    // Site context resolves asynchronously. Querying before it lands would ask
    // the RPC to fall back to the JWT's site, which is not necessarily the site
    // the user is looking at — so wait rather than fetch the wrong graph.
    if (!targetSite) {
      setIsLoading(true);
      return;
    }

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const { data, error: rpcError } = await rpc("get_topology_graph", {
          p_site_uuid: targetSite
        });
        if (cancelled) return;

        if (rpcError) {
          setError(rpcError.message);
          setGraph(null);
        } else {
          setGraph((data as TopologyGraph | null) ?? null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? "Failed to load topology");
          setGraph(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [targetSite, nonce]);

  const refresh = useCallback(() => setNonce(n => n + 1), []);

  return {
    graph,
    simulated: graph?.nodes.filter(n => n.simulated) ?? EMPTY,
    isLoading,
    error,
    refresh
  };
}
