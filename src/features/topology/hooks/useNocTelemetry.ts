import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/shared/api/supabaseClient";

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
  const [loadChartData, setLoadChartData] = useState<NocLoadPoint[]>([]);
  const [thermalData,   setThermalData]   = useState<NocThermalPoint[]>([]);
  const [phaseAlerts,   setPhaseAlerts]   = useState<NocAlert[]>([]);
  const [latestMetrics, setLatestMetrics] = useState<Record<string, any>>({});
  const [lastSync,      setLastSync]      = useState<string>("—");
  const [isLoading,     setIsLoading]     = useState<boolean>(true);
  const [hasData,       setHasData]       = useState<boolean>(false);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      // ── Query 1: telemetry logs (order by target_hour descending to get latest, then limit 50) ──
      const { data: telemetryRows, error: telemetryError } = await supabase
        .from("telemetry_logs")
        .select("target_hour, metrics")
        .order("target_hour", { ascending: true })
        .limit(50);

      if (telemetryError) throw telemetryError;

      // ── Build load chart data ─────────────────────────────────────────────
      const loadPoints: NocLoadPoint[] = (telemetryRows || []).map((row) => {
        const date = new Date(row.target_hour);
        const metrics = (row.metrics as Record<string, any>) || {};
        const kw =
          parseFloat(metrics["grid_total_site_load"] ?? metrics["ups_1_output_load_kw"] ?? metrics["ups_2_output_load_kw"] ?? metrics["total_active_power_kw"] ?? 0) || 0;
        return { t: toHourLabel(date), kw };
      });

      // ── Build thermal data & latest metrics from the latest row ────────────
      let thermalPoints: NocThermalPoint[] = [];
      let latestM: Record<string, any> = {};
      if (telemetryRows && telemetryRows.length > 0) {
        latestM = (telemetryRows[telemetryRows.length - 1].metrics as Record<string, any>) || {};
        thermalPoints = THERMAL_ROOMS.map(({ id, room }) => {
          const raw = parseFloat(latestM[id] ?? 0);
          return { room, temp: isNaN(raw) ? 0 : raw };
        }).filter((p) => p.temp > 0);
      }

      // ── Query 2: open incidents → phase alerts ───────────────────────────
      const { data: incidentRows, error: incidentError } = await supabase
        .from("incidents")
        .select("id, ticket_number, severity, notes, created_at")
        .eq("status", "OPEN")
        .order("created_at", { ascending: false })
        .limit(20);

      if (incidentError) throw incidentError;

      const alerts: NocAlert[] = (incidentRows || []).map((inc) => ({
        id:    inc.ticket_number ?? inc.id,
        msg:   inc.notes ?? "Alert",
        level: toAlertLevel(inc.severity),
        time:  toHHMM(new Date(inc.created_at)),
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
  }, []);

  useEffect(() => {
    fetchAll();

    const channelLogs = supabase
      .channel("noc_telemetry_logs_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "telemetry_logs" },
        () => fetchAll()
      )
      .subscribe();

    const channelIncidents = supabase
      .channel("noc_incidents_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "incidents" },
        () => fetchAll()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channelLogs);
      supabase.removeChannel(channelIncidents);
    };
  }, [fetchAll]);

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
