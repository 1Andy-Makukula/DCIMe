import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import { useAuth } from "./AuthContext";
import { useCurrentSite } from "./SiteContext";

export type ShiftType = "DAY_SHIFT" | "NIGHT_SHIFT" | "CUSTOM";
export type ShiftStatus = "ACTIVE" | "CLOSED" | "HANDOVER_COMPLETED";

export interface ShiftSession {
  id: string;
  employee_id: string;
  site_uuid: string;
  shift_type: ShiftType;
  status: ShiftStatus;
  checked_in_at: string;
  checked_out_at: string | null;
  created_at: string;
}

interface ShiftContextType {
  /** The caller's open session, if any. Null means they never checked in. */
  activeSession: ShiftSession | null;
  /** Convenience for stamping records; null when no session is open. */
  shiftSessionId: string | null;
  isLoading: boolean;
  /** True once we've looked and found no open session — drives the prompt. */
  needsCheckIn: boolean;
  /** Set when the technician dismisses the prompt; suppresses it this session. */
  isPromptDismissed: boolean;
  dismissPrompt: () => void;
  checkIn: (shiftType: ShiftType) => Promise<ShiftSession | null>;
  checkOut: (markHandoverComplete?: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

const ShiftContext = createContext<ShiftContextType | undefined>(undefined);

/** Dismissal is per-browser-session only — a new login should prompt again. */
const DISMISS_KEY = "dcime_shift_prompt_dismissed";

export function ShiftProvider({ children }: { children: React.ReactNode }) {
  const { employee } = useAuth();
  const { currentSite } = useCurrentSite();

  const [activeSession, setActiveSession] = useState<ShiftSession | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isPromptDismissed, setIsPromptDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "true";
    } catch {
      return false;
    }
  });

  const refresh = useCallback(async () => {
    if (!employee?.id) {
      setActiveSession(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("shift_sessions")
        .select("*")
        .eq("employee_id", employee.id)
        .eq("status", "ACTIVE")
        .order("checked_in_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Check-in is a soft feature: any lookup failure degrades to "no
      // session" rather than blocking the technician from logging telemetry.
      if (error) {
        console.warn("[DCIMe] Shift session lookup failed:", error.message);
        setActiveSession(null);
        return;
      }

      setActiveSession((data as ShiftSession) || null);
    } catch (err) {
      console.warn("[DCIMe] Shift session lookup threw:", err);
      setActiveSession(null);
    } finally {
      setIsLoading(false);
    }
  }, [employee?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const checkIn = useCallback(
    async (shiftType: ShiftType): Promise<ShiftSession | null> => {
      if (!employee?.id) throw new Error("No employee profile loaded — cannot check in.");
      if (!currentSite?.id) throw new Error("No active site — cannot check in.");

      const { data, error } = await supabase
        .from("shift_sessions")
        .insert([
          {
            employee_id: employee.id,
            site_uuid: currentSite.id,
            shift_type: shiftType,
            status: "ACTIVE",
            checked_in_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (error) {
        // The partial unique index means a race (double tap, second device)
        // surfaces here rather than creating a duplicate open shift.
        if ((error as any).code === "23505") {
          await refresh();
          return null;
        }
        throw error;
      }

      const session = data as ShiftSession;
      setActiveSession(session);
      return session;
    },
    [employee?.id, currentSite?.id, refresh]
  );

  const checkOut = useCallback(
    async (markHandoverComplete = false) => {
      if (!activeSession) return;

      const { error } = await supabase
        .from("shift_sessions")
        .update({
          status: markHandoverComplete ? "HANDOVER_COMPLETED" : "CLOSED",
          checked_out_at: new Date().toISOString(),
        })
        .eq("id", activeSession.id);

      if (error) throw error;
      setActiveSession(null);
    },
    [activeSession]
  );

  const dismissPrompt = useCallback(() => {
    setIsPromptDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "true");
    } catch {
      /* non-fatal — the prompt simply reappears on the next load */
    }
  }, []);

  const value: ShiftContextType = {
    activeSession,
    shiftSessionId: activeSession?.id || null,
    isLoading,
    needsCheckIn: !isLoading && !activeSession && !!employee?.id,
    isPromptDismissed,
    dismissPrompt,
    checkIn,
    checkOut,
    refresh,
  };

  return <ShiftContext.Provider value={value}>{children}</ShiftContext.Provider>;
}

export function useShiftSession() {
  const context = useContext(ShiftContext);
  if (context === undefined) {
    throw new Error("useShiftSession must be used within a ShiftProvider");
  }
  return context;
}
