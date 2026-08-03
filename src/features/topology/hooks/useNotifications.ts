// src/features/topology/hooks/useNotifications.ts
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { useAuth } from "@/shared/context/AuthContext";

export type NotificationKind = "FAULT" | "RESOLVED" | "OUTAGE" | "VISIT" | "SHIFT";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  /** Event time — what the notification is about, not when it was fetched. */
  timestamp: string;
  /** In-app route to open when the row is clicked. */
  href: string;
}

const KIND_META: Record<NotificationKind, { label: string; tone: string }> = {
  FAULT:    { label: "New Fault",       tone: "red" },
  RESOLVED: { label: "Fault Resolved",  tone: "green" },
  OUTAGE:   { label: "Power Event",     tone: "amber" },
  VISIT:    { label: "Contractor Visit", tone: "blue" },
  SHIFT:    { label: "Shift Report",    tone: "slate" },
};

export const notificationMeta = (kind: NotificationKind) =>
  KIND_META[kind] || { label: kind, tone: "slate" };

/**
 * Read state is per-admin and per-browser. It's a UI affordance ("have I looked
 * at this yet"), not an audit record, so localStorage is the right home — a
 * database column would imply a guarantee we aren't making.
 */
const readKey = (employeeId?: string) => `dcime_notifications_read_${employeeId || "anon"}`;

const loadReadIds = (employeeId?: string): Set<string> => {
  try {
    const raw = localStorage.getItem(readKey(employeeId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
};

const MAX_ITEMS = 40;

export function useNotifications() {
  const { currentSite } = useCurrentSite();
  const { employee } = useAuth();

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => loadReadIds(employee?.id));
  const [isLoading, setIsLoading] = useState(true);
  const fetchCountRef = useRef(0);

  // Switching accounts must not carry the previous admin's read state over.
  useEffect(() => {
    setReadIds(loadReadIds(employee?.id));
  }, [employee?.id]);

  const persistRead = useCallback(
    (ids: Set<string>) => {
      try {
        // Cap what we persist, or the key grows without bound over months.
        localStorage.setItem(
          readKey(employee?.id),
          JSON.stringify(Array.from(ids).slice(-500))
        );
      } catch (e) {
        console.warn("[DCIMe] Could not persist notification read state:", e);
      }
    },
    [employee?.id]
  );

  const fetchAll = useCallback(async () => {
    if (!currentSite?.id) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }

    const fetchId = ++fetchCountRef.current;
    setIsLoading(true);

    try {
      const siteId = currentSite.id;

      const [incidentsRes, telemetryRes, visitsRes, shiftsRes] = await Promise.all([
        supabase
          .from("incidents")
          .select("id, ticket_number, status, asset_id, notes, severity, created_at, resolved_at, resolved_by_name")
          .eq("site_uuid", siteId)
          .order("created_at", { ascending: false })
          .limit(25),
        supabase
          .from("telemetry_logs")
          .select("id, target_hour, metrics, technician_name")
          .eq("site_uuid", siteId)
          .eq("asset_id", "facility_wide")
          .order("target_hour", { ascending: false })
          .limit(25),
        supabase
          .from("contractor_visits")
          .select("id, visit_number, purpose, contractor, notes, occurred_at")
          .eq("site_uuid", siteId)
          .order("occurred_at", { ascending: false })
          .limit(15),
        supabase
          .from("shift_reports")
          .select("log_id, technician_name, timestamp, notes")
          .eq("site_uuid", siteId)
          .order("timestamp", { ascending: false })
          .limit(10),
      ]);

      if (fetchId !== fetchCountRef.current) return;

      const items: AppNotification[] = [];

      (incidentsRes.data || []).forEach((row: any) => {
        if (row.status === "RESOLVED" && row.resolved_at) {
          items.push({
            id: `incident_resolved_${row.id}`,
            kind: "RESOLVED",
            title: `${row.ticket_number} resolved`,
            detail: `${String(row.asset_id || "").toUpperCase().replace(/_/g, " ")}${row.resolved_by_name ? ` — by ${row.resolved_by_name}` : ""}`,
            timestamp: row.resolved_at,
            href: "/admin/alerts",
          });
        } else if (row.status === "OPEN") {
          items.push({
            id: `incident_open_${row.id}`,
            kind: "FAULT",
            title: `${String(row.severity || "").toUpperCase()} fault — ${String(row.asset_id || "").toUpperCase().replace(/_/g, " ")}`,
            detail: row.notes || row.ticket_number,
            timestamp: row.created_at,
            href: "/admin/alerts",
          });
        }
      });

      // Only power events are worth notifying on — a normal hourly submission
      // every hour of every day would drown everything else out.
      (telemetryRes.data || []).forEach((row: any) => {
        const m = (row.metrics || {}) as Record<string, any>;
        const mode = m.fsm_mode;
        if (mode !== "OUTAGE" && mode !== "ON_LOAD_TEST") return;
        items.push({
          id: `telemetry_${row.id}`,
          kind: "OUTAGE",
          title: mode === "OUTAGE" ? "Grid outage logged" : "On-load test logged",
          detail: `${new Date(row.target_hour).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — ${row.technician_name || "technician"}`,
          timestamp: row.target_hour,
          href: "/admin",
        });
      });

      // Tolerate a failed visits query (RLS denial, transient error) rather
      // than letting one source blank the entire feed.
      if (!visitsRes.error) {
        (visitsRes.data || []).forEach((row: any) => {
          items.push({
            id: `visit_${row.id}`,
            kind: "VISIT",
            title: `${row.contractor} on site`,
            detail: row.purpose || row.notes || row.visit_number,
            timestamp: row.occurred_at,
            href: "/admin/alerts",
          });
        });
      }

      (shiftsRes.data || []).forEach((row: any) => {
        items.push({
          id: `shift_${row.log_id}`,
          kind: "SHIFT",
          title: `Shift report — ${row.technician_name || "technician"}`,
          detail: row.notes || "Pass-down submitted",
          timestamp: row.timestamp,
          href: "/admin/reports",
        });
      });

      items.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      setNotifications(items.slice(0, MAX_ITEMS));
    } catch (err) {
      console.error("[DCIMe] Failed to build notification feed:", err);
    } finally {
      if (fetchId === fetchCountRef.current) setIsLoading(false);
    }
  }, [currentSite?.id]);

  useEffect(() => {
    fetchAll();

    const siteId = currentSite?.id;
    if (!siteId) return;

    // Core tables on one channel; each change just re-derives the feed, which
    // keeps ordering and dedupe logic in a single place.
    const channel = supabase
      .channel(`notifications_${siteId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents", filter: `site_uuid=eq.${siteId}` }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "telemetry_logs", filter: `site_uuid=eq.${siteId}` }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_reports", filter: `site_uuid=eq.${siteId}` }, () => fetchAll())
      .subscribe();

    // contractor_visits lives on its own channel deliberately: until the
    // 20260802 migration is applied the table doesn't exist, and a failed
    // subscription must not take incidents and telemetry down with it.
    const visitsChannel = supabase
      .channel(`notifications_visits_${siteId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "contractor_visits", filter: `site_uuid=eq.${siteId}` }, () => fetchAll())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(visitsChannel);
    };
  }, [fetchAll, currentSite?.id]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !readIds.has(n.id)).length,
    [notifications, readIds]
  );

  const markRead = useCallback(
    (id: string) => {
      setReadIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        persistRead(next);
        return next;
      });
    },
    [persistRead]
  );

  const markAllRead = useCallback(() => {
    setReadIds(() => {
      const next = new Set(notifications.map((n) => n.id));
      persistRead(next);
      return next;
    });
  }, [notifications, persistRead]);

  return {
    notifications,
    unreadCount,
    isLoading,
    isRead: (id: string) => readIds.has(id),
    markRead,
    markAllRead,
    refresh: fetchAll,
  };
}
