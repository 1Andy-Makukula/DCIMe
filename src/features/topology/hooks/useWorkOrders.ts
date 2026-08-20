import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";
import type { SignatureResult } from "@/shared/ui";

// ─────────────────────────────────────────────────────────────────────────────
// The admin half of the work item spine.
//
// Until now work_items could only be created by database triggers (threshold
// alarms, contractor findings, preventive schedules) and could only be moved
// by the technician who claimed them. There was no way for a person to raise a
// job, no way to direct it at someone, and nothing that CLOSED a resolved one —
// so the queue had no terminal state and admin/tech never actually met.
// ─────────────────────────────────────────────────────────────────────────────

// Generated types predate work_items; see MEMORY design-token note on regen.
type UntypedFrom = (table: string) => any;
const from = supabase.from.bind(supabase) as unknown as UntypedFrom;

export type WorkState =
  | "OPEN" | "ACKNOWLEDGED" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" | "CANCELLED";

export interface WorkOrder {
  id:              string;
  title:           string;
  detail:          string | null;
  kind:            string;
  severity:        string;
  state:           WorkState;
  origin:          string;
  assignee_id:     string | null;
  assignee_name:   string | null;
  /** Shortlist it was offered to. null = broadcast to the whole site. */
  offered_to:      string[] | null;
  due_at:          string | null;
  resolved_at:     string | null;
  resolution_note: string | null;
  created_at:      string;
  /** The mark of whoever confirmed the work, captured at close. */
  signature_image: string | null;
  signed_at:       string | null;
  signed_name:     string | null;
}

export interface Technician { id: string; full_name: string; role: string; }

export interface NewWorkOrder {
  title:    string;
  detail:   string;
  kind:     string;
  severity: string;
  /**
   * Who the job is OFFERED to. An empty array broadcasts to the whole site.
   *
   * Offering is not assigning: ownership is only established when somebody
   * accepts, which is what makes the response clock and the accountability
   * trail mean anything. One name here still requires that person to accept.
   */
  offered_to: string[];
  /** LOCAL "YYYY-MM-DDTHH:mm" as the datetime-local control produces it. */
  due_at:   string | null;
}

export function useWorkOrders() {
  const { currentSite } = useCurrentSite();
  const [orders, setOrders]   = useState<WorkOrder[]>([]);
  const [techs, setTechs]     = useState<Technician[]>([]);
  const [isLoading, setLoad]  = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const siteId = currentSite?.id ?? null;

  const fetchAll = useCallback(async () => {
    if (!siteId) { setOrders([]); setLoad(false); return; }
    try {
      setError(null);
      const { data, error: e } = await from("work_items")
        .select("id,title,detail,kind,severity,state,origin,assignee_id,offered_to,due_at,resolved_at,resolution_note,created_at,signature_image,signed_at,signed_name,employees:assignee_id(full_name)")
        .eq("site_uuid", siteId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (e) throw e;

      setOrders((data ?? []).map((r: any) => ({
        ...r,
        assignee_name: r.employees?.full_name ?? null
      })));
    } catch (err: any) {
      console.error("[DCIMe] Failed to load work orders:", err);
      setError(err.message ?? "Could not load work orders.");
    } finally {
      setLoad(false);
    }
  }, [siteId]);

  useEffect(() => {
    fetchAll();
    // Same reason the NOC polls: postgres_changes only fires for tables in the
    // supabase_realtime publication, and this one was never added either.
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") fetchAll();
    }, 30_000);
    return () => window.clearInterval(poll);
  }, [fetchAll]);

  useEffect(() => {
    (async () => {
      const { data } = await from("employees")
        .select("id,full_name,role")
        .eq("status", "ACTIVE")
        .order("full_name");
      setTechs((data ?? []) as Technician[]);
    })();
  }, []);

  const create = useCallback(async (draft: NewWorkOrder) => {
    if (!siteId) throw new Error("No site selected.");
    const { data: { user } } = await supabase.auth.getUser();

    const { error: e } = await from("work_items").insert([{
      site_uuid:   siteId,
      title:       draft.title.trim(),
      detail:      draft.detail.trim() || null,
      kind:        draft.kind,
      severity:    draft.severity,
      // NULL rather than an empty array: "offered to nobody in particular" is
      // a broadcast, and an empty array would read as "offered to no one".
      offered_to:  draft.offered_to.length > 0 ? draft.offered_to : null,
      // Local -> UTC happens once, here. The form must keep the control's
      // own format or the field cannot render its own value back.
      due_at:      draft.due_at ? new Date(draft.due_at).toISOString() : null,
      // ORIGIN matters for the audit trail: it separates a job a person chose
      // to raise from one a threshold crossing produced.
      origin:      "ADMIN",
      state:       "OPEN",
      created_by:  user?.id ?? null
    }]);
    if (e) throw e;
    await fetchAll();
  }, [siteId, fetchAll]);

  /** Reassign, or hand back to the pool by passing null. */
  const reassign = useCallback(async (id: string, assignee_id: string | null) => {
    const { error: e } = await from("work_items").update({ assignee_id }).eq("id", id);
    if (e) throw e;
    await fetchAll();
  }, [fetchAll]);

  /**
   * RESOLVED -> CLOSED, against a handwritten signature.
   *
   * The technician says the work is done; a named person confirms it. Closing
   * on a bare button press attributes the decision to an account rather than a
   * person — the signature is what makes the record answerable later.
   *
   * signed_name is denormalised beside signed_by's absence deliberately: the
   * closed record has to keep reading correctly on a printed job card even if
   * the employee row is later removed.
   */
  const close = useCallback(async (id: string, sig: SignatureResult, signerName: string) => {
    // An unattributed signature is worse than none: the whole point of the
    // mark is that a named person stands behind the decision.
    const who = signerName.trim();
    if (!who) throw new Error("Cannot sign without a signed-in identity. Sign in again and retry.");

    const { data, error: e } = await from("work_items")
      // signed_name is stamped server-side by stamp_work_signature(). The
      // local identity is still checked first so the UI can refuse early with
      // a useful message rather than surfacing a raw trigger exception.
      .update({
        state:           "CLOSED",
        signature_image: sig.dataUrl,
        signed_at:       sig.signedAt
      })
      .eq("id", id)
      // Constrained to RESOLVED, which the state-machine trigger does NOT
      // cover: it only validates when the state actually changes, so closing
      // an already-CLOSED row passes straight through and overwrites the first
      // signer's mark. Two admins on the same job would silently replace each
      // other's signature.
      .eq("state", "RESOLVED")
      .select("id");
    if (e) throw e;
    // PostgREST reports no error when RLS filters the row away or the guard
    // above matched nothing. Without this check the UI announces success for
    // an update that never happened.
    if (!data || data.length === 0) {
      throw new Error("That job was not closed — it may have been closed already, or you may not have permission.");
    }
    await fetchAll();
  }, [fetchAll]);

  const cancel = useCallback(async (id: string, why: string) => {
    // The resolution CHECK constraint also covers CANCELLED-with-no-note via
    // RESOLVED/CLOSED; recording why here keeps the history readable anyway.
    const { error: e } = await from("work_items")
      .update({ state: "CANCELLED", resolution_note: why }).eq("id", id);
    if (e) throw e;
    await fetchAll();
  }, [fetchAll]);

  return { orders, techs, isLoading, error, refresh: fetchAll, create, reassign, close, cancel };
}
