// src/features/field/hooks/useFacilityState.ts
import { useState, useEffect, useCallback } from "react";
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
        .upsert({
          site_uuid: currentSite.id,
          fsm_mode: mode,
          updated_at: new Date().toISOString(),
          updated_by: employee?.id || null
        });

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

  // Subscribe to real-time changes
  useEffect(() => {
    if (!currentSite?.id) return;
    let active = true;

    const channel = supabase
      .channel(`facility_states_realtime_${currentSite.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "facility_states",
          filter: `site_uuid=eq.${currentSite.id}`
        },
        (payload) => {
          if (!active) return;
          if (payload.new && (payload.new as any).fsm_mode) {
            setFsmModeState((payload.new as any).fsm_mode as FsmMode);
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [currentSite?.id]);

  return {
    fsmMode,
    setFsmMode,
    isLoading
  };
}
