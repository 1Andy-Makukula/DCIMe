import { useEffect, useState, useCallback } from "react";
import localforage from "localforage";
import { supabase } from "@/shared/api/supabaseClient";
import { toast } from "sonner";

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Read current count from cache
  const updatePendingCount = useCallback(async () => {
    try {
      const pending: any[] = (await localforage.getItem("pending_telemetry")) || [];
      setPendingCount(pending.length);
    } catch (err) {
      console.error("[useOfflineSync] Error reading pending count:", err);
    }
  }, []);

  // Sync data function
  const syncData = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return;

    try {
      const pending: any[] = (await localforage.getItem("pending_telemetry")) || [];
      if (pending.length === 0) return;

      setIsSyncing(true);
      toast.loading(`Syncing ${pending.length} offline log(s)...`, { id: "offline-sync" });

      const failed: any[] = [];
      let successCount = 0;

      for (const payload of pending) {
        try {
          // If this is a daily checklist payload
          const isDaily = payload.frequency === "daily";
          
          if (!isDaily) {
            // For hourly, first check if we need to resolve is_edited flag
            const { data: existingLog } = await supabase
              .from("telemetry_logs")
              .select("id")
              .eq("target_hour", payload.target_hour)
              .maybeSingle();

            const isEdited = !!existingLog;
            payload.is_edited = isEdited;
            payload.last_edited_at = isEdited ? new Date().toISOString() : null;
          }

          const { error } = await supabase
            .from("telemetry_logs")
            .upsert(payload, { onConflict: "target_hour" });

          if (error) throw error;
          successCount++;
        } catch (err) {
          console.error("[useOfflineSync] Item sync failed:", err, payload);
          failed.push(payload);
        }
      }

      // Update local cache
      await localforage.setItem("pending_telemetry", failed);
      setPendingCount(failed.length);

      if (successCount > 0) {
        toast.success(`Successfully synchronized ${successCount} log(s) to cloud.`, {
          id: "offline-sync",
        });
      } else {
        toast.dismiss("offline-sync");
      }
    } catch (err) {
      console.error("[useOfflineSync] Sync error:", err);
      toast.error("Offline synchronization failed.", { id: "offline-sync" });
    } finally {
      setIsSyncing(false);
      window.dispatchEvent(new CustomEvent("pending_telemetry_updated"));
    }
  }, [isSyncing]);

  useEffect(() => {
    // Initial fetch of count
    updatePendingCount();

    const handleOnline = () => {
      setIsOnline(true);
      syncData();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    const handleUpdateEvent = () => {
      updatePendingCount();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("pending_telemetry_updated", handleUpdateEvent);

    // Periodic check in case network fluctuates without triggering events
    const interval = setInterval(() => {
      setIsOnline(navigator.onLine);
      updatePendingCount();
    }, 10000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("pending_telemetry_updated", handleUpdateEvent);
      clearInterval(interval);
    };
  }, [syncData, updatePendingCount]);

  return {
    isOnline,
    pendingCount,
    isSyncing,
    syncData,
  };
}
