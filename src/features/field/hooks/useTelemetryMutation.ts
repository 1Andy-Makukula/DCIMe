import { useState, useCallback } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import { useAuth } from "@/shared/context/AuthContext";
import { useCurrentSite } from "@/shared/context/SiteContext";
import localforage from "localforage";
import { toast } from "sonner";

export function useTelemetryMutation() {
  const { employee } = useAuth();
  const { currentSite } = useCurrentSite();
  const [isMutating, setIsMutating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const submitTelemetryLog = useCallback(async (
    assetId: string,
    metricsJson: Record<string, any>,
    targetHour: number | string | Date
  ): Promise<boolean> => {
    setIsMutating(true);
    setError(null);
    try {
      if (!employee?.id) {
        throw new Error("Unauthorized: Employee profile not loaded.");
      }
      if (!currentSite?.id) {
        throw new Error("Bad Request: Active site not selected.");
      }

      // Parse target hour to ISO timestamp
      let targetHourISO: string;
      if (typeof targetHour === "number") {
        const date = new Date();
        date.setHours(targetHour, 0, 0, 0);
        targetHourISO = date.toISOString();
      } else if (targetHour instanceof Date) {
        targetHourISO = targetHour.toISOString();
      } else if (typeof targetHour === "string" && targetHour.includes(":")) {
        const [hh] = targetHour.split(":");
        const date = new Date();
        date.setHours(parseInt(hh, 10), 0, 0, 0);
        targetHourISO = date.toISOString();
      } else {
        targetHourISO = new Date(targetHour).toISOString();
      }

      const technicianName = employee.full_name || "Unknown Tech";
      const firstName = technicianName.trim().split(/\s+/)[0];

      // Offline Interceptor
      if (!navigator.onLine) {
        const payload = {
          target_hour: targetHourISO,
          frequency: "hourly",
          metrics: metricsJson,
          is_edited: false, // will resolve status on sync
          last_edited_at: null,
          asset_id: assetId || "facility_wide",
          technician_id: employee.id,
          technician_name: firstName,
          site_uuid: currentSite.id
        };

        const pending: any[] = (await localforage.getItem("pending_telemetry")) || [];
        // Prevent duplicate offline logs for the same target hour and asset
        const filtered = pending.filter(
          (item: any) => !(item.target_hour === targetHourISO && item.asset_id === payload.asset_id)
        );
        filtered.push(payload);
        await localforage.setItem("pending_telemetry", filtered);

        // Dispatch a custom event to notify components that queue size changed
        window.dispatchEvent(new CustomEvent("pending_telemetry_updated"));

        toast.info("Saved Offline. Will sync when network returns.");
        return true;
      }

      // Determine if this is an edit by checking for existing log
      const { data: existingLog, error: fetchError } = await supabase
        .from("telemetry_logs")
        .select("id")
        .eq("target_hour", targetHourISO)
        .maybeSingle();

      if (fetchError) throw fetchError;

      const isEdited = !!existingLog;

      const { error: upsertError } = await supabase
        .from("telemetry_logs")
        .upsert(
          {
            target_hour: targetHourISO,
            frequency: "hourly",
            metrics: metricsJson,
            is_edited: isEdited,
            last_edited_at: isEdited ? new Date().toISOString() : null,
            asset_id: assetId || "facility_wide",
            technician_id: employee.id,
            technician_name: firstName,
            site_uuid: currentSite.id
          },
          { onConflict: "target_hour" }
        );

      if (upsertError) throw upsertError;
      return true;
    } catch (err: any) {
      console.error("Secure Telemetry Submission Hook Error:", err);
      setError(err.message || "Failed to submit telemetry log.");
      return false;
    } finally {
      setIsMutating(false);
    }
  }, [employee, currentSite]);

  return {
    submitTelemetryLog,
    isMutating,
    error
  };
}
