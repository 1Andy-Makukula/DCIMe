import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";

// ─────────────────────────────────────────────────────────────────────────────
// Maintenance schedules for a piece of equipment.
//
// V1 collects cumulative run hours on every round and has never read them, so a
// 250-hour service depends on somebody remembering (audit G-03). This is the
// screen that turns that collected data into a schedule.
//
// Reads maintenance_due rather than the raw table: that view already resolves
// template schedules onto each machine and works out remaining life, so the
// arithmetic lives in one place instead of being redone in the UI.
// ─────────────────────────────────────────────────────────────────────────────

export type ScheduleBasis  = "RUN_HOURS" | "CALENDAR";
export type ScheduleStatus = "ok" | "due-soon" | "due" | "no-meter";

export interface DueSchedule {
  schedule_id:      string;
  target_equipment: string;
  equipment_name:   string;
  task:             string;
  detail:           string | null;
  severity:         string;
  basis:            ScheduleBasis;
  current_hours:    number | null;
  due_at_hours:     number | null;
  hours_remaining:  number | null;
  due_date:         string | null;
  last_done_at:     string | null;
  last_done_hours:  number | null;
  status:           ScheduleStatus;
}

export interface NewSchedule {
  task:           string;
  detail?:        string;
  severity:       string;
  basis:          ScheduleBasis;
  interval_hours?: number;
  interval_days?:  number;
  hours_metric?:   string;
  lead_hours:      number;
  /** Attach to this machine only, or to every instance of its template. */
  scope:          "EQUIPMENT" | "TEMPLATE";
  template_id?:   string | null;
}

export interface UseMaintenanceSchedulesResult {
  schedules: DueSchedule[];
  isLoading: boolean;
  error:     string | null;
  refresh:   () => void;
  create:    (s: NewSchedule) => Promise<void>;
  remove:    (scheduleId: string) => Promise<void>;
}

/** database.types.ts predates these tables — see useWorkQueue for the rationale. */
type UntypedFrom = (table: string) => any;
const from = supabase.from.bind(supabase) as unknown as UntypedFrom;

export function useMaintenanceSchedules(equipmentId: string | null): UseMaintenanceSchedulesResult {
  const { currentSite } = useCurrentSite();
  const [schedules, setSchedules] = useState<DueSchedule[]>([]);
  const [isLoading, setLoad]      = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [nonce, setNonce]         = useState(0);

  const siteId = currentSite?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!equipmentId || !siteId) { setSchedules([]); setLoad(false); return; }

    (async () => {
      setLoad(true);
      setError(null);
      try {
        const { data, error: qErr } = await from("maintenance_due")
          .select("*")
          .eq("site_uuid", siteId)
          .eq("target_equipment", equipmentId);

        if (cancelled) return;
        if (qErr) { setError(qErr.message); setSchedules([]); }
        else      { setSchedules((data as DueSchedule[] | null) ?? []); }
      } catch (err: any) {
        if (!cancelled) { setError(err?.message ?? "Could not load schedules"); }
      } finally {
        if (!cancelled) setLoad(false);
      }
    })();

    return () => { cancelled = true; };
  }, [equipmentId, siteId, nonce]);

  const refresh = useCallback(() => setNonce(n => n + 1), []);

  const create = useCallback(async (s: NewSchedule) => {
    if (!siteId || !equipmentId) throw new Error("No equipment selected");

    // A schedule attaches to EITHER one machine OR a template, never both —
    // the database enforces it, so fail here with a message rather than
    // surfacing a constraint violation.
    if (s.scope === "TEMPLATE" && !s.template_id) {
      throw new Error("This equipment has no template, so it cannot be scheduled fleet-wide");
    }

    const { error: iErr } = await from("maintenance_schedules").insert({
      site_uuid:      siteId,
      equipment_id:   s.scope === "EQUIPMENT" ? equipmentId : null,
      template_id:    s.scope === "TEMPLATE"  ? s.template_id : null,
      task:           s.task.trim(),
      detail:         s.detail?.trim() || null,
      severity:       s.severity,
      basis:          s.basis,
      interval_hours: s.basis === "RUN_HOURS" ? s.interval_hours : null,
      interval_days:  s.basis === "CALENDAR"  ? s.interval_days  : null,
      hours_metric:   s.basis === "RUN_HOURS" ? (s.hours_metric || "cumulative_hrs") : null,
      lead_hours:     s.lead_hours
    });
    if (iErr) throw new Error(iErr.message);
    refresh();
  }, [siteId, equipmentId, refresh]);

  const remove = useCallback(async (scheduleId: string) => {
    const { error: dErr } = await from("maintenance_schedules").delete().eq("id", scheduleId);
    if (dErr) throw new Error(dErr.message);
    refresh();
  }, [refresh]);

  return { schedules, isLoading, error, refresh, create, remove };
}
