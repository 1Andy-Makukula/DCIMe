import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/shared/api/supabaseClient';
import { useCurrentSite } from '@/shared/context/SiteContext';

export interface GridDataPoint {
  time: string;
  grid_voltage_r: number;
  grid_voltage_y: number;
  grid_voltage_b: number;
  grid_total_site_load: number;
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
  oil_pressure: number;
  water_temp: number;
  batt_voltage: number;
  status: string;
}

export interface UpsDataPoint {
  time: string;
  ups1_load: number;
  ups2_load: number;
}

export interface PhaseDistributionPoint {
  name: string;
  Phase_A: number;
  Phase_B: number;
  Phase_C: number;
}

export interface ThermalDataPoint {
  time: string;
  server_ambient_temp: number;
  return_temp_actual: number;
  supply_temp_set: number;
}

export interface ZoneDataPoint {
  name: string;
  temp: number;
  humidity: number;
  status: string;
}

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
    maxCapacityPct: number;
    avgBatteryCharge: number;
    rectifierVoltage: number;
  };
  thermal: {
    peakTemp: string;
    avgHumidity: number;
    abnormalitiesCount: number;
  };
  incidents: {
    totalIncidents: number;
    openTickets: number;
    mttr: string;
  };
}

// Default baseline mock data
const defaultGridTimeData: GridDataPoint[] = [
  { time: "08:00", grid_voltage_r: 231.2, grid_voltage_y: 229.5, grid_voltage_b: 230.1, grid_total_site_load: 85.4, grid_status: "ONLINE" },
  { time: "09:00", grid_voltage_r: 230.5, grid_voltage_y: 228.8, grid_voltage_b: 229.4, grid_total_site_load: 92.1, grid_status: "ONLINE" },
  { time: "10:00", grid_voltage_r: 229.8, grid_voltage_y: 228.1, grid_voltage_b: 228.9, grid_total_site_load: 95.8, grid_status: "ONLINE" },
  { time: "11:00", grid_voltage_r: 0, grid_voltage_y: 0, grid_voltage_b: 0, grid_total_site_load: 12.0, grid_status: "OFFLINE" },
  { time: "12:00", grid_voltage_r: 0, grid_voltage_y: 0, grid_voltage_b: 0, grid_total_site_load: 10.5, grid_status: "OFFLINE" },
  { time: "13:00", grid_voltage_r: 232.1, grid_voltage_y: 230.4, grid_voltage_b: 231.0, grid_total_site_load: 88.0, grid_status: "ONLINE" },
  { time: "14:00", grid_voltage_r: 231.7, grid_voltage_y: 229.9, grid_voltage_b: 230.5, grid_total_site_load: 87.2, grid_status: "ONLINE" },
  { time: "15:00", grid_voltage_r: 230.9, grid_voltage_y: 229.1, grid_voltage_b: 229.8, grid_total_site_load: 90.5, grid_status: "ONLINE" },
  { time: "16:00", grid_voltage_r: 231.0, grid_voltage_y: 229.3, grid_voltage_b: 230.0, grid_total_site_load: 94.0, grid_status: "ONLINE" }
];

const defaultHeatmapData: HeatmapPoint[] = Array.from({ length: 30 }, (_, idx) => {
  const day = idx + 1;
  let status: 'clear' | 'minor' | 'critical' = 'clear';
  let hours = 0;
  if (day === 4 || day === 18 || day === 28) {
    status = 'minor';
    hours = day === 4 ? 0.5 : day === 18 ? 0.8 : 0.4;
  } else if (day === 11 || day === 25) {
    status = 'critical';
    hours = day === 11 ? 2.4 : 3.1;
  }
  return { day, status, hours };
});

const defaultFuelData: FuelDataPoint[] = [
  { date: "Jul 01", run_hrs: 4.2, fuel_consumed: 630, dg1_run_hrs: 4.2, dg1_fuel_consumed: 630, dg2_run_hrs: 2.5, dg2_fuel_consumed: 375, dg3_run_hrs: 3.1, dg3_fuel_consumed: 465, dg4_run_hrs: 1.8, dg4_fuel_consumed: 270, dghq_run_hrs: 0.8, dghq_fuel_consumed: 120 },
  { date: "Jul 02", run_hrs: 2.8, fuel_consumed: 420, dg1_run_hrs: 2.8, dg1_fuel_consumed: 420, dg2_run_hrs: 1.4, dg2_fuel_consumed: 210, dg3_run_hrs: 2.0, dg3_fuel_consumed: 300, dg4_run_hrs: 1.2, dg4_fuel_consumed: 180, dghq_run_hrs: 0.0, dghq_fuel_consumed: 0 },
  { date: "Jul 03", run_hrs: 5.5, fuel_consumed: 825, dg1_run_hrs: 5.5, dg1_fuel_consumed: 825, dg2_run_hrs: 3.2, dg2_fuel_consumed: 480, dg3_run_hrs: 4.0, dg3_fuel_consumed: 600, dg4_run_hrs: 2.5, dg4_fuel_consumed: 375, dghq_run_hrs: 1.2, dghq_fuel_consumed: 180 },
  { date: "Jul 04", run_hrs: 1.0, fuel_consumed: 150, dg1_run_hrs: 1.0, dg1_fuel_consumed: 150, dg2_run_hrs: 0.5, dg2_fuel_consumed: 75, dg3_run_hrs: 0.8, dg3_fuel_consumed: 120, dg4_run_hrs: 0.0, dg4_fuel_consumed: 0, dghq_run_hrs: 0.0, dghq_fuel_consumed: 0 },
  { date: "Jul 05", run_hrs: 0.0, fuel_consumed: 0, dg1_run_hrs: 0.0, dg1_fuel_consumed: 0, dg2_run_hrs: 0.0, dg2_fuel_consumed: 0, dg3_run_hrs: 0.0, dg3_fuel_consumed: 0, dg4_run_hrs: 0.0, dg4_fuel_consumed: 0, dghq_run_hrs: 0.0, dghq_fuel_consumed: 0 },
  { date: "Jul 06", run_hrs: 3.6, fuel_consumed: 540, dg1_run_hrs: 3.6, dg1_fuel_consumed: 540, dg2_run_hrs: 1.8, dg2_fuel_consumed: 270, dg3_run_hrs: 2.4, dg3_fuel_consumed: 360, dg4_run_hrs: 1.5, dg4_fuel_consumed: 225, dghq_run_hrs: 0.5, dghq_fuel_consumed: 75 },
  { date: "Jul 07", run_hrs: 6.8, fuel_consumed: 1020, dg1_run_hrs: 6.8, dg1_fuel_consumed: 1020, dg2_run_hrs: 4.1, dg2_fuel_consumed: 615, dg3_run_hrs: 5.0, dg3_fuel_consumed: 750, dg4_run_hrs: 3.2, dg4_fuel_consumed: 480, dghq_run_hrs: 2.0, dghq_fuel_consumed: 300 },
  { date: "Jul 08", run_hrs: 4.0, fuel_consumed: 600, dg1_run_hrs: 4.0, dg1_fuel_consumed: 600, dg2_run_hrs: 2.2, dg2_fuel_consumed: 330, dg3_run_hrs: 3.0, dg3_fuel_consumed: 450, dg4_run_hrs: 1.9, dg4_fuel_consumed: 285, dghq_run_hrs: 1.0, dghq_fuel_consumed: 150 },
  { date: "Jul 09", run_hrs: 2.5, fuel_consumed: 375, dg1_run_hrs: 2.5, dg1_fuel_consumed: 375, dg2_run_hrs: 1.2, dg2_fuel_consumed: 180, dg3_run_hrs: 2.0, dg3_fuel_consumed: 300, dg4_run_hrs: 1.0, dg4_fuel_consumed: 150, dghq_run_hrs: 0.5, dghq_fuel_consumed: 75 }
];

const defaultEngineHealth: EngineHealthPoint[] = [
  { name: "DG-1", oil_pressure: 4.8, water_temp: 82, batt_voltage: 27.2, status: "OK" },
  { name: "DG-2", oil_pressure: 4.5, water_temp: 84, batt_voltage: 26.8, status: "OK" },
  { name: "DG-3", oil_pressure: 4.9, water_temp: 81, batt_voltage: 27.0, status: "OK" },
  { name: "DG-4", oil_pressure: 4.6, water_temp: 83, batt_voltage: 27.1, status: "OK" },
  { name: "DG-HQ", oil_pressure: 4.7, water_temp: 85, batt_voltage: 26.9, status: "OK" },
  { name: "DG-2 Warning", oil_pressure: 3.2, water_temp: 96, batt_voltage: 24.5, status: "WARNING" },
  { name: "DG-4 Critical", oil_pressure: 1.8, water_temp: 104, batt_voltage: 23.2, status: "CRITICAL" }
];

const defaultUpsTimeData: UpsDataPoint[] = [
  { time: "08:00", ups1_load: 34.2, ups2_load: 38.5 },
  { time: "09:00", ups1_load: 36.1, ups2_load: 40.2 },
  { time: "10:00", ups1_load: 38.5, ups2_load: 42.1 },
  { time: "11:00", ups1_load: 37.8, ups2_load: 41.5 },
  { time: "12:00", ups1_load: 35.0, ups2_load: 39.8 },
  { time: "13:00", ups1_load: 39.2, ups2_load: 43.0 },
  { time: "14:00", ups1_load: 40.5, ups2_load: 44.2 },
  { time: "15:00", ups1_load: 38.9, ups2_load: 42.8 }
];

const defaultPhaseDistribution: PhaseDistributionPoint[] = [
  { name: "UPS 1", Phase_A: 152, Phase_B: 148, Phase_C: 150 },
  { name: "UPS 2", Phase_A: 168, Phase_B: 162, Phase_C: 165 }
];

const defaultThermalTimeData: ThermalDataPoint[] = [
  { time: "08:00", server_ambient_temp: 21.2, return_temp_actual: 22.5, supply_temp_set: 19.0 },
  { time: "09:00", server_ambient_temp: 21.5, return_temp_actual: 22.8, supply_temp_set: 19.0 },
  { time: "10:00", server_ambient_temp: 22.1, return_temp_actual: 23.2, supply_temp_set: 19.0 },
  { time: "11:00", server_ambient_temp: 22.4, return_temp_actual: 23.5, supply_temp_set: 19.0 },
  { time: "12:00", server_ambient_temp: 21.9, return_temp_actual: 23.0, supply_temp_set: 19.0 },
  { time: "13:00", server_ambient_temp: 21.5, return_temp_actual: 22.7, supply_temp_set: 19.0 },
  { time: "14:00", server_ambient_temp: 21.1, return_temp_actual: 22.4, supply_temp_set: 19.0 },
  { time: "15:00", server_ambient_temp: 20.8, return_temp_actual: 22.0, supply_temp_set: 19.0 }
];

const defaultZoneData: ZoneDataPoint[] = [
  { name: "Server Room", temp: 21.2, humidity: 48, status: "Optimal" },
  { name: "IT Room 1", temp: 22.5, humidity: 52, status: "Optimal" },
  { name: "IT Room 2", temp: 23.1, humidity: 50, status: "Optimal" },
  { name: "Power Room 1", temp: 24.8, humidity: 42, status: "Moderate" },
  { name: "Power Room 2", temp: 24.2, humidity: 44, status: "Moderate" },
  { name: "HQ Power Room", temp: 25.1, humidity: 41, status: "Warm" }
];

const defaultIncidentBubbles: IncidentBubblePoint[] = [
  { dayIndex: 1, yValue: 2, severity: 200, name: "Zesco Grid Failure", status: "Resolved", date: "Jul 01" },
  { dayIndex: 2, yValue: 3, severity: 50, name: "PAC-3 High Temp", status: "Resolved", date: "Jul 02" },
  { dayIndex: 4, yValue: 1, severity: 100, name: "UPS-2 Fault Alarm", status: "Resolved", date: "Jul 04" },
  { dayIndex: 6, yValue: 4, severity: 500, name: "Gen 3 Day Tank Leak", status: "Resolved", date: "Jul 06" },
  { dayIndex: 7, yValue: 2, severity: 80, name: "PAC-1 Squealing Belt", status: "Open", date: "Jul 07" },
  { dayIndex: 8, yValue: 5, severity: 150, name: "Rectifier 1 Fan Failure", status: "Open", date: "Jul 08" },
  { dayIndex: 9, yValue: 3, severity: 100, name: "Server Temp High", status: "Resolved", date: "Jul 09" }
];

const defaultTickets: TicketPoint[] = [
  { id: "TKT-1024", name: "Gen 3 Day Tank Leak", tech: "Erick", severity: "Critical", status: "Resolved", date: "Jul 06", desc: "Day tank fuel return hose clamp was loose, causing minor leakage into the containment basin. Clamp tightened.", resolution: "Hose clamp tightened, containment basin drained." },
  { id: "TKT-1025", name: "Rectifier 1 Fan Failure", tech: "David", severity: "Medium", status: "Open", date: "Jul 08", desc: "Fan unit 2 on Rectifier cabinet 1 has seized.", resolution: "Replacement fan ordered from stock, pending arrival." },
  { id: "TKT-1026", name: "PAC-1 Squealing Belt", tech: "Emma", severity: "Low", status: "Open", date: "Jul 07", desc: "Technician noted squealing from PAC unit 1 belt during walk-around.", resolution: "Belt adjusted. Added to next maintenance cycle." },
  { id: "TKT-1023", name: "Zesco Grid Failure", tech: "Emma", severity: "High", status: "Resolved", date: "Jul 01", desc: "Commercial utility feed lost. Generator 1 and 2 auto-started and assumed load.", resolution: "Auto-failover successful. No load lost." }
];

export function useDashboardData() {
  const { currentSite } = useCurrentSite();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUsingMockData, setIsUsingMockData] = useState<boolean>(true);
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
    grid: { uptimePercentage: "77.8", totalBlackoutDuration: "2.0", peakSiteLoad: "95.8" },
    fuel: { totalRunHours: 30.4, totalFuelConsumed: 4560, avgBurnRate: 150, currentFuelBalance: 24350 },
    ups: { maxCapacityPct: 74.5, avgBatteryCharge: 100, rectifierVoltage: 54.2 },
    thermal: { peakTemp: "22.4", avgHumidity: 48.2, abnormalitiesCount: 0 },
    incidents: { totalIncidents: 14, openTickets: 2, mttr: "2.4" }
  });

  const fetchCountRef = useRef(0);

  useEffect(() => {
    async function fetchData() {
      const fetchId = ++fetchCountRef.current;
      setIsLoading(true);
      try {
        // Fetch Telemetry Logs (scoped to site)
        const siteId = currentSite?.id;
        const telQuery = supabase
          .from('telemetry_logs')
          .select('*')
          .order('target_hour', { ascending: false })
          .limit(50);
        if (siteId) telQuery.eq('site_uuid', siteId);
        const { data: telLogs, error: telError } = await telQuery;

        // Fetch Incidents (scoped to site)
        const incQuery = supabase
          .from('incidents')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(30);
        if (siteId) incQuery.eq('site_uuid', siteId);
        const { data: incData, error: incError } = await incQuery;

        if (telError) throw telError;
        if (incError) throw incError;
        if (fetchId !== fetchCountRef.current) return;

        // Process Telemetry Logs if present
        if (telLogs && telLogs.length > 0) {
          setIsUsingMockData(false);

          // Chronologically ascending for charts
          const sortedLogs = [...telLogs].reverse();

          // 1. Grid Mapping
          const mappedGrid = sortedLogs.map(row => {
            const m = (row.metrics || {}) as Record<string, any>;
            const time = new Date(row.target_hour).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            return {
              time,
              grid_voltage_r: parseFloat(m.grid_voltage_r ?? m.grid_voltage_rs ?? m.ups_1_output_voltage_a ?? 230),
              grid_voltage_y: parseFloat(m.grid_voltage_y ?? m.grid_voltage_st ?? m.ups_2_output_voltage_a ?? 228),
              grid_voltage_b: parseFloat(m.grid_voltage_b ?? m.grid_voltage_tr ?? 229),
              grid_total_site_load: parseFloat(m.grid_total_site_load ?? m.total_active_power_kw ?? 85.0),
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
          
          const maxLoadVal = Math.max(...telLogs.map(row => {
            const m = (row.metrics || {}) as Record<string, any>;
            return parseFloat(m.grid_total_site_load ?? m.total_active_power_kw ?? 0);
          }));
          const peakLoad = (isNaN(maxLoadVal) || maxLoadVal === -Infinity || maxLoadVal === Infinity) ? "0.0" : maxLoadVal.toFixed(1);

          // 2. Fuel Mapping
          const mappedFuel = sortedLogs.map(row => {
            const m = (row.metrics || {}) as Record<string, any>;
            const date = new Date(row.target_hour).toLocaleDateString([], { month: 'short', day: '2-digit' });
            const result: any = { date };

            // Map each generator prefix dynamically
            const generatorIds = ['1', '2', '3', '4', 'hq'];
            generatorIds.forEach(id => {
              const prefix = `dg_${id}`;
              const start = parseFloat(m[`${prefix}_hr_meter_start`] ?? 0);
              const stop = parseFloat(m[`${prefix}_hr_meter_stop`] ?? 0);
              let run_hrs = Math.max(0, stop - start);
              if (!run_hrs) run_hrs = parseFloat(m[`${prefix}_run_hrs`] ?? (id === 'hq' ? 1.5 : 2.5));
              const fuel_consumed = parseFloat(m[`${prefix}_calculated_fuel_burn`] ?? String(run_hrs * 150));

              const keyName = id === 'hq' ? 'dghq' : `dg${id}`;
              result[`${keyName}_run_hrs`] = run_hrs;
              result[`${keyName}_fuel_consumed`] = fuel_consumed;
            });

            // Keep default run_hrs / fuel_consumed as fallback
            result.run_hrs = result.dg1_run_hrs;
            result.fuel_consumed = result.dg1_fuel_consumed;

            return result;
          });
          setFuelChartData(mappedFuel);

          // Fuel KPIs
          let sumRunHours = 0;
          let sumFuelConsumed = 0;
          telLogs.forEach(row => {
            const m = (row.metrics || {}) as Record<string, any>;
            const start = parseFloat(m.dg_1_hr_meter_start ?? 0);
            const stop = parseFloat(m.dg_1_hr_meter_stop ?? 0);
            let run_hrs = Math.max(0, stop - start);
            if (!run_hrs) run_hrs = parseFloat(m.dg_1_run_hrs ?? m.dg_hq_run_hrs ?? 0);

            sumRunHours += run_hrs;
            sumFuelConsumed += parseFloat(m.dg_1_calculated_fuel_burn ?? String(run_hrs * 150));
          });

          // Engine Health Scatter Mapping - read dynamic prefixes from the latest log
          const latestLogObj = telLogs[0];
          const latestM = (latestLogObj.metrics || {}) as Record<string, any>;
          const generatorIds = ['1', '2', '3', '4', 'hq'];
          const mappedHealth = generatorIds.map(id => {
            const name = id === 'hq' ? 'DG-HQ' : `DG-${id}`;
            const prefix = `dg_${id}`;
            const oil_pressure = parseFloat(latestM[`${prefix}_oil_pressure`] ?? 4.5);
            const water_temp = parseFloat(latestM[`${prefix}_water_temp`] ?? 82);
            const batt_voltage = parseFloat(latestM[`${prefix}_batt_voltage`] ?? 26.8);

            let status = "OK";
            if (water_temp > 95 || oil_pressure < 2.5) status = "CRITICAL";
            else if (water_temp > 90 || oil_pressure < 3.5) status = "WARNING";

            return { name, oil_pressure, water_temp, batt_voltage, status };
          });
          setEngineHealthData(mappedHealth);

          // 3. UPS Mapping
          const mappedUps = sortedLogs.map(row => {
            const m = (row.metrics || {}) as Record<string, any>;
            const time = new Date(row.target_hour).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            return {
              time,
              ups1_load: parseFloat(m.ups_1_output_load_kw ?? m.total_active_power_kw ?? 35),
              ups2_load: parseFloat(m.ups_2_output_load_kw ?? 38)
            };
          });
          setUpsChartData(mappedUps);

          const latestMetrics = (telLogs[0].metrics || {}) as Record<string, any>;
          const ups1AmpsA = parseFloat(latestMetrics.ups_1_load_amps_a ?? 152);
          const ups1AmpsB = parseFloat(latestMetrics.ups_1_load_amps_b ?? 148);
          const ups1AmpsC = parseFloat(latestMetrics.ups_1_load_amps_c ?? 150);
          const ups2AmpsA = parseFloat(latestMetrics.ups_2_load_amps_a ?? 168);
          const ups2AmpsB = parseFloat(latestMetrics.ups_2_load_amps_b ?? 162);
          const ups2AmpsC = parseFloat(latestMetrics.ups_2_load_amps_c ?? 165);

          setPhaseDistributionData([
            { name: "UPS 1", Phase_A: ups1AmpsA, Phase_B: ups1AmpsB, Phase_C: ups1AmpsC },
            { name: "UPS 2", Phase_A: ups2AmpsA, Phase_B: ups2AmpsB, Phase_C: ups2AmpsC }
          ]);

          // UPS KPIs
          const maxCapacityPct = parseFloat(latestMetrics.ups_1_used_capacity ?? latestMetrics.ups_2_used_capacity ?? 74.5);
          const avgBatteryCharge = parseFloat(latestMetrics.ups_1_battery_charge_percent ?? latestMetrics.ups_2_battery_charge_percent ?? 100);
          const rectifierVoltage = parseFloat(latestMetrics.rectifier_1_dc_voltage ?? latestMetrics.rectifier_2_dc_voltage ?? 54.2);

          // 4. Thermal Mapping
          const mappedThermal = sortedLogs.map(row => {
            const m = (row.metrics || {}) as Record<string, any>;
            const time = new Date(row.target_hour).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            return {
              time,
              server_ambient_temp: parseFloat(m.server_ambient_temp ?? 21.5),
              return_temp_actual: parseFloat(m.pac_1_return_temp_actual ?? 22.8),
              supply_temp_set: parseFloat(m.pac_1_supply_temp_set ?? 19.0)
            };
          });
          setThermalChartData(mappedThermal);

          // Zones
          const mappedZones = [
            { name: "Server Room", temp: parseFloat(latestMetrics.server_ambient_temp ?? 21.2), humidity: parseFloat(latestMetrics.server_ambient_humidity ?? 48), status: "Optimal" },
            { name: "IT Room 1", temp: parseFloat(latestMetrics.it1_ambient_temp ?? 22.5), humidity: parseFloat(latestMetrics.it1_ambient_humidity ?? 52), status: "Optimal" },
            { name: "IT Room 2", temp: parseFloat(latestMetrics.it2_ambient_temp ?? 23.1), humidity: parseFloat(latestMetrics.it2_ambient_humidity ?? 50), status: "Optimal" },
            { name: "Power Room 1", temp: parseFloat(latestMetrics.pr1_ambient_temp ?? 24.8), humidity: parseFloat(latestMetrics.pr1_ambient_humidity ?? 42), status: "Moderate" },
            { name: "Power Room 2", temp: parseFloat(latestMetrics.pr2_ambient_temp ?? 24.2), humidity: parseFloat(latestMetrics.pr2_ambient_humidity ?? 44), status: "Moderate" },
            { name: "HQ Power Room", temp: parseFloat(latestMetrics.hq_ambient_temp ?? 25.1), humidity: parseFloat(latestMetrics.hq_ambient_humidity ?? 41), status: "Warm" }
          ];
          setZoneData(mappedZones);

          // Thermal KPIs
          const maxTempVal = Math.max(...telLogs.map(row => {
            const m = (row.metrics || {}) as Record<string, any>;
            return parseFloat(m.server_ambient_temp ?? 0);
          }));
          const peakTemp = (isNaN(maxTempVal) || maxTempVal === -Infinity || maxTempVal === Infinity) ? "22.4" : maxTempVal.toFixed(1);
          const avgHumidity = parseFloat(latestMetrics.server_ambient_humidity ?? 48.2);

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
          let incidentBubblesData = defaultIncidentBubbles;
          let ticketsLedgerData = defaultTickets;
          let totalIncidents = 14;
          let openTickets = 2;
          let mttr = "2.4";

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

          const avgBurnRate = 150;

          // Update KPIs state
          setKpis({
            grid: {
              uptimePercentage: uptimePct !== "NaN" ? uptimePct : "100.0",
              totalBlackoutDuration: blackoutHours,
              peakSiteLoad: peakLoad
            },
            fuel: {
              totalRunHours: sumRunHours || 30.4,
              totalFuelConsumed: sumFuelConsumed || 4560,
              avgBurnRate: avgBurnRate,
              currentFuelBalance: parseFloat(latestMetrics.fuel_balance ?? 24350)
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

    const siteId = currentSite?.id;

    const channelLogs = supabase
      .channel(`analytics_telemetry_logs_realtime_${siteId ?? 'global'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'telemetry_logs',
          ...(siteId ? { filter: `site_uuid=eq.${siteId}` } : {})
        },
        () => {
          fetchData();
        }
      )
      .subscribe();

    const channelIncidents = supabase
      .channel(`analytics_incidents_realtime_${siteId ?? 'global'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'incidents',
          ...(siteId ? { filter: `site_uuid=eq.${siteId}` } : {})
        },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channelLogs);
      supabase.removeChannel(channelIncidents);
    };
  }, [currentSite?.id]);

  return {
    isLoading,
    isUsingMockData,
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
