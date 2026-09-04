// src/features/topology/hooks/useVendorDetail.ts
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";

// ─────────────────────────────────────────────────────────────────────────────
// One vendor, as a relationship rather than a row.
//
// The register answers "who is on our list". This answers the questions asked
// in the meeting after that: who do we call, what did we agree, are they still
// legal to be on site, what have they touched, and are they any good.
// ─────────────────────────────────────────────────────────────────────────────

export interface VendorRecord {
  id: string;
  name: string;
  speciality: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  sla_hours: number | null;
  is_active: boolean;
  flagged_reason: string | null;
}

export interface VendorContact {
  id: string;
  vendor_id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  is_escalation: boolean;
  notes: string | null;
}

export interface VendorContract {
  id: string;
  vendor_id: string;
  site_uuid: string | null;
  reference: string | null;
  starts_on: string | null;
  expires_on: string | null;
  response_hours: number | null;
  restore_hours: number | null;
  callout_rate: number | null;
  hourly_rate: number | null;
  currency: string;
  payment_terms_days: number | null;
  renewal_notice_days: number | null;
  insurance_expires_on: string | null;
  workmens_comp_expires_on: string | null;
  tax_clearance_expires_on: string | null;
  safety_induction_expires_on: string | null;
  is_active: boolean;
  notes: string | null;
}

export interface VendorCoverage {
  id: string;
  vendor_id: string;
  site_uuid: string;
  category: string | null;
  equipment_id: string | null;
}

export interface VendorScorecard {
  generated_at: string;
  window_from: string;
  window_to: string;
  contract: {
    reference: string | null;
    expires_on: string | null;
    days_to_expiry: number | null;
    response_hours: number | null;
    restore_hours: number | null;
    currency: string | null;
    callout_rate: number | null;
  } | null;
  compliance: {
    insurance_expires_on: string | null;
    workmens_comp_expires_on: string | null;
    tax_clearance_expires_on: string | null;
    safety_induction_expires_on: string | null;
    soonest_expiry: string | null;
  };
  activity: {
    incidents: number;
    incidents_resolved: number;
    incidents_open: number;
    visits: number;
    last_visit: string | null;
    work_items: number;
    work_items_open: number;
  };
  performance: {
    mean_restore_hours: number | null;
    worst_restore_hours: number | null;
    restore_target_hours: number | null;
    met_restore_target: number | null;
    repeat_visits_30d: number;
    assets_touched: number;
  };
}

/** database.types.ts predates the vendor spine tables and the scorecard. */
type UntypedFrom = (table: string) => any;
const from = supabase.from.bind(supabase) as unknown as UntypedFrom;
type UntypedRpc = (
  fn: string, args?: Record<string, unknown>
) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;

export function useVendorDetail(vendorId: string | undefined, windowDays = 365) {
  const { currentSite } = useCurrentSite();
  const [vendor, setVendor]       = useState<VendorRecord | null>(null);
  const [contacts, setContacts]   = useState<VendorContact[]>([]);
  const [contracts, setContracts] = useState<VendorContract[]>([]);
  const [coverage, setCoverage]   = useState<VendorCoverage[]>([]);
  const [scorecard, setScorecard] = useState<VendorScorecard | null>(null);
  const [isLoading, setLoading]   = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [nonce, setNonce]         = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!vendorId) { setLoading(false); return; }

    setLoading(true);
    setError(null);

    const to = new Date();
    const fromDate = new Date(to.getTime() - windowDays * 24 * 60 * 60 * 1000);

    (async () => {
      try {
        const [v, c, k, cov, card] = await Promise.all([
          from("vendors").select("*").eq("id", vendorId).maybeSingle(),
          from("vendor_contacts").select("*").eq("vendor_id", vendorId).order("is_escalation", { ascending: false }),
          from("vendor_contracts").select("*").eq("vendor_id", vendorId).order("expires_on", { ascending: false, nullsFirst: false }),
          from("vendor_coverage").select("*").eq("vendor_id", vendorId),
          rpc("get_vendor_scorecard", {
            p_vendor_id: vendorId,
            p_from: fromDate.toISOString(),
            p_to: to.toISOString()
          })
        ]);
        if (cancelled) return;

        if (v.error) throw new Error(v.error.message);
        setVendor(v.data ?? null);
        setContacts(c.data ?? []);
        setContracts(k.data ?? []);
        setCoverage(cov.data ?? []);
        // A scorecard failure must not blank the whole page — the profile and
        // the contract are still worth showing when the RPC is unhappy.
        setScorecard(card.error ? null : (card.data as VendorScorecard | null));
        setLoading(false);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? "Could not load this vendor");
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [vendorId, windowDays, nonce, currentSite?.id]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return { vendor, contacts, contracts, coverage, scorecard, isLoading, error, refresh };
}
