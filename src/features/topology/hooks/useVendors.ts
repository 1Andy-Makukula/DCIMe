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

  return { vendors, isLoading, error, refresh, update, create };
}
