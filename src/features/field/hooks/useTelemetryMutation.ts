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

      // Stamp site identity onto the metrics payload itself (toggle saves
      // used to skip this — leaving rows that later reads couldn't
      // attribute to any site).
      const stampedMetrics: Record<string, any> = {
        ...metricsJson,
        site_id: currentSite.site_code,
        site_uuid: currentSite.id,
      };
      // History renders summaries from metrics on read. Drop any legacy stored
      // snapshot so it can't be re-persisted by a toggle save and go stale.
      delete stampedMetrics['_report_text'];

      // Offline Interceptor
      if (!navigator.onLine) {
        const payload = {
          target_hour: targetHourISO,
          frequency: "hourly",
          metrics: stampedMetrics,
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

      // Determine if this is an edit by checking for an existing log —
      // filtered by REAL database columns, not by peeking inside the metrics
      // payload. Without the site filter a same-hour row from another site
      // (or an unmatched row) corrupts the is_edited flag.
      //
      // asset_id is part of this filter because the unique key became
      // 3-column in 20260731. Several rows legitimately share
      // (target_hour, site_uuid) — 'facility_wide' plus 'dg_daily_test' —
      // and without this the maybeSingle() below errors with "multiple rows
      // returned" the moment a DG test exists for the hour, failing every
      // subsequent toggle save on that slot.
      const resolvedAssetId = assetId || "facility_wide";

      const { data: existingLog, error: fetchError } = await supabase
        .from("telemetry_logs")
        .select("id")
        .eq("target_hour", targetHourISO)
        .eq("site_uuid", currentSite.id)
        .eq("asset_id", resolvedAssetId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      const isEdited = !!existingLog;

      // The live unique constraint is (target_hour, site_uuid, asset_id) —
      // the conflict target MUST name all three columns or Postgres rejects
      // the upsert outright and the save silently fails.
      const { error: upsertError } = await supabase
        .from("telemetry_logs")
        .upsert(
          {
            target_hour: targetHourISO,
            frequency: "hourly",
            metrics: stampedMetrics,
            is_edited: isEdited,
            last_edited_at: isEdited ? new Date().toISOString() : null,
            asset_id: resolvedAssetId,
            technician_id: employee.id,
            technician_name: firstName,
            site_uuid: currentSite.id
          },
          { onConflict: "target_hour,site_uuid,asset_id" }
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
