import { useState, useEffect, useCallback, useRef } from 'react';
import { numOrNull } from "@/domain/metrics";
import { useRealtimeTable } from "@/shared/api/realtime";
import { supabase } from '@/shared/api/supabaseClient';
import { useCurrentSite } from '@/shared/context/SiteContext';
import { DateRangeValue, useDateRange } from '@/shared/utils/useDateRange';

// A defensive ceiling, not the primary filter. The date range is what bounds
// the query; this only protects the browser if "All Time" is selected on a
// site with years of hourly data — it should never bind at 2-site scale.
const MAX_ROWS_PER_FETCH = 3000;

export interface GridDataPoint {
  time: string;
  // null = this hour genuinely has no reading. Never backfilled with a
  // plausible-looking number — Recharts gaps the line at null, which is the
  // honest signal; a fabricated 230V is indistinguishable from a real one.
  grid_voltage_r: number | null;
  grid_voltage_y: number | null;
  grid_voltage_b: number | null;
  grid_total_site_load: number | null;
  grid_status: string;
}

export interface HeatmapPoint {
  day: number;
  status: 'clear' | 'minor' | 'critical';
  hours: number;
}

export interface FuelDataPoint {
  date: string;
  run_hrs: number;
  fuel_consumed: number;
  dg1_run_hrs?: number;
  dg1_fuel_consumed?: number;
  dg2_run_hrs?: number;
  dg2_fuel_consumed?: number;
  dg3_run_hrs?: number;
  dg3_fuel_consumed?: number;
  dg4_run_hrs?: number;
  dg4_fuel_consumed?: number;
  dghq_run_hrs?: number;
  dghq_fuel_consumed?: number;
}

export interface EngineHealthPoint {
  name: string;
  oil_pressure: number | null;
  water_temp: number | null;
  batt_voltage: number | null;
  // "NO_DATA" is distinct from "OK" — defaulting an unreported generator to
  // OK would silently hide the fact that nobody actually checked it.
  status: "OK" | "WARNING" | "CRITICAL" | "NO_DATA";
}

export interface UpsDataPoint {
  time: string;
  ups1_load: number | null;
  ups2_load: number | null;
}

export interface PhaseDistributionPoint {
  name: string;
  Phase_A: number | null;
  Phase_B: number | null;
  Phase_C: number | null;
}

export interface ThermalDataPoint {
  time: string;
  server_ambient_temp: number | null;
  return_temp_actual: number | null;
  supply_temp_set: number | null;
}

export interface ZoneDataPoint {
  name: string;
  temp: number | null;
  humidity: number | null;
  status: "Optimal" | "Moderate" | "Warm" | "No Data";
}

// ── Fuel burn-rate specifications (litres per hour at rated load) ──────────
// ⚠ SITE ENGINEERS: replace these with the real spec-sheet burn rates for
// each generator. Until then all units use the fleet estimate of 150 L/hr.
const DG_FUEL_BURN_RATES_LPH: Record<string, number> = {
  dg_1: 150,
  dg_2: 150,
  dg_3: 150,
  dg_4: 150,
  dg_hq: 150,
};

/**
 * Parses a metric value, returning null — not a plausible-looking number —
 * when the field is genuinely absent. A missing reading and a real
 * measurement must never be visually indistinguishable on a chart.
 */
// Shared with every other screen via @/domain/metrics, and with the database
// via public.to_number_or_null(). Four files used to define this separately.


// ⚠ SITE ENGINEERS: placeholder comfort-band thresholds for the zone heatmap,
// mirrored from the old static demo labels. Replace with the facility's real
// ASHRAE/vendor thresholds per room once available.
const zoneStatus = (temp: number | null): ZoneDataPoint['status'] => {
  if (temp === null) return 'No Data';
  if (temp >= 25) return 'Warm';
  if (temp >= 24) return 'Moderate';
  return 'Optimal';
};

export interface IncidentBubblePoint {

  dayIndex: number;
  yValue: number;
  severity: number;
  name: string;
  status: string;
  date: string;
}

export interface TicketPoint {
  id: string;
  name: string;
  tech: string;
  severity: string;
  status: string;
  date: string;
  desc: string;
  resolution: string;
}

export interface DashboardKPIs {
  grid: {
    uptimePercentage: string;
    totalBlackoutDuration: string;
    peakSiteLoad: string;
  };
  fuel: {
    totalRunHours: number;
    totalFuelConsumed: number;
    avgBurnRate: number;
    currentFuelBalance: number;
  };
  ups: {
    maxCapacityPct: number | null;
    avgBatteryCharge: number | null;
    rectifierVoltage: number | null;
  };
  thermal: {
    peakTemp: string;
    avgHumidity: number | null;
    abnormalitiesCount: number;
  };
  incidents: {
    totalIncidents: number;
    openTickets: number;
    mttr: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty, deliberately.
//
// These held invented baselines — grid uptime 77.8%, a 24,350 L fuel balance,
// a 22.4 °C peak, fourteen incidents — and the hook served them until a fetch
// came back with rows. There was an amber banner, but the figures rendered
// exactly like real ones and a screenshot of them was indistinguishable from a
// real report.
//
// A screen with nothing on it and a line saying so is honest. A screen full of
// plausible numbers with a caveat above them is a trap, because the caveat does
// not travel with the screenshot.
// ─────────────────────────────────────────────────────────────────────────────
const defaultGridTimeData: GridDataPoint[] = [];

const defaultHeatmapData: HeatmapPoint[] = [];

const defaultFuelData: FuelDataPoint[] = [];

const defaultEngineHealth: EngineHealthPoint[] = [];

const defaultUpsTimeData: UpsDataPoint[] = [];

const defaultPhaseDistribution: PhaseDistributionPoint[] = [];

const defaultThermalTimeData: ThermalDataPoint[] = [];

const defaultZoneData: ZoneDataPoint[] = [];

const defaultIncidentBubbles: IncidentBubblePoint[] = [];

const defaultTickets: TicketPoint[] = [];

export function useDashboardData(range?: DateRangeValue) {
  const { currentSite } = useCurrentSite();
  // Callers that don't care about the period (none currently) still get a
  // sane default rather than the hook silently doing nothing.
  const internalRange = useDateRange("30d").range;
  const activeRange = range ?? internalRange;

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasNoData, setHasNoData] = useState<boolean>(true);
  const [latestGridStatus, setLatestGridStatus] = useState<string>('ONLINE');
  
  // Data States
  const [gridChartData, setGridChartData] = useState<GridDataPoint[]>(defaultGridTimeData);
  const [heatmapData] = useState<HeatmapPoint[]>(defaultHeatmapData);
  const [fuelChartData, setFuelChartData] = useState<FuelDataPoint[]>(defaultFuelData);
  const [engineHealthData, setEngineHealthData] = useState<EngineHealthPoint[]>(defaultEngineHealth);
  const [upsChartData, setUpsChartData] = useState<UpsDataPoint[]>(defaultUpsTimeData);
  const [phaseDistributionData, setPhaseDistributionData] = useState<PhaseDistributionPoint[]>(defaultPhaseDistribution);
  const [thermalChartData, setThermalChartData] = useState<ThermalDataPoint[]>(defaultThermalTimeData);
  const [zoneData, setZoneData] = useState<ZoneDataPoint[]>(defaultZoneData);
  const [incidentBubbles, setIncidentBubbles] = useState<IncidentBubblePoint[]>(defaultIncidentBubbles);
  const [ticketsLedger, setTicketsLedger] = useState<TicketPoint[]>(defaultTickets);
  
  // KPI State
  const [kpis, setKpis] = useState<DashboardKPIs>({
    grid: { uptimePercentage: "0", totalBlackoutDuration: "0", peakSiteLoad: "0" },
    fuel: { totalRunHours: 0, totalFuelConsumed: 0, avgBurnRate: 0, currentFuelBalance: 0 },
    ups: { maxCapacityPct: 0, avgBatteryCharge: 0, rectifierVoltage: 0 },
    thermal: { peakTemp: "0", avgHumidity: 0, abnormalitiesCount: 0 },
    incidents: { totalIncidents: 0, openTickets: 0, mttr: "0" }
  });

  const fetchCountRef = useRef(0);

  // Bumped by the realtime subscriptions below to re-run the fetch. fetchData
  // lives inside the effect, so it cannot be called from outside it.
  const [liveNonce, setLiveNonce] = useState(0);

  useEffect(() => {
    async function fetchData() {
      const fetchId = ++fetchCountRef.current;
      setIsLoading(true);
      try {
        // Fetch Telemetry Logs (scoped to site AND to the selected period —
        // this used to be a flat "last 50 rows", which on a multi-asset table
        // covered under two days of actual hourly readings and could never be
        // widened. Facility logs only: daily-checklist rows have a
        // completely different metrics shape and plot as junk points, and
        // dg_daily_test rows duplicate an existing target_hour.
        const siteId = currentSite?.id;
        const telQuery = supabase
          .from('telemetry_logs')
          .select('*')
          .eq('asset_id', 'facility_wide')
          .gte('target_hour', activeRange.start.toISOString())
          .lte('target_hour', activeRange.end.toISOString())
          .order('target_hour', { ascending: false })
          .limit(MAX_ROWS_PER_FETCH);
        if (siteId) telQuery.eq('site_uuid', siteId);
        const { data: telLogs, error: telError } = await telQuery;

        // Fetch Incidents (scoped to site AND period, same reasoning)
        const incQuery = supabase
          .from('incidents')
          .select('*')
          .gte('created_at', activeRange.start.toISOString())
          .lte('created_at', activeRange.end.toISOString())
          .order('created_at', { ascending: false })
          .limit(MAX_ROWS_PER_FETCH);
        if (siteId) incQuery.eq('site_uuid', siteId);
        const { data: incData, error: incError } = await incQuery;

        if (telError) throw telError;
        if (incError) throw incError;
        if (fetchId !== fetchCountRef.current) return;

        // Process Telemetry Logs if present
        if (telLogs && telLogs.length > 0) {
          setHasNoData(false);

          // Chronologically ascending for charts
          const sortedLogs = [...telLogs].reverse();

          // 1. Grid Mapping
          const mappedGrid = sortedLogs.map(row => {
            const m = (row.metrics || {}) as Record<string, any>;
            const time = new Date(row.target_hour).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            return {
              time,
              grid_voltage_r: numOrNull(m.grid_voltage_r ?? m.grid_voltage_rs ?? m.ups_1_output_voltage_a),
              grid_voltage_y: numOrNull(m.grid_voltage_y ?? m.grid_voltage_st ?? m.ups_2_output_voltage_a),
              grid_voltage_b: numOrNull(m.grid_voltage_b ?? m.grid_voltage_tr),
              grid_total_site_load: numOrNull(m.grid_total_site_load ?? m.total_active_power_kw),
              grid_status: m.grid_status || 'ONLINE'
            };
          });
          setGridChartData(mappedGrid);

          // Grid Real-Time status
          const latestGridVal = (telLogs[0]?.metrics as Record<string, any> | null)?.grid_status || 'ONLINE';
          setLatestGridStatus(latestGridVal);

          // Grid KPIs
          const totalLogs = telLogs.length;
          const offlineLogs = telLogs.filter(row => {
            const m = (row.metrics || {}) as Record<string, any>;
            const status = (m.grid_status || '').toUpperCase();
            const outageType = m.outage_type || '';
            const isOffline = status === 'OFFLINE' || status === 'OFF';
            return isOffline && outageType !== 'planned_test';
          }).length;
          const uptimePct = totalLogs > 0 ? (((totalLogs - offlineLogs) / totalLogs) * 100).toFixed(1) : "100.0";
          const blackoutHours = (offlineLogs * 1).toFixed(1); // Hourly resolution
          
          // A site with every load reading missing reported nothing — that's
          // "—", not a peak load of literal 0.0kW.
          const loadVals = telLogs
            .map(row => numOrNull(((row.metrics || {}) as Record<string, any>).grid_total_site_load ?? ((row.metrics || {}) as Record<string, any>).total_active_power_kw))
            .filter((v): v is number => v !== null);
          const peakLoad = loadVals.length > 0 ? Math.max(...loadVals).toFixed(1) : "—";

          // 2. Fuel Mapping
          const mappedFuel = sortedLogs.map(row => {
            const m = (row.metrics || {}) as Record<string, any>;
            const date = new Date(row.target_hour).toLocaleDateString([], { month: 'short', day: '2-digit' });
            const result: any = { date };

            // Map each generator prefix dynamically.
            // NOTE: zero run-hours is a REAL answer (the unit didn't run) —
            // never substitute a fabricated default like "2.5 hrs".
            const generatorIds = ['1', '2', '3', '4', 'hq'];
            generatorIds.forEach(id => {
              const prefix = `dg_${id}`;
              const start = parseFloat(m[`${prefix}_hr_meter_start`] ?? 0);
              const stop = parseFloat(m[`${prefix}_hr_meter_stop`] ?? 0);
              let run_hrs = Math.max(0, stop - start);
              if (!run_hrs) run_hrs = parseFloat(m[`${prefix}_run_hrs`] ?? 0) || 0;
              const fuel_consumed = parseFloat(
                m[`${prefix}_calculated_fuel_burn`] ??
                String(run_hrs * (DG_FUEL_BURN_RATES_LPH[prefix] ?? 150))
              );

              const keyName = id === 'hq' ? 'dghq' : `dg${id}`;
              result[`${keyName}_run_hrs`] = run_hrs;
              result[`${keyName}_fuel_consumed`] = fuel_consumed;
            });

            // Totals across ALL configured generators (previously only
            // DG-1 was counted, ignoring 2/3/4/HQ entirely).
            result.run_hrs = generatorIds.reduce((sum, id) => {
              const keyName = id === 'hq' ? 'dghq' : `dg${id}`;
              return sum + (result[`${keyName}_run_hrs`] || 0);
            }, 0);
            result.fuel_consumed = generatorIds.reduce((sum, id) => {
              const keyName = id === 'hq' ? 'dghq' : `dg${id}`;
              return sum + (result[`${keyName}_fuel_consumed`] || 0);
            }, 0);

            return result;
          });
          setFuelChartData(mappedFuel);

          // Fuel KPIs — summed across the whole generator fleet
          let sumRunHours = 0;
          let sumFuelConsumed = 0;
          const fleetPrefixes = ['dg_1', 'dg_2', 'dg_3', 'dg_4', 'dg_hq'];
          telLogs.forEach(row => {
            const m = (row.metrics || {}) as Record<string, any>;
            fleetPrefixes.forEach(prefix => {
              const start = parseFloat(m[`${prefix}_hr_meter_start`] ?? 0);
              const stop = parseFloat(m[`${prefix}_hr_meter_stop`] ?? 0);
              let run_hrs = Math.max(0, stop - start);
              if (!run_hrs) run_hrs = parseFloat(m[`${prefix}_run_hrs`] ?? 0) || 0;

              sumRunHours += run_hrs;
              sumFuelConsumed += parseFloat(
                m[`${prefix}_calculated_fuel_burn`] ??
                String(run_hrs * (DG_FUEL_BURN_RATES_LPH[prefix] ?? 150))
              );
            });
          });


          // Engine Health Scatter Mapping - read dynamic prefixes from the latest log
          const latestLogObj = telLogs[0];
          const latestM = (latestLogObj.metrics || {}) as Record<string, any>;
          const generatorIds = ['1', '2', '3', '4', 'hq'];
          const mappedHealth = generatorIds.map(id => {
            const name = id === 'hq' ? 'DG-HQ' : `DG-${id}`;
            const prefix = `dg_${id}`;
            const oil_pressure = numOrNull(latestM[`${prefix}_oil_pressure`]);
            const water_temp = numOrNull(latestM[`${prefix}_water_temp`]);
            const batt_voltage = numOrNull(latestM[`${prefix}_batt_voltage`]);

            // A generator nobody reported on this cycle must not read as "OK" —
            // defaulting missing sensors to healthy numbers would silently
            // hide the fact that it was never actually checked.
            let status: EngineHealthPoint['status'] = "NO_DATA";
            if (oil_pressure !== null && water_temp !== null) {
              status = "OK";
              if (water_temp > 95 || oil_pressure < 2.5) status = "CRITICAL";
              else if (water_temp > 90 || oil_pressure < 3.5) status = "WARNING";
            }

            return { name, oil_pressure, water_temp, batt_voltage, status };
          });
          setEngineHealthData(mappedHealth);

          // 3. UPS Mapping
          const mappedUps = sortedLogs.map(row => {
            const m = (row.metrics || {}) as Record<string, any>;
            const time = new Date(row.target_hour).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            return {
              time,
              ups1_load: numOrNull(m.ups_1_output_load_kw ?? m.total_active_power_kw),
              ups2_load: numOrNull(m.ups_2_output_load_kw)
            };
          });
          setUpsChartData(mappedUps);

          const latestMetrics = (telLogs[0].metrics || {}) as Record<string, any>;
          const ups1AmpsA = numOrNull(latestMetrics.ups_1_load_amps_a);
          const ups1AmpsB = numOrNull(latestMetrics.ups_1_load_amps_b);
          const ups1AmpsC = numOrNull(latestMetrics.ups_1_load_amps_c);
          const ups2AmpsA = numOrNull(latestMetrics.ups_2_load_amps_a);
          const ups2AmpsB = numOrNull(latestMetrics.ups_2_load_amps_b);
          const ups2AmpsC = numOrNull(latestMetrics.ups_2_load_amps_c);

          setPhaseDistributionData([
            { name: "UPS 1", Phase_A: ups1AmpsA, Phase_B: ups1AmpsB, Phase_C: ups1AmpsC },
            { name: "UPS 2", Phase_A: ups2AmpsA, Phase_B: ups2AmpsB, Phase_C: ups2AmpsC }
          ]);

          // UPS KPIs
          const maxCapacityPct = numOrNull(latestMetrics.ups_1_used_capacity ?? latestMetrics.ups_2_used_capacity);
          const avgBatteryCharge = numOrNull(latestMetrics.ups_1_battery_charge_percent ?? latestMetrics.ups_2_battery_charge_percent);
          const rectifierVoltage = numOrNull(latestMetrics.rectifier_1_dc_voltage ?? latestMetrics.rectifier_2_dc_voltage);

          // 4. Thermal Mapping
          const mappedThermal = sortedLogs.map(row => {
            const m = (row.metrics || {}) as Record<string, any>;
            const time = new Date(row.target_hour).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            return {
              time,
              server_ambient_temp: numOrNull(m.server_ambient_temp),
              return_temp_actual: numOrNull(m.pac_1_return_temp_actual),
              supply_temp_set: numOrNull(m.pac_1_supply_temp_set)
            };
          });
          setThermalChartData(mappedThermal);

          // Zones — status is derived from the actual reading (zoneStatus),
          // never asserted independently of it. The old static per-room
          // labels claimed e.g. "HQ Power Room: Warm" regardless of what the
          // temperature field actually held.
          const mappedZones: ZoneDataPoint[] = [
            { name: "Server Room", temp: numOrNull(latestMetrics.server_ambient_temp), humidity: numOrNull(latestMetrics.server_ambient_humidity) },
            { name: "IT Room 1", temp: numOrNull(latestMetrics.it1_ambient_temp), humidity: numOrNull(latestMetrics.it1_ambient_humidity) },
            { name: "IT Room 2", temp: numOrNull(latestMetrics.it2_ambient_temp), humidity: numOrNull(latestMetrics.it2_ambient_humidity) },
            { name: "Power Room 1", temp: numOrNull(latestMetrics.pr1_ambient_temp), humidity: numOrNull(latestMetrics.pr1_ambient_humidity) },
            { name: "Power Room 2", temp: numOrNull(latestMetrics.pr2_ambient_temp), humidity: numOrNull(latestMetrics.pr2_ambient_humidity) },
            { name: "HQ Power Room", temp: numOrNull(latestMetrics.hq_ambient_temp), humidity: numOrNull(latestMetrics.hq_ambient_humidity) }
          ].map(z => ({ ...z, status: zoneStatus(z.temp) }));
          setZoneData(mappedZones);

          // Thermal KPIs — a site with no server_ambient_temp reading anywhere
          // in the window reported nothing; that's "—", not a fabricated 22.4°C.
          const tempVals = telLogs
            .map(row => numOrNull(((row.metrics || {}) as Record<string, any>).server_ambient_temp))
            .filter((v): v is number => v !== null);
          const peakTemp = tempVals.length > 0 ? Math.max(...tempVals).toFixed(1) : "—";
          const avgHumidity = numOrNull(latestMetrics.server_ambient_humidity);

          // Dynamic calculation of abnormalitiesCount
          let abnormalitiesCountVal = 0;
          Object.entries(latestMetrics).forEach(([key, val]) => {
            const valStr = String(val).toUpperCase();
            if (key.includes('abnormality') && valStr !== 'NON' && valStr !== 'NO' && valStr !== 'OK') {
              abnormalitiesCountVal++;
            }
            if (key.includes('status') && (valStr === 'NOT OK' || valStr === 'OFFLINE' || valStr === 'FAULT')) {
              abnormalitiesCountVal++;
            }
          });

          // 5. Incident Mapping
          // A site with real telemetry but zero incidents on record has zero
          // incidents — it must never fall back to the named demo tickets
          // (defaultIncidentBubbles/defaultTickets). Those defaults exist
          // solely for the true no-telemetry-at-all mock state, gated by the
          // initial useState values below, not re-entered here.
          let incidentBubblesData: IncidentBubblePoint[] = [];
          let ticketsLedgerData: TicketPoint[] = [];
          let totalIncidents = 0;
          let openTickets = 0;
          let mttr = "—";

          if (incData && incData.length > 0) {
            totalIncidents = incData.length;
            openTickets = incData.filter(t => (t.status as string) === "OPEN" || (t.status as string) === "RAISED").length;

            ticketsLedgerData = incData.map(inc => ({
              id: inc.ticket_number || `INC-${String(inc.id).substring(0, 4)}`,
              name: inc.notes ? inc.notes.substring(0, 30) + (inc.notes.length > 30 ? "..." : "") : "Utility Failure",
              tech: inc.raised_by_name || 'NOC Operator',
              severity: inc.severity || 'medium',
              status: inc.status === "RESOLVED" ? "Resolved" : "Open",
              date: new Date(inc.created_at || Date.now()).toLocaleDateString([], { month: 'short', day: '2-digit' }),
              desc: inc.notes || 'No description provided.',
              resolution: inc.resolution_details || 'Pending resolution details.'
            }));

            incidentBubblesData = incData.slice(0, 10).map((inc, idx) => {
              let severityVal = 100;
              if (inc.severity === 'critical') severityVal = 500;
              else if ((inc.severity as string) === 'high') severityVal = 300;
              else if (inc.severity === 'medium') severityVal = 150;

              return {
                dayIndex: new Date(inc.created_at || Date.now()).getTime(),
                yValue: (idx % 5) + 1,
                severity: severityVal,
                name: inc.notes ? inc.notes.substring(0, 20) + "..." : inc.ticket_number,
                status: inc.status === "RESOLVED" ? "Resolved" : "Open",
                date: new Date(inc.created_at || Date.now()).toLocaleDateString([], { month: 'short', day: '2-digit' })
              };
            });

            // Calculate MTTR in hours for resolved incidents
            const resolvedIncidents = incData.filter(t => t.status === "RESOLVED" && t.resolved_at && t.occurred_at);
            if (resolvedIncidents.length > 0) {
              const totalDurationMs = resolvedIncidents.reduce((sum, current) => {
                const diff = new Date(current.resolved_at!).getTime() - new Date(current.occurred_at!).getTime();
                return sum + diff;
              }, 0);
              const avgDurationHours = (totalDurationMs / (1000 * 60 * 60 * resolvedIncidents.length)).toFixed(1);
              mttr = avgDurationHours;
            }
          }

          setIncidentBubbles(incidentBubblesData);
          setTicketsLedger(ticketsLedgerData);

          // Fleet-average burn rate derived from actuals (0 when nothing ran)
          const avgBurnRate = sumRunHours > 0
            ? parseFloat((sumFuelConsumed / sumRunHours).toFixed(1))
            : 0;

          // Update KPIs state — real totals only; when live data exists a
          // legitimate zero must never be replaced by a mock fallback.
          setKpis({
            grid: {
              uptimePercentage: uptimePct !== "NaN" ? uptimePct : "100.0",
              totalBlackoutDuration: blackoutHours,
              peakSiteLoad: peakLoad
            },
            fuel: {
              totalRunHours: parseFloat(sumRunHours.toFixed(1)),
              totalFuelConsumed: parseFloat(sumFuelConsumed.toFixed(1)),
              avgBurnRate: avgBurnRate,
              currentFuelBalance: parseFloat(latestMetrics.fuel_balance ?? 0)
            },

            ups: {
              maxCapacityPct,
              avgBatteryCharge,
              rectifierVoltage
            },
            thermal: {
              peakTemp: peakTemp,
              avgHumidity,
              abnormalitiesCount: abnormalitiesCountVal
            },
            incidents: {
              totalIncidents,
              openTickets,
              mttr
            }
          });
        }
      } catch (err) {
        console.warn("[DCIMe] Failed to fetch live analytics data:", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();


  // activeRange.start/end as primitive timestamps, not the Date/object
  // itself — a new Date instance with the same value must not be treated as
  // a changed dependency and refetch on every render.
  }, [currentSite?.id, activeRange.start.getTime(), activeRange.end.getTime(), liveNonce]);

  const siteFilter = currentSite?.id ? `site_uuid=eq.${currentSite.id}` : undefined;
  const bump = useCallback(() => setLiveNonce(n => n + 1), []);
  useRealtimeTable({ table: "telemetry_logs", filter: siteFilter, onChange: bump });
  useRealtimeTable({ table: "incidents",      filter: siteFilter, onChange: bump });

  return {
    isLoading,
    hasNoData,
    latestGridStatus,
    gridChartData,
    heatmapData,
    fuelChartData,
    engineHealthData,
    upsChartData,
    phaseDistributionData,
    thermalChartData,
    zoneData,
    incidentBubbles,
    ticketsLedger,
    kpis
  };
}
