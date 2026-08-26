import { useState, useEffect, useCallback, useMemo } from "react";
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
//
// Assignment here is a COMMAND, not an offer. An admin picks one person,
// several, or everyone on shift; all of them are expected to acknowledge, and
// whichever of them starts the work becomes its owner. There is no accept step
// to model, and modelling one left jobs unanswered with nobody at fault.
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
  /** Whoever STARTED the work. Null until somebody does. */
  assignee_id:     string | null;
  assignee_name:   string | null;
  /** Everyone the job was given to. null only on rows predating assignment. */
  assigned_to:     string[] | null;
  assigned_scope:  AssignScope | null;
  /** Employee ids that have confirmed receipt, one row each. */
  acked_by:        string[];
  due_at:          string | null;
  resolved_at:     string | null;
  resolution_note: string | null;
  created_at:      string;
  /** The mark of whoever confirmed the work, captured at close. */
  signature_image: string | null;
  signed_at:       string | null;
  signed_name:     string | null;
}

/**
 * How the recipients were chosen. Worth storing because the routes are not
 * equivalent after the fact: ON_SHIFT and ALL_ACTIVE can resolve to the same
 * list on a quiet night, and only this says whether the admin aimed at the
 * roster or was told the roster was empty and went wide anyway.
 */
export type AssignScope = "INDIVIDUAL" | "GROUP" | "ON_SHIFT" | "ALL_ACTIVE";

export interface Technician {
  id: string; full_name: string; role: string;
  /** Stored status: only ever 'Active' or 'Revoked' (CHECK constraint). */
  status?: string;
  /** Derived, not stored — an open shift_sessions row. */
  on_shift: boolean;
}

export interface NewWorkOrder {
  title:    string;
  detail:   string;
  kind:     string;
  severity: string;
  /**
   * Who the job is given to. An empty array means "everyone on shift", which
   * create() resolves to real people before it writes.
   *
   * This is an instruction, not an invitation. Everybody named is expected to
   * acknowledge; whichever of them starts the work becomes its owner.
   */
  assigned_to: string[];
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
        // work_item_acks rides along as an embedded resource rather than a
        // second round trip: "3 of 4 acknowledged" is the number this page
        // exists to show, and it is useless a poll interval out of date.
        .select("id,title,detail,kind,severity,state,origin,assignee_id,assigned_to,assigned_scope,due_at,resolved_at,resolution_note,created_at,signature_image,signed_at,signed_name,employees:assignee_id(full_name),work_item_acks(employee_id)")
        .eq("site_uuid", siteId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (e) throw e;

      setOrders((data ?? []).map((r: any) => ({
        ...r,
        assignee_name: r.employees?.full_name ?? null,
        acked_by: (r.work_item_acks ?? []).map((a: any) => a.employee_id)
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
    if (!siteId) { setTechs([]); return; }
    (async () => {
      // Excludes the revoked rather than matching an exact status string. The
      // stored values are 'Active' and 'Revoked' — that is the whole domain,
      // per the CHECK constraint in 20260728_close_security_holes.sql — so an
      // .eq() on 'ACTIVE' matched NOBODY, Postgres comparing case-sensitively.
      // The picker came up empty and assignment looked as though it had been
      // taken away. ("On-Shift" is a derived label, not a stored status; it
      // means an open shift_sessions row, which is fetched separately below.)
      //
      // Scoped to THIS site: work_items are site-scoped, so assigning a job to
      // somebody stationed elsewhere produces work nobody can attend.
      const [roster, sessions] = await Promise.all([
        from("employees")
          .select("id,full_name,role,status")
          .eq("site_uuid", siteId)
          .neq("status", "Revoked")
          .order("full_name"),
        from("shift_sessions")
          .select("employee_id")
          .eq("site_uuid", siteId)
          .eq("status", "ACTIVE")
      ]);

      if (roster.error)   console.error("[DCIMe] Failed to load technicians:", roster.error);
      if (sessions.error) console.error("[DCIMe] Failed to load shift sessions:", sessions.error);

      const onShift = new Set<string>((sessions.data ?? []).map((s: any) => s.employee_id));
      setTechs((roster.data ?? []).map((r: any) => ({ ...r, on_shift: onShift.has(r.id) })));
    })();
  }, [siteId]);

  /**
   * Everyone currently checked in. Drives both the pre-submit warning and the
   * fallback. Memoised because create() closes over it — a fresh array every
   * render would rebuild the callback on every keystroke in the form.
   */
  const onShift = useMemo(() => techs.filter(t => t.on_shift), [techs]);

  /**
   * Raise a job and give it to somebody.
   *
   * An empty `assigned_to` means "everyone on shift", and it is resolved to
   * actual employee ids HERE rather than stored as a null wildcard. The
   * question asked after an incident is always "who was told", and a wildcard
   * answers it differently at 06:00 than at 18:00 — the people who were
   * genuinely on the floor when the job went out drop off their own record at
   * shift change. Snapshotting costs an array and keeps the answer fixed.
   *
   * Returns what it actually did, because the on-shift fallback means the
   * outcome is not always the one the button described.
   */
  const create = useCallback(async (draft: NewWorkOrder)
    : Promise<{ recipients: number; scope: AssignScope }> => {
    if (!siteId) throw new Error("No site selected.");

    let recipients: string[];
    let scope: AssignScope;

    if (draft.assigned_to.length > 0) {
      recipients = draft.assigned_to;
      scope      = recipients.length === 1 ? "INDIVIDUAL" : "GROUP";
    } else if (onShift.length > 0) {
      recipients = onShift.map(t => t.id);
      scope      = "ON_SHIFT";
    } else {
      // Check-in is a soft prompt (20260803_shift_sessions.sql), so an empty
      // roster usually means nobody tapped the button, not that the site is
      // unmanned. Widening beats refusing: a P1 raised at 03:00 must not be
      // blocked by a technician who forgot to check in. The scope records that
      // this is what happened, so the wide audience is not read later as a
      // deliberate choice.
      recipients = techs.map(t => t.id);
      scope      = "ALL_ACTIVE";
    }

    if (recipients.length === 0) {
      throw new Error("There is nobody at this site to assign work to. Add a technician first.");
    }

    const { data: { user } } = await supabase.auth.getUser();

    const { error: e } = await from("work_items").insert([{
      site_uuid:      siteId,
      title:          draft.title.trim(),
      detail:         draft.detail.trim() || null,
      kind:           draft.kind,
      severity:       draft.severity,
      assigned_to:    recipients,
      assigned_scope: scope,
      // Local -> UTC happens once, here. The form must keep the control's
      // own format or the field cannot render its own value back.
      due_at:         draft.due_at ? new Date(draft.due_at).toISOString() : null,
      // ORIGIN matters for the audit trail: it separates a job a person chose
      // to raise from one a threshold crossing produced.
      origin:         "ADMIN",
      state:          "OPEN",
      // assignee_id is deliberately absent. Being told to do a job is not the
      // same as being on it, and the queue reads wrong if it claims otherwise
      // before anybody has started.
      created_by:     user?.id ?? null
    }]);
    if (e) throw e;
    await fetchAll();
    return { recipients: recipients.length, scope };
  }, [siteId, techs, onShift, fetchAll]);

  /**
   * Redirect a job that has gone to the wrong people.
   *
   * The only correction available, because a technician cannot decline: a job
   * aimed at the wrong person stays aimed there until an admin moves it.
   *
   * Restricted to work nobody has STARTED. Once somebody is on it, retargeting
   * is not a reassignment — it strands a person mid-task, and the state machine
   * has no route back from IN_PROGRESS to un-started anyway (20260820a). The
   * honest correction there is to cancel the job with a reason and raise a new
   * one, which the Reject path already does.
   */
  const reassign = useCallback(async (id: string, assigned_to: string[]) => {
    if (assigned_to.length === 0) throw new Error("Pick at least one person.");
    const { data, error: e } = await from("work_items")
      .update({
        assigned_to,
        assigned_scope: assigned_to.length === 1 ? "INDIVIDUAL" : "GROUP"
      })
      .eq("id", id)
      // Re-checked here and not only in the UI: the queue polls every 30s, so
      // somebody can start the job between the panel rendering and Save.
      .is("assignee_id", null)
      .select("id");
    if (e) throw e;
    // PostgREST reports no error when the guard above matches nothing.
    if (!data || data.length === 0) {
      throw new Error("That job was not reassigned — somebody has already started it.");
    }
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

  return {
    orders, techs, onShift, isLoading, error,
    refresh: fetchAll, create, reassign, close, cancel
  };
}
