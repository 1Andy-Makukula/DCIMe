// ─────────────────────────────────────────────────────────────────────────────
// DCIMe Engine — Relational Asset Dictionary
// Single source of truth for the mobile app and Excel export engine.
// ─────────────────────────────────────────────────────────────────────────────

export type CheckFrequency = 'hourly' | '2-hour' | '4-hour' | 'daily';
export type TargetWorkbook = 'daily_canvas' | 'commercial_logbook';

export interface ExcelTarget {
  workbook: TargetWorkbook;
  sheetName: string;
  excelColumnIndex: number; // 0-based column index
}

export interface AssetMetric {
  id: string;
  label: string;
  type: 'number' | 'text' | 'boolean';
  frequency: CheckFrequency; 
  isConstant?: boolean;      
  defaultValue?: string | number; 
  carryForward?: boolean;    
  destinations: ExcelTarget[];
}

export interface Asset {
  id: string;
  name: string;
  metrics: AssetMetric[];
}

export interface AssetCategory {
  categoryName: string;
  assets: Asset[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared metric blueprints — avoids repeating the same fields
// ─────────────────────────────────────────────────────────────────────────────

function buildPacMetrics(prefix: string): AssetMetric[] {
  return [
    { id: `${prefix}_return_temp_actual`, label: 'Return Temp (Actual)', type: 'number', frequency: '2-hour', destinations: [] },
    { id: `${prefix}_return_temp_set`,    label: 'Return Temp (Set)',    type: 'number', frequency: '2-hour', carryForward: true, destinations: [] },
    { id: `${prefix}_supply_temp_set`,    label: 'Supply Temp (Set)',    type: 'number', frequency: '2-hour', carryForward: true, destinations: [] },
    { id: `${prefix}_humidity_actual`,    label: 'Humidity (Actual)',    type: 'number', frequency: '2-hour', destinations: [] },
    { id: `${prefix}_humidity_set`,       label: 'Humidity (Set)',       type: 'number', frequency: '2-hour', carryForward: true, destinations: [] },
    { id: `${prefix}_voltage_ry`,         label: 'Voltage (R-Y)',        type: 'number', frequency: '2-hour', destinations: [] },
    { id: `${prefix}_current_r`,          label: 'Current (R)',          type: 'number', frequency: '2-hour', destinations: [] },
  ];
}

function buildUpsMetrics(prefix: string, outputVoltageDefault: number): AssetMetric[] {
  return [
    { id: `${prefix}_output_load_kw`,        label: 'Output Load (kW)',      type: 'number', frequency: 'hourly', destinations: [] },
    { id: `${prefix}_used_capacity`,          label: 'Used Capacity (%)',     type: 'number', frequency: 'hourly', destinations: [] },
    { id: `${prefix}_battery_charge_percent`, label: 'Battery Charge (%)',    type: 'number', frequency: 'hourly', isConstant: true, defaultValue: 100, destinations: [] },
    { id: `${prefix}_battery_voltage`,        label: 'Battery Voltage (V)',   type: 'number', frequency: 'hourly', destinations: [] },
    { id: `${prefix}_load_amps_a`,            label: 'Load Amps (A)',         type: 'number', frequency: 'hourly', destinations: [] },
    { id: `${prefix}_output_voltage_a`,       label: 'Output Voltage (A)',    type: 'number', frequency: 'hourly', isConstant: true, defaultValue: outputVoltageDefault, destinations: [] },
  ];
}

function buildRectifierMetrics(prefix: string): AssetMetric[] {
  return [
    { id: `${prefix}_dc_voltage`,      label: 'DC Voltage (V)',          type: 'number', frequency: 'hourly', isConstant: true, defaultValue: 54.2, destinations: [] },
    { id: `${prefix}_amps`,            label: 'Amps (A)',                 type: 'number', frequency: 'hourly', destinations: [] },
    { id: `${prefix}_battery_status`,  label: 'Battery Status',          type: 'text',   frequency: 'hourly', isConstant: true, defaultValue: 'OK', destinations: [] },
    { id: `${prefix}_used_percentage`, label: 'Used Percentage (%)',     type: 'number', frequency: 'hourly', destinations: [] },
  ];
}

function buildDgMetrics(prefix: string): AssetMetric[] {
  return [
    { id: `${prefix}_run_hrs`,       label: 'Run Hours',       type: 'number', frequency: 'hourly', carryForward: true, destinations: [] },
    { id: `${prefix}_batt_voltage`,  label: 'Battery Voltage', type: 'number', frequency: 'hourly', isConstant: true, defaultValue: 26.7, destinations: [] },
    { id: `${prefix}_charged_status`,label: 'Charged Status',  type: 'text',   frequency: 'hourly', isConstant: true, defaultValue: 'GREEN', destinations: [] },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// MASTER ASSET DICTIONARY
// Sequence is strict: matches the physical walk-around order technicians use.
// ─────────────────────────────────────────────────────────────────────────────

export const MASTER_ASSET_DICTIONARY: AssetCategory[] = [
  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY 1 — The Server Room
  // ══════════════════════════════════════════════════════════════════════════
  {
    categoryName: 'The Server Room',
    assets: [
      {
        id: 'room_server_ambient',
        name: 'Server Room Ambient',
        metrics: [
          { id: 'server_ambient_temp',     label: 'Temperature (°C)', type: 'number', frequency: 'hourly', destinations: [] },
          { id: 'server_ambient_humidity', label: 'Humidity (%)',      type: 'number', frequency: 'hourly', destinations: [] },
        ],
      },
      { id: 'pac_server_em1', name: 'Emerson Aircon 1', metrics: buildPacMetrics('pac_server_em1') },
      { id: 'pac_server_em2', name: 'Emerson Aircon 2', metrics: buildPacMetrics('pac_server_em2') },
      { id: 'pac_server_em3', name: 'Emerson Aircon 3', metrics: buildPacMetrics('pac_server_em3') },
      { id: 'pac_server_em4', name: 'Emerson Aircon 4', metrics: buildPacMetrics('pac_server_em4') },
      { id: 'pac_server_em5', name: 'Emerson Aircon 5', metrics: buildPacMetrics('pac_server_em5') },
      { id: 'pac_server_em6', name: 'Emerson Aircon 6', metrics: buildPacMetrics('pac_server_em6') },
      { id: 'pac_server_em7', name: 'Emerson Aircon 7', metrics: buildPacMetrics('pac_server_em7') },
      { id: 'pac_server_vt1', name: 'Vertiv 1', metrics: buildPacMetrics('pac_server_vt1') },
      { id: 'pac_server_vt2', name: 'Vertiv 2', metrics: buildPacMetrics('pac_server_vt2') },
      { id: 'pac_server_vt3', name: 'Vertiv 3', metrics: buildPacMetrics('pac_server_vt3') },
      { id: 'pac_server_vt4', name: 'Vertiv 4', metrics: buildPacMetrics('pac_server_vt4') },
      { id: 'pac_server_vt5', name: 'Vertiv 5', metrics: buildPacMetrics('pac_server_vt5') },
      { id: 'pac_server_dragor', name: 'Dragor', metrics: buildPacMetrics('pac_server_dragor') },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY 2 — Power Room 1
  // ══════════════════════════════════════════════════════════════════════════
  {
    categoryName: 'Power Room 1',
    assets: [
      {
        id: 'room_pr1_ambient',
        name: 'Power Room 1 Ambient',
        metrics: [
          { id: 'pr1_ambient_temp',     label: 'Temperature (°C)', type: 'number', frequency: 'hourly', destinations: [] },
          { id: 'pr1_ambient_humidity', label: 'Humidity (%)',      type: 'text',   frequency: 'hourly', isConstant: true, defaultValue: 'NA', destinations: [] },
        ],
      },
      { id: 'ups_1', name: 'UPS 1', metrics: buildUpsMetrics('ups_1', 230) },
      { id: 'rectifier_1', name: 'Rectifier 1', metrics: buildRectifierMetrics('rectifier_1') },
      { id: 'pac_pr1_em1', name: 'Emerson Aircon 1', metrics: buildPacMetrics('pac_pr1_em1') },
      { id: 'pac_pr1_em2', name: 'Emerson Aircon 2', metrics: buildPacMetrics('pac_pr1_em2') },
      { id: 'pac_pr1_em3', name: 'Emerson Aircon 3', metrics: buildPacMetrics('pac_pr1_em3') },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY 3 — Power Room 2
  // ══════════════════════════════════════════════════════════════════════════
  {
    categoryName: 'Power Room 2',
    assets: [
      {
        id: 'room_pr2_ambient',
        name: 'Power Room 2 Ambient',
        metrics: [
          { id: 'pr2_ambient_temp',     label: 'Temperature (°C)', type: 'number', frequency: 'hourly', destinations: [] },
          { id: 'pr2_ambient_humidity', label: 'Humidity (%)',      type: 'text',   frequency: 'hourly', isConstant: true, defaultValue: 'NA', destinations: [] },
        ],
      },
      { id: 'ups_2', name: 'UPS 2', metrics: buildUpsMetrics('ups_2', 231) },
      { id: 'rectifier_2', name: 'Rectifier 2', metrics: buildRectifierMetrics('rectifier_2') },
      { id: 'pac_pr2_em1', name: 'Emerson Aircon 1', metrics: buildPacMetrics('pac_pr2_em1') },
      { id: 'pac_pr2_em2', name: 'Emerson Aircon 2', metrics: buildPacMetrics('pac_pr2_em2') },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY 4 — Outside / Main Grid
  // ══════════════════════════════════════════════════════════════════════════
  {
    categoryName: 'Outside / Main Grid',
    assets: [
      {
        id: 'grid_main',
        name: 'ZESCO Grid',
        metrics: [
          { id: 'grid_voltage_r',      label: 'Voltage (R)',        type: 'number', frequency: 'hourly', destinations: [] },
          { id: 'grid_amps_r',         label: 'Amps (R)',           type: 'number', frequency: 'hourly', destinations: [] },
          { id: 'grid_frequency',      label: 'Frequency (Hz)',     type: 'number', frequency: 'hourly', destinations: [] },
          { id: 'grid_status',         label: 'Status',             type: 'text',   frequency: 'hourly', isConstant: true, defaultValue: 'ON', destinations: [] },
          { id: 'grid_total_site_load', label: 'Total Site Load (kW)', type: 'number', frequency: 'hourly', destinations: [] },
          { id: 'grid_off_time',       label: 'Off Time',           type: 'text',   frequency: 'hourly', isConstant: true, defaultValue: '0:00', destinations: [] },
          { id: 'grid_restored_time',  label: 'Restored Time',      type: 'text',   frequency: 'hourly', isConstant: true, defaultValue: '0:00', destinations: [] },
        ],
      },
      {
        id: 'fm200_panel',
        name: 'FM 200 Panel',
        metrics: [
          { id: 'fm200_status',        label: 'Status',             type: 'text',   frequency: 'hourly', isConstant: true, defaultValue: 'OK', destinations: [] },
        ],
      },
      { id: 'dg_1', name: 'Generator 1 (Built Room)', metrics: buildDgMetrics('dg_1') },
      { id: 'dg_2', name: 'Generator 2 (Built Room)', metrics: buildDgMetrics('dg_2') },
      { id: 'dg_3', name: 'Generator 3 (Container)',  metrics: buildDgMetrics('dg_3') },
      { id: 'dg_4', name: 'Generator 4 (Container)',  metrics: buildDgMetrics('dg_4') },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY 5 — HQ Zone
  // ══════════════════════════════════════════════════════════════════════════
  {
    categoryName: 'HQ Zone',
    assets: [
      {
        id: 'hq_ambient',
        name: 'HQ Power Room Ambient',
        metrics: [
          { id: 'hq_ambient_temp',     label: 'Temperature (°C)', type: 'number', frequency: '4-hour', destinations: [] },
          { id: 'hq_ambient_humidity', label: 'Humidity (%)',      type: 'text',   frequency: '4-hour', isConstant: true, defaultValue: 'NA', destinations: [] },
        ],
      },
      { id: 'dg_hq', name: 'Generator HQ (Container)', metrics: buildDgMetrics('dg_hq') },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY 6 — IT Room 2
  // ══════════════════════════════════════════════════════════════════════════
  {
    categoryName: 'IT Room 2',
    assets: [
      {
        id: 'room_it2_ambient',
        name: 'IT Room 2 Ambient',
        metrics: [
          { id: 'it2_ambient_temp',     label: 'Temperature (°C)', type: 'number', frequency: '4-hour', destinations: [] },
          { id: 'it2_ambient_humidity', label: 'Humidity (%)',      type: 'text',   frequency: '4-hour', isConstant: true, defaultValue: 'NA', destinations: [] },
        ],
      },
      { id: 'pac_it2_em1', name: 'Emerson Aircon 1', metrics: buildPacMetrics('pac_it2_em1') },
      { id: 'pac_it2_em2', name: 'Emerson Aircon 2', metrics: buildPacMetrics('pac_it2_em2') },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY 7 — IT Room 1
  // ══════════════════════════════════════════════════════════════════════════
  {
    categoryName: 'IT Room 1',
    assets: [
      {
        id: 'room_it1_ambient',
        name: 'IT Room 1 Ambient',
        metrics: [
          { id: 'it1_ambient_temp',     label: 'Temperature (°C)', type: 'number', frequency: '4-hour', destinations: [] },
          { id: 'it1_ambient_humidity', label: 'Humidity (%)',      type: 'text',   frequency: '4-hour', isConstant: true, defaultValue: 'NA', destinations: [] },
        ],
      },
      { id: 'pac_it1_em1', name: 'Emerson Aircon 1', metrics: buildPacMetrics('pac_it1_em1') },
      { id: 'pac_it1_em2', name: 'Emerson Aircon 2', metrics: buildPacMetrics('pac_it1_em2') },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY 8 — Fuel Logistics
  // ══════════════════════════════════════════════════════════════════════════
  {
    categoryName: 'Fuel Logistics',
    assets: [
      {
        id: 'site_fuel_record',
        name: 'Site Fuel Record',
        metrics: [
          { id: 'fuel_brought_forward', label: 'Fuel Brought Forward (L)', type: 'number', frequency: 'daily', carryForward: true, destinations: [] },
          { id: 'fuel_received',        label: 'Fuel Received (L)',        type: 'number', frequency: 'daily', defaultValue: 0, destinations: [] },
          { id: 'fuel_consumed',        label: 'Fuel Consumed (L)',        type: 'number', frequency: 'daily', defaultValue: 0, destinations: [] },
          { id: 'fuel_balance',         label: 'Fuel Balance (L)',         type: 'number', frequency: 'daily', carryForward: true, destinations: [] },
          { id: 'leakage_sign',         label: 'Leakage Sign',             type: 'text',   frequency: 'daily', isConstant: true, defaultValue: 'NO', destinations: [] },
        ],
      },
    ],
  },
];

// ── BACKWARDS COMPATIBILITY LAYER ─────────────────────────────────────────────
// Reconstructs the flat HOURLY_TELEMETRY_SCHEMA and TelemetryField objects so
// layout builders, form managers, and export engines continue to compile clean.
export interface TelemetryField {
  id: string;
  label: string;
  category: string;
  subgroup?: string;
  unit?: string;
  type: "number" | "text";
  excelColumnIndex: number;
}

export const HOURLY_TELEMETRY_SCHEMA: TelemetryField[] = (() => {
  const fields: TelemetryField[] = [];
  MASTER_ASSET_DICTIONARY.forEach((cat) => {
    cat.assets.forEach((asset) => {
      asset.metrics.forEach((metric) => {
        const primaryDest = metric.destinations[0];
        fields.push({
          id: metric.id,
          label: `${asset.name} - ${metric.label}`,
          category: cat.categoryName,
          subgroup: asset.name,
          unit: undefined,
          type: metric.type === "boolean" ? "text" : metric.type,
          excelColumnIndex: primaryDest ? primaryDest.excelColumnIndex : -1
        });
      });
    });
  });
  return fields;
})();
