// src/features/analytics/hooks/useSiteCommentary.ts
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { useAuth } from "@/shared/context/AuthContext";

export type CommentaryType = "COMMENTARY" | "ONGOING";

export interface CommentaryRow {
  id: string;
  site_uuid: string;
  note_type: CommentaryType;
  body: string;
  author_name: string;
  author_id: string;
  is_active: boolean;
  created_at: string;
}

/**
 * `site_commentary` postdates the checked-in generated types in
 * database.types.ts. Remove this cast once 20260806_site_commentary.sql has
 * been applied and types regenerated — same pattern used for
 * contractor_visits and shift_sessions before their types caught up.
 */
const commentaryTable = () => (supabase as any).from("site_commentary");

export function useSiteCommentary() {
  const { currentSite } = useCurrentSite();
  const { employee } = useAuth();
  const [commentary, setCommentary] = useState<CommentaryRow[]>([]);
  const [ongoing, setOngoing] = useState<CommentaryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!currentSite?.id) {
      setCommentary([]);
      setOngoing([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const [commentaryRes, ongoingRes] = await Promise.all([
        // No limit — a full report shows full history, not a fixed slice.
        // The print layout has no page cap either, so there is nothing this
        // limit would be protecting.
        commentaryTable()
          .select("*")
          .eq("site_uuid", currentSite.id)
          .eq("note_type", "COMMENTARY")
          .order("created_at", { ascending: false }),
        commentaryTable()
          .select("*")
          .eq("site_uuid", currentSite.id)
          .eq("note_type", "ONGOING")
          .eq("is_active", true)
          .order("created_at", { ascending: false }),
      ]);

      if (commentaryRes.error) throw commentaryRes.error;
      if (ongoingRes.error) throw ongoingRes.error;

      setCommentary((commentaryRes.data || []) as CommentaryRow[]);
      setOngoing((ongoingRes.data || []) as CommentaryRow[]);
    } catch (err: any) {
      console.error("[useSiteCommentary] fetch failed:", err);
      setError(err.message || "Failed to load site commentary.");
    } finally {
      setIsLoading(false);
    }
  }, [currentSite?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addNote = async (noteType: CommentaryType, body: string) => {
    if (!currentSite?.id) throw new Error("No active site selected.");
    const trimmed = body.trim();
    if (!trimmed) throw new Error("Note cannot be empty.");

    const firstName = (employee?.full_name || "Site Manager").trim().split(/\s+/)[0];
    const { data, error: insertError } = await commentaryTable()
      .insert([{
        site_uuid: currentSite.id,
        note_type: noteType,
        body: trimmed,
        author_name: firstName,
        author_id: employee?.employee_id || employee?.id || "UNKNOWN",
      }])
      .select()
      .single();

    if (insertError) throw insertError;

    const created = data as CommentaryRow;
    if (noteType === "COMMENTARY") {
      setCommentary((prev) => [created, ...prev]);
    } else {
      setOngoing((prev) => [created, ...prev]);
    }
    return created;
  };

  /** Marks an ongoing item resolved — never deletes it, so the report's
   *  history stays reconstructable (same principle as everywhere else in
   *  this app: a correction is a new state, not an erasure). */
  const resolveOngoing = async (id: string) => {
    const { error: updateError } = await commentaryTable()
      .update({ is_active: false })
      .eq("id", id);
    if (updateError) throw updateError;
    setOngoing((prev) => prev.filter((o) => o.id !== id));
  };

  return { commentary, ongoing, isLoading, error, refresh, addNote, resolveOngoing };
}
