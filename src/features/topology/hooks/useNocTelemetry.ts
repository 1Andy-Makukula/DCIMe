import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";

// ── Output shape — drop-in replacement for all three mockData arrays ──────────
export interface NocLoadPoint  { t: string; kw: number }
export interface NocThermalPoint { room: string; temp: number }
export interface NocAlert {
  id:    string;
  msg:   string;
  level: "warn" | "crit";
  time:  string;
}

export interface UseNocTelemetryResult {
  loadChartData: NocLoadPoint[];
  thermalData:   NocThermalPoint[];
  phaseAlerts:   NocAlert[];
  latestMetrics: Record<string, any>;
  lastSync:      string;
  isLoading:     boolean;
  hasData:       boolean;
  refresh:       () => void;
}

// ── Room temperature metric IDs → display labels ──────────────────────────────
// These keys must match what useTelemetryData writes into metrics JSONB
const THERMAL_ROOMS: { id: string; room: string }[] = [
  { id: "server_ambient_temp", room: "Main"  },
  { id: "pr1_ambient_temp",    room: "Pwr 1" },
  { id: "pr2_ambient_temp",    room: "Pwr 2" },
  { id: "it1_ambient_temp",    room: "Ent 1" },
  { id: "it2_ambient_temp",    room: "Ent 2" },
];

// ── Helper: format a Date to "HH:00" ─────────────────────────────────────────
function toHourLabel(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:00`;
}

// ── Helper: format a Date to "HH:MM" ─────────────────────────────────────────
function toHHMM(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

// ── Helper: severity string → alert level ────────────────────────────────────
function toAlertLevel(severity: string): "warn" | "crit" {
  return severity === "critical" ? "crit" : "warn";
}

export function useNocTelemetry(): UseNocTelemetryResult {
  const { currentSite } = useCurrentSite();
  const [loadChartData, setLoadChartData] = useState<NocLoadPoint[]>([]);
  const [thermalData,   setThermalData]   = useState<NocThermalPoint[]>([]);
  const [phaseAlerts,   setPhaseAlerts]   = useState<NocAlert[]>([]);
  const [latestMetrics, setLatestMetrics] = useState<Record<string, any>>({});
  const [lastSync,      setLastSync]      = useState<string>("—");
  const [isLoading,     setIsLoading]     = useState<boolean>(true);
  const [hasData,       setHasData]       = useState<boolean>(false);
  const fetchCountRef = useRef(0);

  const fetchAll = useCallback(async () => {
    const fetchId = ++fetchCountRef.current;
    setIsLoading(true);
    try {
      // H-5 FIX: scope telemetry fetch to the current site.
      // Previously fetched the 50 newest logs across ALL sites, causing the
      // NOC dashboard to show blended multi-site data in charts and thermals.
      const siteId = currentSite?.id;
      if (!siteId) {
        setIsLoading(false);
        return;
      }

      // ── Query 1: site-scoped telemetry logs ──
      const { data: telemetryRows, error: telemetryError } = await supabase
        .from("telemetry_logs")
        .select("target_hour, metrics")
        .eq("site_uuid", siteId)
        .order("target_hour", { ascending: false })
        .limit(50);

      if (telemetryError) throw telemetryError;
      if (fetchId !== fetchCountRef.current) return;

      // Reverse array so load chart displays left-to-right chronologically
      const chronologicalRows = (telemetryRows || []).slice().reverse();

      // ── Build load chart data ─────────────────────────────────────────────
      const loadPoints: NocLoadPoint[] = chronologicalRows.map((row) => {
        const date = new Date(row.target_hour);
        const metrics = (row.metrics as Record<string, any>) || {};
        const kw =
          parseFloat(metrics["grid_total_site_load"] ?? metrics["ups_1_output_load_kw"] ?? metrics["ups_2_output_load_kw"] ?? metrics["total_active_power_kw"] ?? 0) || 0;
        return { t: toHourLabel(date), kw };
      });

      // ── Build thermal data & latest metrics from the latest row ────────────
      let thermalPoints: NocThermalPoint[] = [];
      let latestM: Record<string, any> = {};
      if (chronologicalRows.length > 0) {
        latestM = (chronologicalRows[chronologicalRows.length - 1].metrics as Record<string, any>) || {};
        thermalPoints = THERMAL_ROOMS.map(({ id, room }) => {
          const raw = parseFloat(latestM[id] ?? 0);
          return { room, temp: isNaN(raw) ? 0 : raw };
        }).filter((p) => p.temp > 0);
      }

      // ── Query 2: site-scoped open incidents → phase alerts ───────────────
      const { data: incidentRows, error: incidentError } = await supabase
        .from("incidents")
        .select("id, ticket_number, severity, notes, created_at")
        .eq("site_uuid", siteId)
        .eq("status", "OPEN")
        .order("created_at", { ascending: false })
        .limit(20);

      if (incidentError) throw incidentError;
      if (fetchId !== fetchCountRef.current) return;

      const alerts: NocAlert[] = (incidentRows || []).map((inc) => ({
        id:    inc.ticket_number ?? inc.id,
        msg:   inc.notes ?? "Alert",
        level: toAlertLevel(inc.severity),
        time:  toHHMM(new Date(inc.created_at || Date.now())),
      }));

      // ── Commit state ──────────────────────────────────────────────────────
      setLoadChartData(loadPoints);
      setThermalData(thermalPoints);
      setPhaseAlerts(alerts);
      setLatestMetrics(latestM);
      setHasData(loadPoints.length > 0 || thermalPoints.length > 0);
      setLastSync(toHHMM(new Date()));
    } catch (err: any) {
      console.error("[useNocTelemetry] fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  // H-6 FIX: dependency on currentSite?.id so subscriptions re-register
  // when the site changes (e.g. admin switching between sites).
  }, [currentSite?.id]);

  useEffect(() => {
    fetchAll();

    const siteId = currentSite?.id;

    // H-6 FIX: filter realtime subscriptions by site_uuid.
    // Without this, every client receives all-site change events for these
    // tables and triggers a full refetch — both wasteful and a data leak risk.
    const channelLogs = supabase
      .channel(`noc_telemetry_logs_realtime_${siteId ?? 'global'}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "telemetry_logs",
          ...(siteId ? { filter: `site_uuid=eq.${siteId}` } : {})
        },
        () => fetchAll()
      )
      .subscribe();

    const channelIncidents = supabase
      .channel(`noc_incidents_realtime_${siteId ?? 'global'}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "incidents",
          ...(siteId ? { filter: `site_uuid=eq.${siteId}` } : {})
        },
        () => fetchAll()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channelLogs);
      supabase.removeChannel(channelIncidents);
    };
  }, [fetchAll, currentSite?.id]);

  return {
    loadChartData,
    thermalData,
    phaseAlerts,
    latestMetrics,
    lastSync,
    isLoading,
    hasData,
    refresh: fetchAll,
  };
}
