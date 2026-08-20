import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { useAuth } from "@/shared/context/AuthContext";

// ─────────────────────────────────────────────────────────────────────────────
// The technician's work queue.
//
// V1 gave technicians nothing: no assigned work, no due times, and no
// notifications of any kind — the alert bell lives only in the admin shell
// (audit C-10). A fault raised at the NOC never reached the person on the floor.
//
// This reads the work_queue view, which already resolves each item's SLA
// position, so the ordering rule lives in one place rather than being
// re-derived in every screen that shows work.
// ─────────────────────────────────────────────────────────────────────────────

export type WorkState = "OPEN" | "ACKNOWLEDGED" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" | "CANCELLED";
export type SlaStatus = "on-track" | "due-soon" | "breached" | "done";

export interface WorkItem {
  id:                string;
  title:             string;
  detail:            string | null;
  kind:              string;
  severity:          "P1" | "P2" | "P3" | "P4";
  severity_label:    string;
  state:             WorkState;
  origin:            string;
  source_kind:       string | null;
  assignee_id:       string | null;
  assignee_name:     string | null;
  due_at:            string | null;
  respond_by:        string | null;
  resolve_by:        string | null;
  acknowledged_at:   string | null;
  created_at:        string;
  overdue_minutes:   number;
  is_breached:       boolean;
  response_breached: boolean;
  sla_status:        SlaStatus;
}

export interface UseWorkQueueResult {
  items:      WorkItem[];
  /** Assigned to the signed-in technician specifically. */
  mine:       WorkItem[];
  /** Assigned to nobody — anyone can pick these up. */
  unassigned: WorkItem[];
  /** Open count, for the tab badge. */
  openCount:  number;
  breached:   number;
  isLoading:  boolean;
  error:      string | null;
  refresh:    () => void;
  claim:      (id: string) => Promise<void>;
  advance:    (id: string, to: WorkState, note?: string) => Promise<void>;
}

const ACTIVE: WorkState[] = ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS"];

/**
 * database.types.ts predates work_items and the work_queue view, so the typed
 * client rejects both by name. This is the same narrow escape hatch used for
 * the topology and capacity RPCs — delete it once types are regenerated:
 *
 *   npx supabase gen types typescript --project-id <id> > src/shared/types/database.types.ts
 */
type UntypedFrom = (table: string) => any;
const from = supabase.from.bind(supabase) as unknown as UntypedFrom;

export function useWorkQueue(): UseWorkQueueResult {
  const { currentSite } = useCurrentSite();
  const { employee } = useAuth();
  const [items, setItems]     = useState<WorkItem[]>([]);
  const [isLoading, setLoad]  = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [nonce, setNonce]     = useState(0);

  const siteId = currentSite?.id ?? null;
  const myId   = employee?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!siteId) { setLoad(true); return; }

    (async () => {
      setLoad(true);
      setError(null);
      try {
        const { data, error: qErr } = await from("work_queue")
          .select("*")
          .eq("site_uuid", siteId)
          .in("state", ACTIVE)
          // Most overdue first. A queue ordered by creation date teaches people
          // to work on the wrong thing.
          .order("is_breached", { ascending: false })
          .order("resolve_by",  { ascending: true });

        if (cancelled) return;
        if (qErr) { setError(qErr.message); setItems([]); }
        else      { setItems((data as WorkItem[] | null) ?? []); }
      } catch (err: any) {
        if (!cancelled) { setError(err?.message ?? "Could not load work"); setItems([]); }
      } finally {
        if (!cancelled) setLoad(false);
      }
    })();

    return () => { cancelled = true; };
  }, [siteId, nonce]);

  // A job an admin assigns must actually turn up on the technician's phone.
  // This effect only ran on mount, so a newly assigned job stayed invisible
  // until the app was reopened. work_items is not in the supabase_realtime
  // publication either (see 20260828_realtime_publication.sql), so polling is
  // what makes the admin -> technician handoff work today.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") setNonce(n => n + 1);
    };
    const poll = window.setInterval(tick, 30_000);
    // Technicians background the app constantly; refetch on return rather than
    // showing a stale queue until the next tick.
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const refresh = useCallback(() => setNonce(n => n + 1), []);

  // Claiming and acknowledging are one action. Picking up a job without
  // starting its response clock is how work sits "assigned" and untouched.
  const claim = useCallback(async (id: string) => {
    if (!myId) throw new Error("No employee record for the signed-in user");
    const { error: uErr } = await from("work_items")
      .update({ assignee_id: myId, state: "ACKNOWLEDGED" })
      .eq("id", id);
    if (uErr) throw new Error(uErr.message);
    refresh();
  }, [myId, refresh]);

  const advance = useCallback(async (id: string, to: WorkState, note?: string) => {
    const patch: Record<string, unknown> = { state: to };
    if (to === "RESOLVED") {
      // The database refuses a resolution with no note, so fail here with a
      // message a person can act on rather than surfacing a constraint error.
      if (!note || !note.trim()) throw new Error("Say what you did before closing this");
      patch.resolution_note = note.trim();
      patch.resolved_by = myId;
    }
    const { error: uErr } = await from("work_items").update(patch).eq("id", id);
    if (uErr) throw new Error(uErr.message);
    refresh();
  }, [myId, refresh]);

  return {
    items,
    mine:       items.filter(i => i.assignee_id === myId),
    unassigned: items.filter(i => i.assignee_id === null),
    openCount:  items.length,
    breached:   items.filter(i => i.is_breached).length,
    isLoading,
    error,
    refresh,
    claim,
    advance
  };
}
