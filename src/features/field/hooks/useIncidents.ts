import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";

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

function sanitizeIncident(item: any): Incident {
  return {
    ...item,
    status: (item.status as "OPEN" | "RESOLVED") || "OPEN",
    notes: item.notes || "",
    site_name: item.site_name || "",
    asset_id: item.asset_id || "",
    severity: item.severity || "medium",
    created_at: item.created_at || new Date().toISOString(),
    raised_by_name: item.raised_by_name || "",
    raised_by_id: item.raised_by_id || "",
    occurred_at: item.occurred_at || new Date().toISOString(),
    comments: Array.isArray(item.comments) ? (item.comments as Incident['comments']) : []
  };
}

export function useIncidents() {
  const { currentSite } = useCurrentSite();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const fetchCountRef = useRef(0);

  const fetchIncidents = useCallback(async () => {
    const fetchId = ++fetchCountRef.current;
    setIsLoading(true);
    setError(null);
    try {
      // H-6: scope fetch to current site; M-9: add limit 200 for query performance
      const query = supabase
        .from("incidents")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (currentSite?.id) {
        query.eq("site_uuid", currentSite.id);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      
      if (fetchId !== fetchCountRef.current) return;

      const sanitized = (data || []).map(sanitizeIncident);
      setIncidents(sanitized);
    } catch (err: any) {
      if (fetchId !== fetchCountRef.current) return;
      console.error("Error fetching incidents:", err);
      setError(err.message || "Failed to load incidents.");
    } finally {
      if (fetchId === fetchCountRef.current) {
        setIsLoading(false);
      }
    }
  }, [currentSite?.id]);

  // Fetch on mount and subscribe to realtime changes
  useEffect(() => {
    fetchIncidents();

    const siteId = currentSite?.id;

    // H-6 FIX: filter realtime subscription by site_uuid.
    const channel = supabase
      .channel(`incidents_realtime_${siteId ?? 'global'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'incidents',
          ...(siteId ? { filter: `site_uuid=eq.${siteId}` } : {})
        },
        () => {
          fetchIncidents();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchIncidents, currentSite?.id]);

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
      // H-4 FIX: High-entropy ticket number (Year-TimestampBase36-RandomHex)
      const currentYear = new Date().getFullYear();
      const tsBase36 = Date.now().toString(36).toUpperCase();
      const randStr = Math.random().toString(36).substring(2, 6).toUpperCase();
      const ticketNum = `INC-${currentYear}-${tsBase36}-${randStr}`;

      const newIncident = {
        ticket_number: ticketNum,
        status: "OPEN" as const,
        site_name: payload.site_name || "NTC ZM 0874",
        site_uuid: payload.site_uuid || null,
        asset_id: payload.asset_id,
        severity: (payload.severity.toLowerCase() as "low" | "medium" | "critical") || "medium",
        notes: payload.notes,
        photo_url: payload.photo_url || null,
        comments: [] as any[],
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

      const sanitized = sanitizeIncident(data);
      setIncidents((prev) => [sanitized, ...prev]);
      return sanitized;
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
        .update({ comments: updatedComments as any })
        .eq("id", id)
        .select()
        .single();

      if (updateError) throw updateError;

      const sanitized = sanitizeIncident(data);

      setIncidents((prev) =>
        prev.map((item) => (item.id === id ? sanitized : item))
      );
      return sanitized;
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
        status: "RESOLVED" as const,
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

      const sanitized = sanitizeIncident(data);

      setIncidents((prev) =>
        prev.map((item) => (item.id === id ? sanitized : item))
      );
      return sanitized;
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
