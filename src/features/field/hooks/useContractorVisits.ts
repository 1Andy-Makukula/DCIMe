// src/features/field/hooks/useContractorVisits.ts
import { useState, useEffect, useCallback, useRef } from "react";
import { useRealtimeTable } from "@/shared/api/realtime";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";

export type VisitTargetType = "SITE" | "ASSET" | "TICKET";

export interface ContractorVisit {
  id: string;
  site_uuid: string;
  visit_number: string;
  /** Freeform description of why the contractor attended. */
  purpose: string;
  target_type: VisitTargetType;
  target_ref: string | null;
  contractor: string;
  notes: string;
  photo_url: string | null;
  logged_by_name: string;
  logged_by_id: string;
  occurred_at: string;
  created_at: string;
}

/**
 * Suggestions only — offered as one-tap chips that fill the freeform purpose
 * field. They are NOT a closed list: the field accepts any text, because
 * contractors do an open-ended range of work that no enum can anticipate.
 */
export const PURPOSE_SUGGESTIONS: string[] = [
  "General site inspection",
  "Equipment audit & checkup",
  "Routine servicing & PM",
  "Fuel & generator refill",
  "HVAC & thermal audit",
  "Electrical & power inspection",
  "Safety & security check",
];

export function useContractorVisits() {
  const { currentSite } = useCurrentSite();
  const [visits, setVisits] = useState<ContractorVisit[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const fetchCountRef = useRef(0);

  const fetchVisits = useCallback(async () => {
    if (!currentSite?.id) {
      setVisits([]);
      setIsLoading(false);
      return;
    }

    const fetchId = ++fetchCountRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("contractor_visits")
        .select("*")
        .eq("site_uuid", currentSite.id)
        .order("occurred_at", { ascending: false })
        .limit(200);

      if (fetchError) throw fetchError;
      // A slower earlier request must not overwrite a newer result.
      if (fetchId !== fetchCountRef.current) return;

      setVisits((data || []) as ContractorVisit[]);
    } catch (err: any) {
      if (fetchId !== fetchCountRef.current) return;
      console.error("Error fetching contractor visits:", err);
      setError(err.message || "Failed to load contractor visits.");
    } finally {
      if (fetchId === fetchCountRef.current) setIsLoading(false);
    }
  }, [currentSite?.id]);

  useEffect(() => { fetchVisits(); }, [fetchVisits]);

  useRealtimeTable({
    table:   "contractor_visits",
    filter:  currentSite?.id ? `site_uuid=eq.${currentSite.id}` : undefined,
    enabled: !!currentSite?.id,
    onChange: fetchVisits
  });

  /**
   * Records an inspection. Deliberately writes nothing to `incidents` —
   * observing a fault is not the same as fixing it, so any ticket named by
   * `target_ref` keeps its existing status.
   */
  const logVisit = async (payload: {
    purpose: string;
    target_type: VisitTargetType;
    target_ref?: string | null;
    contractor: string;
    notes: string;
    photo_url?: string | null;
    logged_by_name?: string;
    logged_by_id?: string;
    occurred_at?: string;
  }) => {
    setError(null);
    if (!currentSite?.id) {
      throw new Error("Active site not loaded — cannot log a contractor visit.");
    }

    // Same high-entropy scheme as incident ticket numbers, so two techs
    // logging simultaneously can't collide on a visit reference.
    const year = new Date().getFullYear();
    const tsBase36 = Date.now().toString(36).toUpperCase();
    const randStr = Math.random().toString(36).substring(2, 6).toUpperCase();

    const row = {
      site_uuid: currentSite.id,
      visit_number: `VISIT-${year}-${tsBase36}-${randStr}`,
      purpose: payload.purpose,
      target_type: payload.target_type,
      // The table's CHECK constraint requires NULL for a whole-site visit.
      target_ref: payload.target_type === "SITE" ? null : payload.target_ref || null,
      contractor: payload.contractor,
      notes: payload.notes,
      photo_url: payload.photo_url || null,
      logged_by_name: payload.logged_by_name || "",
      logged_by_id: payload.logged_by_id || "",
      occurred_at: payload.occurred_at || new Date().toISOString(),
    };

    try {
      const { data, error: insertError } = await supabase
        .from("contractor_visits")
        .insert([row])
        .select()
        .single();

      if (insertError) throw insertError;

      const created = data as ContractorVisit;
      setVisits((prev) => [created, ...prev]);
      return created;
    } catch (err: any) {
      console.error("Error logging contractor visit:", err);
      setError(err.message || "Failed to log contractor visit.");
      throw err;
    }
  };

  /**
   * Records something the contractor FOUND, as distinct from the visit itself.
   *
   * V1 put every observation into one free-text notes blob, so a contractor who
   * identified three defects produced one paragraph: nothing trackable, nothing
   * with a severity, nothing on any list of outstanding work, and the next
   * visit rediscovered the same faults (audit A-05).
   *
   * `raiseWork` is deliberately optional. Not every observation deserves a job
   * — forcing one would either fabricate work or discourage people from
   * recording what they saw.
   */
  const recordFinding = async (
    visitId: string,
    finding: {
      summary: string;
      severity?: "P1" | "P2" | "P3" | "P4";
      detail?: string | null;
      equipmentId?: string | null;
      raiseWork?: boolean;
    }
  ): Promise<string> => {
    if (!finding.summary.trim()) {
      throw new Error("Say what was found before saving");
    }
    const { data, error: rpcError } = await (supabase.rpc as any)(
      "record_contractor_finding",
      {
        p_visit_id:     visitId,
        p_summary:      finding.summary.trim(),
        p_severity:     finding.severity ?? "P3",
        p_detail:       finding.detail?.trim() || null,
        p_equipment_id: finding.equipmentId ?? null,
        p_raise_work:   finding.raiseWork ?? true,
      }
    );
    if (rpcError) throw new Error(rpcError.message);
    return data as string;
  };

  return {
    visits,
    isLoading,
    error,
    refresh: fetchVisits,
    logVisit,
    recordFinding,
  };
}
