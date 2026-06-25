import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/shared/api/supabaseClient";

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
}

export function useShiftReports() {
  const [shiftReports, setShiftReports] = useState<ShiftReport[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchShiftReports = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("shift_reports")
        .select("*")
        .order("timestamp", { ascending: false });

      if (fetchError) throw fetchError;

      setShiftReports(data || []);
    } catch (err: any) {
      console.error("Error fetching shift reports:", err);
      setError(err.message || "Failed to load shift reports.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchShiftReports();
  }, [fetchShiftReports]);

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
        active_power_source: payload.active_power_source || "MAINS",
        site_id: payload.site_id || "NTC ZM 0874",
        timestamp: new Date().toISOString()
      };

      const { data, error: insertError } = await supabase
        .from("shift_reports")
        .insert([newReport])
        .select()
        .single();

      if (insertError) throw insertError;

      setShiftReports((prev) => [data, ...prev]);
      return data as ShiftReport;
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
