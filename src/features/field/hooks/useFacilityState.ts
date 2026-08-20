// src/features/field/hooks/useFacilityState.ts
import { useState, useEffect, useCallback } from "react";
import { useRealtimeTable } from "@/shared/api/realtime";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { useAuth } from "@/shared/context/AuthContext";
import { toast } from "sonner";

export type FsmMode = "NORMAL" | "DAILY_TEST" | "OUTAGE" | "ON_LOAD_TEST";

export function useFacilityState() {
  const { currentSite } = useCurrentSite();
  const { employee } = useAuth();
  const [fsmMode, setFsmModeState] = useState<FsmMode>("NORMAL");
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Fetch the current FSM state from Supabase
  const fetchFacilityState = useCallback(async () => {
    if (!currentSite?.id) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("facility_states")
        .select("fsm_mode")
        .eq("site_uuid", currentSite.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setFsmModeState(data.fsm_mode as FsmMode);
      } else {
        // Initialize default FSM state for the site
        const { error: insertError } = await supabase
          .from("facility_states")
          .insert({
            site_uuid: currentSite.id,
            fsm_mode: "NORMAL",
            updated_by: employee?.id || null
          });
        if (insertError) {
          // If insert fails (e.g. table doesn't exist yet, fallback gracefully)
          console.warn("Could not insert default facility state:", insertError);
        }
        setFsmModeState("NORMAL");
      }
    } catch (err: any) {
      console.warn("[DCIMe] Failed to fetch facility state, falling back to NORMAL:", err);
      setFsmModeState("NORMAL");
    } finally {
      setIsLoading(false);
    }
  }, [currentSite?.id, employee?.id]);

  // Update the FSM state in Supabase
  const setFsmMode = useCallback(async (mode: FsmMode) => {
    if (!currentSite?.id) return;

    // Optimistic Update
    setFsmModeState(mode);

    try {
      const { error } = await supabase
        .from("facility_states")
        .upsert(
          {
            site_uuid: currentSite.id,
            fsm_mode: mode,
            updated_at: new Date().toISOString(),
            updated_by: employee?.id || null
          },
          // Explicit duplicate handling: site_uuid is the PRIMARY KEY —
          // without naming it, the upsert's conflict behavior is implicit
          // and a mismatch fails silently.
          { onConflict: "site_uuid" }
        );


      if (error) throw error;
    } catch (err: any) {
      console.error("[DCIMe] Failed to update facility state:", err);
      toast.error("Failed to update facility state in database.");
      // Rollback to original value (or refetch)
      fetchFacilityState();
    }
  }, [currentSite?.id, employee?.id, fetchFacilityState]);

  useEffect(() => {
    fetchFacilityState();
  }, [fetchFacilityState]);

  // Applies the change directly rather than refetching: the row carries the
  // new mode, so a round trip would only add latency to a state operators
  // watch for.
  useRealtimeTable({
    table:   "facility_states",
    filter:  currentSite?.id ? `site_uuid=eq.${currentSite.id}` : undefined,
    enabled: !!currentSite?.id,
    onChange: (payload) => {
      const mode = payload.new?.fsm_mode;
      if (mode) setFsmModeState(mode as FsmMode);
    }
  });

  return {
    fsmMode,
    setFsmMode,
    isLoading
  };
}
