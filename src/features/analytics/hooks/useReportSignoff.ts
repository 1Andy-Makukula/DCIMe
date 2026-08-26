import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";
import type { SignatureResult } from "@/shared/ui";

// ─────────────────────────────────────────────────────────────────────────────
// Signing a report that is generated rather than stored.
//
// A handover has a row to sign. The executive summary does not — it is rebuilt
// from telemetry every time it opens. So the signature is hung on the report's
// IDENTITY instead: site + kind + the period it covers.
//
// The consequence people will actually notice: reopening today's report shows
// today's signatures, and tomorrow's opens unsigned. That is correct — a
// signature belongs to one edition of a document, not to the template.
// ─────────────────────────────────────────────────────────────────────────────

/** database.types.ts predates this table — see useWorkQueue for the rationale. */
type UntypedFrom = (table: string) => any;
const from = supabase.from.bind(supabase) as unknown as UntypedFrom;

export type SignoffRole = "prepared" | "reviewed";

export interface ReportSignoff {
  prepared_signature: string | null;
  prepared_name:      string | null;
  prepared_at:        string | null;
  reviewed_signature: string | null;
  reviewed_name:      string | null;
  reviewed_at:        string | null;
}

const EMPTY: ReportSignoff = {
  prepared_signature: null, prepared_name: null, prepared_at: null,
  reviewed_signature: null, reviewed_name: null, reviewed_at: null
};

export function useReportSignoff(reportKind: string, periodKey: string) {
  const { currentSite } = useCurrentSite();
  const siteId = currentSite?.id ?? null;

  const [signoff, setSignoff] = useState<ReportSignoff>(EMPTY);
  const [isLoading, setLoad]  = useState(true);
  const [error, setError]     = useState<string | null>(null);

  // Identifies the request in flight. Switching site or period starts a new
  // one, and a slower earlier response must not overwrite the newer answer —
  // the report would show another period's signatures.
  const reqRef = useRef(0);

  const load = useCallback(async () => {
    const reqId = ++reqRef.current;
    if (!siteId || !periodKey) { setSignoff(EMPTY); setLoad(false); return; }
    try {
      const { data, error: e } = await from("report_signoffs")
        .select("prepared_signature,prepared_name,prepared_at,reviewed_signature,reviewed_name,reviewed_at")
        .eq("site_uuid", siteId)
        .eq("report_kind", reportKind)
        .eq("period_key", periodKey)
        .maybeSingle();
      if (reqId !== reqRef.current) return;   // superseded
      if (e) throw e;
      setSignoff((data as ReportSignoff | null) ?? EMPTY);
      setError(null);
    } catch (err: any) {
      if (reqId !== reqRef.current) return;
      console.error("[DCIMe] Failed to load report sign-off:", err);
      setError(err?.message ?? "Could not load the sign-off.");
    } finally {
      if (reqId === reqRef.current) setLoad(false);
    }
  }, [siteId, reportKind, periodKey]);

  useEffect(() => { load(); }, [load]);

  const sign = useCallback(async (role: SignoffRole, sig: SignatureResult) => {
    if (!siteId) throw new Error("No site selected.");

    // Upsert on the report's identity, so the first signatory creates the row
    // and the second updates it — without either needing to know which they are.
    const { error: e } = await from("report_signoffs")
      .upsert(
        {
          site_uuid:   siteId,
          report_kind: reportKind,
          period_key:  periodKey,
          // ONLY the mark. Both the name AND the time are stamped server-side
          // by stamp_report_signoff() — a client-supplied timestamp is just as
          // forgeable as a client-supplied name, and the trigger COALESCEs to
          // whatever arrives, so sending one would have won.
          [`${role}_signature`]: sig.dataUrl
        },
        { onConflict: "site_uuid,report_kind,period_key" }
      );

    if (e) {
      throw new Error(
        e.code === "PGRST204" || e.code === "42P01"
          ? "The database does not recognise the report sign-off table. Either supabase/migrations/20260833_report_signoffs.sql has not been applied, or PostgREST is serving a stale schema cache."
          : e.message
      );
    }
    await load();
  }, [siteId, reportKind, periodKey, load]);

  return { signoff, isLoading, error, sign, refresh: load };
}
