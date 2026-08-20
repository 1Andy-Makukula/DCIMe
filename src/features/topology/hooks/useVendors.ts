import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/shared/api/supabaseClient";

// ─────────────────────────────────────────────────────────────────────────────
// The vendor register.
//
// V1 stored contractors as free text typed on every visit and every resolution,
// so "Cummins", "Cummins Zambia" and "cummins engineers" were three different
// companies. Nobody could answer "how many times has this contractor been out
// this quarter, and what did they find" (audit A-06).
//
// Reads vendor_activity, which already joins visits, findings and the work
// raised from them — so the counts on screen and the counts in a report come
// from the same place.
// ─────────────────────────────────────────────────────────────────────────────

export interface VendorActivity {
  vendor_id:        string;
  vendor_name:      string;
  speciality:       string | null;
  sla_hours:        number | null;
  visits:           number;
  findings:         number;
  serious_findings: number;
  open_work:        number;
  last_visit:       string | null;
  is_active:        boolean;
  /** Why this contractor needs review before dispatch. NULL = not flagged. */
  flagged_reason:   string | null;
  flagged_at:       string | null;
}

export interface VendorPatch {
  name?:          string;
  contact_name?:  string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  speciality?:    string | null;
  sla_hours?:     number | null;
  is_active?:     boolean;
}

export interface UseVendorsResult {
  vendors:   VendorActivity[];
  isLoading: boolean;
  error:     string | null;
  refresh:   () => void;
  update:    (id: string, patch: VendorPatch) => Promise<void>;
  create:    (name: string) => Promise<void>;
  /** Raise or clear a review flag. A reason is required to raise one. */
  flag:      (id: string, reason: string | null) => Promise<void>;
  /** Retire without losing history. Reversible. */
  setActive: (id: string, active: boolean) => Promise<void>;
  /**
   * Permanent. Refuses when the vendor has any recorded history, because
   * deleting it would take visits and findings with it.
   */
  remove:    (id: string) => Promise<void>;
}

/** database.types.ts predates these tables — see useWorkQueue for the rationale. */
type UntypedFrom = (table: string) => any;
const from = supabase.from.bind(supabase) as unknown as UntypedFrom;

export function useVendors(): UseVendorsResult {
  const [vendors, setVendors] = useState<VendorActivity[]>([]);
  const [isLoading, setLoad]  = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [nonce, setNonce]     = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoad(true);
      setError(null);
      try {
        const { data, error: qErr } = await from("vendor_activity")
          .select("*")
          // Most active first: a register sorted alphabetically buries the
          // vendors anyone actually deals with.
          .order("visits", { ascending: false });

        if (cancelled) return;
        if (qErr) { setError(qErr.message); setVendors([]); }
        else      { setVendors((data as VendorActivity[] | null) ?? []); }
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? "Could not load vendors");
      } finally {
        if (!cancelled) setLoad(false);
      }
    })();
    return () => { cancelled = true; };
  }, [nonce]);

  const refresh = useCallback(() => setNonce(n => n + 1), []);

  const update = useCallback(async (id: string, patch: VendorPatch) => {
    const { error: uErr } = await from("vendors").update(patch).eq("id", id);
    if (uErr) throw new Error(uErr.message);
    refresh();
  }, [refresh]);

  const create = useCallback(async (name: string) => {
    const clean = name.trim();
    if (!clean) throw new Error("Give the vendor a name");
    // normalised is what deduplicates; the database computes the same value on
    // every visit, so a manual entry and a typed-in one converge on one row.
    const normalised = clean.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const { error: iErr } = await from("vendors").insert({ name: clean, normalised });
    if (iErr) {
      throw new Error(
        iErr.message.includes("duplicate") || iErr.message.includes("unique")
          ? "That vendor is already registered"
          : iErr.message
      );
    }
    refresh();
  }, [refresh]);

  const flag = useCallback(async (id: string, reason: string | null) => {
    const why = reason?.trim() || null;
    // A flag with no reason cannot be acted on by whoever reads it next, which
    // is the entire point of flagging rather than just remembering.
    const { error: e } = await from("vendors")
      .update({ flagged_reason: why, flagged_at: why ? new Date().toISOString() : null })
      .eq("id", id);
    if (e) throw e;
    refresh();
  }, [refresh]);

  const setActive = useCallback(async (id: string, active: boolean) => {
    const { error: e } = await from("vendors").update({ is_active: active }).eq("id", id);
    if (e) throw e;
    refresh();
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    // Guarded in the client because the answer is already on screen: a vendor
    // with visits or findings is referenced by history, and removing it would
    // either fail on the foreign key or destroy the record of work done.
    // Retiring is what people actually want in that case.
    const v = vendors.find(x => x.vendor_id === id);
    if (v && (v.visits > 0 || v.findings > 0)) {
      throw new Error(
        `${v.vendor_name} has ${v.visits} visit(s) and ${v.findings} finding(s) on record. ` +
        "Deleting would destroy that history — retire the vendor instead."
      );
    }
    const { data, error: e } = await from("vendors").delete().eq("id", id).select("id");
    if (e) throw e;
    if (!data || data.length === 0) {
      throw new Error("Nothing was deleted — you may not have permission.");
    }
    refresh();
  }, [vendors, refresh]);

  return { vendors, isLoading, error, refresh, update, create, flag, setActive, remove };
}
