import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";

export interface ShiftReport {
  log_id: string;
  timestamp: string;
  logged_by: string | null;
  active_power_source: string;
  site_id: string;
  notes: string;
  certified: boolean;
  technician_name: string;
  technician_id: string;
  signature_id: string;
  shift_duration: string;
  routine_logs_completed: number;
  incidents_filed: number;
  site_uuid?: string | null;
}

function sanitizeShiftReport(item: any): ShiftReport {
  return {
    ...item,
    timestamp: item.timestamp || new Date().toISOString(),
    notes: item.notes || "",
    active_power_source: item.active_power_source || "MAINS",
    site_id: item.site_id || "",
    certified: !!item.certified,
    technician_name: item.technician_name || "",
    technician_id: item.technician_id || "",
    signature_id: item.signature_id || "",
    shift_duration: item.shift_duration || "",
    routine_logs_completed: Number(item.routine_logs_completed || 0),
    incidents_filed: Number(item.incidents_filed || 0)
  };
}

export function useShiftReports() {
  const { currentSite } = useCurrentSite();
  const [shiftReports, setShiftReports] = useState<ShiftReport[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const fetchCountRef = useRef(0);

  const fetchShiftReports = useCallback(async () => {
    const fetchId = ++fetchCountRef.current;
    setIsLoading(true);
    setError(null);
    try {
      // H-6: Site isolation on query; M-9: Limit 200 for bounded memory footprint
      const siteId = currentSite?.id;
      const query = supabase
        .from("shift_reports")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(200);

      if (siteId) {
        query.eq("site_uuid", siteId);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      if (fetchId !== fetchCountRef.current) return;
      const sanitized = (data || []).map(sanitizeShiftReport);
      setShiftReports(sanitized);
    } catch (err: any) {
      if (fetchId !== fetchCountRef.current) return;
      console.error("Error fetching shift reports:", err);
      setError(err.message || "Failed to load shift reports.");
    } finally {
      if (fetchId === fetchCountRef.current) {
        setIsLoading(false);
      }
    }
  }, [currentSite?.id]);

  // Fetch on mount and subscribe to realtime changes (H-6 site isolation)
  useEffect(() => {
    fetchShiftReports();

    const siteId = currentSite?.id;
    const channel = supabase
      .channel(`shift_reports_realtime_${siteId ?? 'global'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shift_reports',
          ...(siteId ? { filter: `site_uuid=eq.${siteId}` } : {})
        },
        () => {
          fetchShiftReports();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchShiftReports, currentSite?.id]);

  // Submit a new shift report (Handover)
  const submitShiftReport = async (payload: {
    notes: string;
    certified: boolean;
    technician_name: string;
    technician_id: string;
    signature_id: string;
    shift_duration: string;
    routine_logs_completed: number;
    incidents_filed: number;
    active_power_source?: string;
    site_id?: string;
    site_uuid?: string | null;
  }) => {
    setError(null);
    try {
      const newReport = {
        notes: payload.notes,
        certified: payload.certified,
        technician_name: payload.technician_name,
        technician_id: payload.technician_id,
        signature_id: payload.signature_id,
        shift_duration: payload.shift_duration,
        routine_logs_completed: payload.routine_logs_completed,
        incidents_filed: payload.incidents_filed,
        active_power_source: (payload.active_power_source || "MAINS") as "MAINS" | "GENERATOR" | "BLACKOUT",
        site_id: payload.site_id || "NTC ZM 0874",
        site_uuid: payload.site_uuid || currentSite?.id || null,
        timestamp: new Date().toISOString()
      };

      const { data, error: insertError } = await supabase
        .from("shift_reports")
        .insert([newReport])
        .select()
        .single();

      if (insertError) throw insertError;

      const sanitized = sanitizeShiftReport(data);
      setShiftReports((prev) => [sanitized, ...prev]);
      return sanitized;
    } catch (err: any) {
      console.error("Error submitting shift report:", err);
      setError(err.message || "Failed to submit shift handover.");
      throw err;
    }
  };

  return {
    shiftReports,
    isLoading,
    error,
    refresh: fetchShiftReports,
    submitShiftReport
  };
}
