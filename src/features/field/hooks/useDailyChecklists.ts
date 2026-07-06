import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/shared/api/supabaseClient";

export interface DailyChecklistLog {
  id: string;
  target_hour: string; // The date represented as 00:00:01
  technician_name: string;
  submitted_at: string;
  shift: string;
  technician_id: string;
  checklist_values: Record<string, { status: string; comment: string }>;
}

export function useDailyChecklists() {
  const [checklists, setChecklists] = useState<DailyChecklistLog[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchChecklists = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("telemetry_logs")
        .select("*")
        .eq("frequency", "daily")
        .eq("asset_id", "daily_checklist")
        .order("target_hour", { ascending: false });

      if (fetchError) throw fetchError;

      const formatted: DailyChecklistLog[] = (data || []).map((row: any) => {
        const metrics = row.metrics || {};
        return {
          id: row.id,
          target_hour: row.target_hour,
          technician_name: row.technician_name || "Unknown Tech",
          submitted_at: row.submitted_at || row.created_at || new Date().toISOString(),
          shift: metrics.shift || "DAY SHIFT (08:00 - 18:00)",
          technician_id: metrics.technician_id || "EMP-TECH",
          checklist_values: metrics.checklist_values || {},
        };
      });

      setChecklists(formatted);
    } catch (err: any) {
      console.error("Error fetching daily checklists:", err);
      setError(err.message || "Failed to load checklists log.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Submit/Upsert a checklist
  const saveChecklist = async (payload: {
    dateStr: string; // "YYYY-MM-DD"
    shift: string;
    technician_name: string;
    technician_id: string;
    values: Record<string, { status: string; comment: string }>;
  }) => {
    setError(null);
    try {
      // Set to 00:00:01 local to prevent conflicts with hourly logs on 00:00:00
      const localDate = new Date(payload.dateStr);
      localDate.setHours(0, 0, 1, 0);

      const dbPayload = {
        target_hour: localDate.toISOString(),
        asset_id: "daily_checklist",
        frequency: "daily",
        technician_name: payload.technician_name,
        metrics: {
          shift: payload.shift,
          technician_id: payload.technician_id,
          checklist_values: payload.values,
        },
        submitted_at: new Date().toISOString(),
      };

      const { data, error: upsertError } = await supabase
        .from("telemetry_logs")
        .upsert(dbPayload, { onConflict: "target_hour" })
        .select()
        .single();

      if (upsertError) throw upsertError;

      await fetchChecklists();
      return data;
    } catch (err: any) {
      console.error("Error saving daily checklist:", err);
      setError(err.message || "Failed to save checklist.");
      throw err;
    }
  };

  useEffect(() => {
    fetchChecklists();
  }, [fetchChecklists]);

  return {
    checklists,
    isLoading,
    error,
    saveChecklist,
    refresh: fetchChecklists,
  };
}
