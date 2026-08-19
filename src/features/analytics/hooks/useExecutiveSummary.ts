// src/features/analytics/hooks/useExecutiveSummary.ts
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/shared/api/supabaseClient";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { computeRange } from "@/shared/utils/useDateRange";

export type Verdict = "HEALTHY" | "WATCH" | "CRITICAL" | "NO_DATA";
export type PeriodKey = "today" | "yesterday" | "week" | "month";

export interface SectorSummary {
  verdict: Verdict;
  headline: string;
  detail: string;
}

export interface PeriodSnapshot {
  label: string;
  gridUptimePct: number | null;
  peakLoadKw: number | null;
  genRunHours: number;
  genFuelConsumed: number;
  /** Highest UPS load reached in the window — the worst-case moment, same
   *  logic as peakLoadKw/peakTempC. A single "latest reading" doesn't mean
   *  anything once the window is a week or a month wide. */
  upsPeakCapacityPct: number | null;
  /** Lowest battery charge reached — for battery, the worst case is the
   *  minimum, not the maximum. */
  upsMinBatteryPct: number | null;
  peakTempC: number | null;
  avgHumidityPct: number | null;
  incidentsOpened: number;
  incidentsCritical: number;
  /** Approximate — see PUE note in the summary component. Computed from the
   *  window's average load, not a single reading. Null if either side of
   *  the ratio has no data. */
  puEstimate: number | null;
}

export interface GeneratorLedgerRow {
  unit: string;
  runHours: number | null;
  batteryVoltage: number | null;
  oilPressure: number | null;
  waterTemp: number | null;
  verdict: Verdict;
}

export interface UpsLedgerRow {
  unit: string;
  capacityPct: number | null;
  batteryPct: number | null;
  rectifierVoltage: number | null;
  phaseAmps: { a: number | null; b: number | null; c: number | null };
  verdict: Verdict;
}

export interface ZoneLedgerRow {
  name: string;
  tempC: number | null;
  humidityPct: number | null;
  verdict: Verdict;
}

export interface IncidentLedgerRow {
  ticketNumber: string;
  assetId: string;
  severity: string;
  status: string;
  /** Real text already recorded by a human — never generated narrative. */
  notes: string | null;
  resolutionDetails: string | null;
  occurredAt: string;
  resolvedAt: string | null;
}

export interface TodayDetail {
  /** Null fields mean the reading is genuinely absent — never backfilled. */
  gridVoltage: { r: number | null; y: number | null; b: number | null };
  fuelBalanceLiters: number | null;
  generators: GeneratorLedgerRow[];
  ups: UpsLedgerRow[];
  zones: ZoneLedgerRow[];
  incidents: IncidentLedgerRow[];
  /** Hours today (0-23) where the grid was logged offline — hourly telemetry
   *  resolution means this can only ever be "which hours," never a precise
   *  minute-level start/end time. Never fabricate the latter. */
  offlineHours: number[];
}

export interface ExecutiveSummaryResult {
  isLoading: boolean;
  error: string | null;
  periods: Record<PeriodKey, PeriodSnapshot> | null;
  todayDetail: TodayDetail | null;
  sectors: {
    power: SectorSummary;
    generators: SectorSummary;
    ups: SectorSummary;
    thermal: SectorSummary;
    incidents: SectorSummary;
  } | null;
  refresh: () => void;
}

// Same placeholder thresholds already used for the "today" sector verdicts
// below — reused here so the per-asset ledgers agree with the headline
// verdicts instead of quietly using a second, different scale.
const bandVerdict = (value: number | null, healthyMax: number, watchMax: number): Verdict => {
  if (value === null) return "NO_DATA";
  if (value > watchMax) return "CRITICAL";
  if (value > healthyMax) return "WATCH";
  return "HEALTHY";
};

const numOrNull = (v: any): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

const avg = (vals: number[]): number | null => vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
const max = (vals: number[]): number | null => vals.length > 0 ? Math.max(...vals) : null;
const min = (vals: number[]): number | null => vals.length > 0 ? Math.min(...vals) : null;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

/**
 * Aggregates telemetry + incidents over an arbitrary window — one day, a
 * week, a month, all use the same math. A report you print and hand to
 * someone doesn't need to update itself while they're reading it, so this
 * does one fetch per window, on demand, rather than staying subscribed to
 * realtime changes like the live analytics hooks do. That also sidesteps
 * useDashboardData's realtime channel name being keyed only on site (not on
 * the range), which would collide if this called it multiple times with
 * different windows in the same component.
 */
async function fetchPeriodSnapshot(siteId: string, start: Date, end: Date, label: string): Promise<PeriodSnapshot> {
  const startISO = start.toISOString();
  const endISO = end.toISOString();

  const [telRes, incRes] = await Promise.all([
    supabase
      .from("telemetry_logs")
      .select("target_hour, metrics")
      .eq("site_uuid", siteId)
      .eq("asset_id", "facility_wide")
      .gte("target_hour", startISO)
      .lte("target_hour", endISO)
      .order("target_hour", { ascending: true }),
    supabase
      .from("incidents")
      .select("id, status, severity, created_at")
      .eq("site_uuid", siteId)
      .gte("created_at", startISO)
      .lte("created_at", endISO),
  ]);

  if (telRes.error) throw telRes.error;
  if (incRes.error) throw incRes.error;

  const rows = telRes.data || [];
  const metricsOf = (r: (typeof rows)[number]) => (r.metrics || {}) as Record<string, any>;

  // Grid uptime — same formula as the analytics KPI engine.
  const offlineRows = rows.filter((r) => {
    const m = metricsOf(r);
    const status = String(m.grid_status || "").toUpperCase();
    return (status === "OFFLINE" || status === "OFF") && m.outage_type !== "planned_test";
  }).length;
  const gridUptimePct = rows.length > 0 ? ((rows.length - offlineRows) / rows.length) * 100 : null;

  const loadVals = rows.map((r) => numOrNull(metricsOf(r).grid_total_site_load)).filter((v): v is number => v !== null);
  const peakLoadKw = max(loadVals);

  const tempVals = rows.map((r) => numOrNull(metricsOf(r).server_ambient_temp)).filter((v): v is number => v !== null);
  const peakTempC = max(tempVals);

  const humidityVals = rows.map((r) => numOrNull(metricsOf(r).server_ambient_humidity)).filter((v): v is number => v !== null);
  const avgHumidityPct = avg(humidityVals) !== null ? parseFloat(avg(humidityVals)!.toFixed(1)) : null;

  const upsCapacityVals = rows
    .map((r) => numOrNull(metricsOf(r).ups_1_used_capacity ?? metricsOf(r).ups_2_used_capacity))
    .filter((v): v is number => v !== null);
  const upsPeakCapacityPct = max(upsCapacityVals);

  const upsBatteryVals = rows
    .map((r) => numOrNull(metricsOf(r).ups_1_battery_charge_percent ?? metricsOf(r).ups_2_battery_charge_percent))
    .filter((v): v is number => v !== null);
  const upsMinBatteryPct = min(upsBatteryVals);

  // Generator run hours / fuel — summed across the fleet, same logic as
  // useDashboardData: hr_meter delta first, run_hrs field as fallback, and a
  // real zero (a unit that didn't run) is never overwritten.
  let genRunHours = 0;
  let genFuelConsumed = 0;
  const DG_BURN_RATE_LPH = 150; // ⚠ placeholder fleet estimate, see useDashboardData
  rows.forEach((r) => {
    const m = metricsOf(r);
    ["dg_1", "dg_2", "dg_3", "dg_4", "dg_hq"].forEach((prefix) => {
      const s = numOrNull(m[`${prefix}_hr_meter_start`]) ?? 0;
      const e = numOrNull(m[`${prefix}_hr_meter_stop`]) ?? 0;
      let runHrs = Math.max(0, e - s);
      if (!runHrs) runHrs = numOrNull(m[`${prefix}_run_hrs`]) ?? 0;
      genRunHours += runHrs;
      genFuelConsumed += numOrNull(m[`${prefix}_calculated_fuel_burn`]) ?? (runHrs * DG_BURN_RATE_LPH);
    });
  });

  // PUE from the window's AVERAGE load, not a single reading — a typical
  // ratio for the period rather than whichever hour happened to be last.
  const itLoadVals = rows
    .map((r) => {
      const m = metricsOf(r);
      const a = numOrNull(m.ups_1_output_load_kw);
      const b = numOrNull(m.ups_2_output_load_kw);
      return a !== null || b !== null ? (a ?? 0) + (b ?? 0) : null;
    })
    .filter((v): v is number => v !== null);
  const avgFacilityKw = avg(loadVals);
  const avgItKw = avg(itLoadVals);
  const puEstimate = avgFacilityKw !== null && avgItKw !== null && avgItKw > 0
    ? avgFacilityKw / avgItKw
    : null;

  const incidents = incRes.data || [];

  return {
    label,
    gridUptimePct,
    peakLoadKw,
    genRunHours: parseFloat(genRunHours.toFixed(1)),
    genFuelConsumed: parseFloat(genFuelConsumed.toFixed(1)),
    upsPeakCapacityPct,
    upsMinBatteryPct,
    peakTempC,
    avgHumidityPct,
    incidentsOpened: incidents.length,
    incidentsCritical: incidents.filter((i) => i.severity === "critical").length,
    puEstimate,
  };
}

/**
 * Per-asset detail for a single day — the "long report" needs to show each
 * generator and UPS unit individually, not the fleet aggregate the period
 * snapshots use. Deliberately scoped to today only: a per-asset breakdown
 * of "this month" would mean picking one arbitrary hour out of hundreds to
 * represent a whole month, which isn't a real answer.
 */
async function fetchTodayDetail(siteId: string, day: Date): Promise<TodayDetail> {
  const dayStart = startOfDay(day).toISOString();
  const dayEnd = endOfDay(day).toISOString();

  const [telRes, incRes] = await Promise.all([
    supabase
      .from("telemetry_logs")
      .select("target_hour, metrics")
      .eq("site_uuid", siteId)
      .eq("asset_id", "facility_wide")
      .gte("target_hour", dayStart)
      .lte("target_hour", dayEnd)
      .order("target_hour", { ascending: true }),
    supabase
      .from("incidents")
      .select("ticket_number, asset_id, severity, status, notes, resolution_details, occurred_at, resolved_at, created_at")
      .eq("site_uuid", siteId)
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd)
      .order("created_at", { ascending: false }),
  ]);

  if (telRes.error) throw telRes.error;
  if (incRes.error) throw incRes.error;

  const rows = telRes.data || [];
  const latest = rows.length > 0 ? (rows[rows.length - 1].metrics as Record<string, any>) : {};

  const offlineHours = rows
    .filter((r) => {
      const m = (r.metrics || {}) as Record<string, any>;
      const status = String(m.grid_status || "").toUpperCase();
      return (status === "OFFLINE" || status === "OFF") && m.outage_type !== "planned_test";
    })
    .map((r) => new Date(r.target_hour).getHours());

  const generators: GeneratorLedgerRow[] = ["dg_1", "dg_2", "dg_3", "dg_4", "dg_hq"].map((prefix) => {
    const runHours = numOrNull(latest[`${prefix}_run_hrs`]);
    const oilPressure = numOrNull(latest[`${prefix}_oil_pressure`]);
    const waterTemp = numOrNull(latest[`${prefix}_water_temp`]);
    // Same thresholds as useDashboardData's engine-health mapping.
    let verdict: Verdict = "NO_DATA";
    if (oilPressure !== null && waterTemp !== null) {
      verdict = "HEALTHY";
      if (waterTemp > 95 || oilPressure < 2.5) verdict = "CRITICAL";
      else if (waterTemp > 90 || oilPressure < 3.5) verdict = "WATCH";
    }
    return {
      unit: prefix === "dg_hq" ? "DG-HQ" : `DG-${prefix.split("_")[1]}`,
      runHours,
      batteryVoltage: numOrNull(latest[`${prefix}_batt_voltage`]),
      oilPressure,
      waterTemp,
      verdict,
    };
  });

  const ups: UpsLedgerRow[] = ["ups_1", "ups_2"].map((prefix) => {
    const capacityPct = numOrNull(latest[`${prefix}_used_capacity`]);
    return {
      unit: prefix === "ups_1" ? "UPS-1" : "UPS-2",
      capacityPct,
      batteryPct: numOrNull(latest[`${prefix}_battery_charge_percent`]),
      rectifierVoltage: numOrNull(latest[prefix === "ups_1" ? "rectifier_1_dc_voltage" : "rectifier_2_dc_voltage"]),
      phaseAmps: {
        a: numOrNull(latest[`${prefix}_load_amps_a`]),
        b: numOrNull(latest[`${prefix}_load_amps_b`]),
        c: numOrNull(latest[`${prefix}_load_amps_c`]),
      },
      verdict: bandVerdict(capacityPct, 80, 90),
    };
  });

  const ZONE_FIELDS: { name: string; tempKey: string; humidKey: string }[] = [
    { name: "Server Room", tempKey: "server_ambient_temp", humidKey: "server_ambient_humidity" },
    { name: "IT Room 1", tempKey: "it1_ambient_temp", humidKey: "it1_ambient_humidity" },
    { name: "IT Room 2", tempKey: "it2_ambient_temp", humidKey: "it2_ambient_humidity" },
    { name: "Power Room 1", tempKey: "pr1_ambient_temp", humidKey: "pr1_ambient_humidity" },
    { name: "Power Room 2", tempKey: "pr2_ambient_temp", humidKey: "pr2_ambient_humidity" },
    { name: "HQ Power Room", tempKey: "hq_ambient_temp", humidKey: "hq_ambient_humidity" },
  ];
  const zones: ZoneLedgerRow[] = ZONE_FIELDS.map(({ name, tempKey, humidKey }) => {
    const tempC = numOrNull(latest[tempKey]);
    return {
      name,
      tempC,
      humidityPct: numOrNull(latest[humidKey]),
      // Same 27/30 band as the thermal sector verdict above, for internal
      // consistency within this report.
      verdict: bandVerdict(tempC, 27, 30),
    };
  });

  const incidents: IncidentLedgerRow[] = (incRes.data || []).map((row) => ({
    ticketNumber: row.ticket_number || "—",
    assetId: row.asset_id || "—",
    severity: row.severity || "medium",
    status: row.status || "OPEN",
    notes: row.notes || null,
    resolutionDetails: row.resolution_details || null,
    occurredAt: row.occurred_at || row.created_at || "",
    resolvedAt: row.resolved_at || null,
  }));

  return {
    gridVoltage: {
      r: numOrNull(latest.grid_voltage_r ?? latest.grid_voltage_rs),
      y: numOrNull(latest.grid_voltage_y ?? latest.grid_voltage_st),
      b: numOrNull(latest.grid_voltage_b ?? latest.grid_voltage_tr),
    },
    fuelBalanceLiters: numOrNull(latest.fuel_balance),
    generators,
    ups,
    zones,
    incidents,
    offlineHours: Array.from(new Set(offlineHours)).sort((a, b) => a - b),
  };
}

function buildSectors(today: PeriodSnapshot): ExecutiveSummaryResult["sectors"] {
  const power: SectorSummary = today.gridUptimePct === null
    ? { verdict: "NO_DATA", headline: "No telemetry today", detail: "No facility readings logged yet today." }
    : {
        verdict: today.gridUptimePct >= 99 ? "HEALTHY" : today.gridUptimePct >= 95 ? "WATCH" : "CRITICAL",
        headline: `Grid uptime ${today.gridUptimePct.toFixed(1)}%`,
        detail: `Peak site load ${today.peakLoadKw !== null ? today.peakLoadKw.toFixed(1) + " kW" : "not recorded"} today.`,
      };

  const generators: SectorSummary = {
    verdict: today.genRunHours > 0 ? "WATCH" : "HEALTHY",
    headline: today.genRunHours > 0
      ? `Generators ran ${today.genRunHours.toFixed(1)} hrs today`
      : "Generators on standby all day",
    detail: today.genRunHours > 0
      ? `${today.genFuelConsumed.toFixed(0)} L consumed — mains was interrupted at some point today.`
      : "No generator run time logged — mains supplied the full day.",
  };

  const ups: SectorSummary = today.upsPeakCapacityPct === null
    ? { verdict: "NO_DATA", headline: "No UPS reading today", detail: "No UPS capacity reading logged yet today." }
    : {
        verdict: bandVerdict(today.upsPeakCapacityPct, 80, 90),
        headline: `UPS peaked at ${today.upsPeakCapacityPct}% capacity`,
        detail: today.upsMinBatteryPct !== null
          ? `Battery charge dipped to ${today.upsMinBatteryPct}% at its lowest. Safe range is below 90% capacity.`
          : `Safe range is below 90% capacity.`,
      };

  const thermal: SectorSummary = today.peakTempC === null
    ? { verdict: "NO_DATA", headline: "No thermal reading today", detail: "No server room temperature logged yet today." }
    : {
        // ⚠ placeholder comfort band, same as ThermalAnalytics/useDashboardData.
        verdict: today.peakTempC > 30 ? "CRITICAL" : today.peakTempC > 27 ? "WATCH" : "HEALTHY",
        headline: `Peak server room temp ${today.peakTempC.toFixed(1)}°C`,
        detail: today.avgHumidityPct !== null
          ? `Average humidity ${today.avgHumidityPct}% — nominal band is 40-60%.`
          : "Humidity not recorded today.",
      };

  const incidents: SectorSummary = {
    verdict: today.incidentsCritical > 0 ? "CRITICAL" : today.incidentsOpened > 0 ? "WATCH" : "HEALTHY",
    headline: today.incidentsOpened === 0
      ? "No incidents logged today"
      : `${today.incidentsOpened} incident${today.incidentsOpened === 1 ? "" : "s"} logged today`,
    detail: today.incidentsCritical > 0
      ? `${today.incidentsCritical} critical — review the Alerts Log.`
      : today.incidentsOpened > 0
        ? "None critical."
        : "Nothing to review.",
  };

  return { power, generators, ups, thermal, incidents };
}

export function useExecutiveSummary(): ExecutiveSummaryResult {
  const { currentSite } = useCurrentSite();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periods, setPeriods] = useState<Record<PeriodKey, PeriodSnapshot> | null>(null);
  const [todayDetail, setTodayDetail] = useState<TodayDetail | null>(null);

  const refresh = useCallback(() => {
    if (!currentSite?.id) {
      setPeriods(null);
      setTodayDetail(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

    // "Last 7 Days" and "This Month" reuse the exact same presets as the
    // browse-range picker on the other tabs, so "week"/"month" here means
    // the same thing it means everywhere else in the app.
    const week = computeRange("7d");
    const month = computeRange("thisMonth");

    Promise.all([
      fetchPeriodSnapshot(currentSite.id, startOfDay(now), endOfDay(now), "Today"),
      fetchPeriodSnapshot(currentSite.id, startOfDay(yesterday), endOfDay(yesterday), "Yesterday"),
      fetchPeriodSnapshot(currentSite.id, week.start, week.end, "Last 7 Days"),
      fetchPeriodSnapshot(currentSite.id, month.start, month.end, "This Month"),
      fetchTodayDetail(currentSite.id, now),
    ])
      .then(([today, yest, wk, mo, detail]) => {
        setPeriods({ today, yesterday: yest, week: wk, month: mo });
        setTodayDetail(detail);
      })
      .catch((err) => {
        console.error("[ExecutiveSummary] fetch failed:", err);
        setError(err.message || "Failed to load executive summary.");
      })
      .finally(() => setIsLoading(false));
  }, [currentSite?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const sectors = periods ? buildSectors(periods.today) : null;

  return { isLoading, error, periods, todayDetail, sectors, refresh };
}
