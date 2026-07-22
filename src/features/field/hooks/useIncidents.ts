import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/shared/api/supabaseClient";

export interface Incident {
  id: string;
  ticket_number: string;
  status: "OPEN" | "RESOLVED";
  site_name: string;
  asset_id: string;
  severity: "low" | "medium" | "critical" | string;
  notes: string;
  photo_url: string | null;
  comments: Array<{
    author_name: string;
    author_id: string;
    comment_text: string;
    type: "correction" | "addition" | string;
    timestamp: string;
    photo_url?: string | null;
  }>;
  created_at: string;
  raised_by_name: string;
  raised_by_id: string;
  occurred_at: string;
  
  // Resolution fields
  resolved_at: string | null;
  resolved_by_name: string | null;
  resolved_by_id: string | null;
  receipt_number: string | null;
  impact: string | null;
  contractor_engaged: string | null;
  resolution_details: string | null;
  site_uuid?: string | null;
}

export function useIncidents() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIncidents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("incidents")
        .select("*")
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      
      // Standardize empty comments array
      const sanitized = (data || []).map(item => ({
        ...item,
        comments: Array.isArray(item.comments) ? item.comments : []
      }));
      
      setIncidents(sanitized);
    } catch (err: any) {
      console.error("Error fetching incidents:", err);
      setError(err.message || "Failed to load incidents.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on mount and subscribe to realtime changes
  useEffect(() => {
    fetchIncidents();

    const channel = supabase
      .channel('incidents_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incidents' },
        () => {
          fetchIncidents();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchIncidents]);

  // Report a new incident
  const reportIncident = async (payload: {
    asset_id: string;
    severity: string;
    notes: string;
    photo_url?: string | null;
    occurred_at?: string;
    raised_by_name?: string;
    raised_by_id?: string;
    site_name?: string;
    site_uuid?: string | null;
  }) => {
    setError(null);
    try {
      const ticketNum = `INC-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      const newIncident = {
        ticket_number: ticketNum,
        status: "OPEN",
        site_name: payload.site_name || "NTC ZM 0874",
        site_uuid: payload.site_uuid || null,
        asset_id: payload.asset_id,
        severity: payload.severity.toLowerCase(),
        notes: payload.notes,
        photo_url: payload.photo_url || null,
        comments: [],
        occurred_at: payload.occurred_at || new Date().toISOString(),
        raised_by_name: payload.raised_by_name || "",
        raised_by_id: payload.raised_by_id || "",
        created_at: new Date().toISOString(),
      };

      const { data, error: insertError } = await supabase
        .from("incidents")
        .insert([newIncident])
        .select()
        .single();

      if (insertError) throw insertError;

      // Optimistic state update or refetch
      const sanitized = {
        ...data,
        comments: Array.isArray(data.comments) ? data.comments : []
      };
      setIncidents((prev) => [sanitized, ...prev]);
      return sanitized as Incident;
    } catch (err: any) {
      console.error("Error reporting incident:", err);
      setError(err.message || "Failed to submit incident report.");
      throw err;
    }
  };

  // Add Comment to an incident (Correction / Addition)
  const addIncidentComment = async (
    id: string,
    payload: {
      comment_text: string;
      type: "correction" | "addition" | string;
      author_name?: string;
      author_id?: string;
      photo_url?: string | null;
    }
  ) => {
    setError(null);
    try {
      const existing = incidents.find((item) => item.id === id);
      const currentComments = existing?.comments || [];

      const newComment = {
        author_name: payload.author_name || "",
        author_id: payload.author_id || "",
        comment_text: payload.comment_text,
        type: payload.type,
        timestamp: new Date().toISOString(),
        photo_url: payload.photo_url || null,
      };

      const updatedComments = [...currentComments, newComment];

      const { data, error: updateError } = await supabase
        .from("incidents")
        .update({ comments: updatedComments })
        .eq("id", id)
        .select()
        .single();

      if (updateError) throw updateError;

      const sanitized = {
        ...data,
        comments: Array.isArray(data.comments) ? data.comments : []
      };

      setIncidents((prev) =>
        prev.map((item) => (item.id === id ? sanitized : item))
      );
      return sanitized as Incident;
    } catch (err: any) {
      console.error("Error adding comment to incident:", err);
      setError(err.message || "Failed to add comment.");
      throw err;
    }
  };

  // Resolve an incident
  const resolveIncident = async (
    id: string,
    payload: {
      resolved_by_name?: string;
      resolved_by_id?: string;
      impact: string;
      contractor_engaged: string;
      resolution_details: string;
      occurred_at?: string;
      resolved_at?: string;
    }
  ) => {
    setError(null);
    try {
      // Auto-generate receipt number: REC-YYYY-XXXX
      const currentYear = new Date().getFullYear();
      const randomCode = Math.floor(1000 + Math.random() * 9000);
      const receiptNumber = `REC-${currentYear}-${randomCode}`;

      const updateData = {
        status: "RESOLVED",
        resolved_at: payload.resolved_at || new Date().toISOString(),
        resolved_by_name: payload.resolved_by_name || "",
        resolved_by_id: payload.resolved_by_id || "",
        receipt_number: receiptNumber,
        impact: payload.impact,
        contractor_engaged: payload.contractor_engaged,
        resolution_details: payload.resolution_details,
        ...(payload.occurred_at ? { occurred_at: payload.occurred_at } : {}),
      };

      const { data, error: updateError } = await supabase
        .from("incidents")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (updateError) throw updateError;

      const sanitized = {
        ...data,
        comments: Array.isArray(data.comments) ? data.comments : []
      };

      setIncidents((prev) =>
        prev.map((item) => (item.id === id ? sanitized : item))
      );
      return sanitized as Incident;
    } catch (err: any) {
      console.error("Error resolving incident:", err);
      setError(err.message || "Failed to resolve incident.");
      throw err;
    }
  };

  return {
    incidents,
    isLoading,
    error,
    refresh: fetchIncidents,
    reportIncident,
    addIncidentComment,
    resolveIncident,
  };
}
