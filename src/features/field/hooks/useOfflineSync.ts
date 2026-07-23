import { useEffect, useState, useCallback, useRef } from "react";
import localforage from "localforage";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { toast } from "sonner";

export function useOfflineSync() {
  const { currentSite } = useCurrentSite();
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // C-3 FIX: Replace React state guard with a useRef mutex.
  // The old `isSyncing` state guard was a stale-closure bug: the setInterval
  // and the 'online' event handler both captured the initial `false` value
  // of `isSyncing` via useCallback's dependency. If both fired within the
  // same tick, both passed the guard and ran syncData() simultaneously.
  // A useRef value is always current — it cannot be stale.
  const isSyncingRef = useRef(false);

  // Read current count from cache
  const updatePendingCount = useCallback(async () => {
    try {
      const pending: any[] = (await localforage.getItem("pending_telemetry")) || [];
      setPendingCount(pending.length);
    } catch (err) {
      console.error("[useOfflineSync] Error reading pending count:", err);
    }
  }, []);

  // Sync data function — stable reference via empty dep array (ref-based guard)
  const syncData = useCallback(async () => {
    // C-3: isSyncingRef.current is ALWAYS the current value — no stale closure
    if (!navigator.onLine || isSyncingRef.current) return;
    isSyncingRef.current = true;
    setIsSyncing(true);

    try {
      const pending: any[] = (await localforage.getItem("pending_telemetry")) || [];
      if (pending.length === 0) return;

      toast.loading(`Syncing ${pending.length} offline log(s)...`, { id: "offline-sync" });

      const failed: any[] = [];
      let successCount = 0;

      for (const payload of pending) {
        try {
          if (currentSite?.id && !payload.site_uuid) {
            payload.site_uuid = currentSite.id;
          }
          const isDaily = payload.frequency === "daily";

          if (!isDaily) {
            // Resolve is_edited flag against the composite key (C-1 fix applied)
            const { data: existingLog } = await supabase
              .from("telemetry_logs")
              .select("id")
              .eq("target_hour", payload.target_hour)
              .eq("site_uuid", payload.site_uuid)
              .maybeSingle();

            const isEdited = !!existingLog;
            payload.is_edited = isEdited;
            payload.last_edited_at = isEdited ? new Date().toISOString() : null;
          }

          // C-1: use composite conflict key (target_hour + site_uuid)
          const { error } = await supabase
            .from("telemetry_logs")
            .upsert(payload, { onConflict: "target_hour,site_uuid" });

          if (error) throw error;
          successCount++;
        } catch (err) {
          console.error("[useOfflineSync] Item sync failed:", err, payload);
          failed.push(payload);
        }
      }

      // Write back only the payloads that failed
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
      isSyncingRef.current = false;
      setIsSyncing(false);
      window.dispatchEvent(new CustomEvent("pending_telemetry_updated"));
    }
  // C-3: empty dep array — syncData is now a stable reference.
  // It does NOT depend on isSyncing state; it reads isSyncingRef.current instead.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Count any pending payloads from previous sessions
    updatePendingCount();

    // M-8 FIX: Attempt sync immediately if already online at mount time.
    // The 'online' event won't fire if the app starts while already connected,
    // so pending logs from a previous offline session would sit in localforage
    // indefinitely until the network dropped and reconnected.
    if (navigator.onLine) {
      syncData();
    }

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

    // Periodic status check — updates online state and pending count only.
    // Does NOT trigger a sync (syncData handles its own guard via isSyncingRef).
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
