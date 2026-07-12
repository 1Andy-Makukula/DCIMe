// ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
// DCIMe Engine ÔÇö Relational Asset Dictionary
// Single source of truth for the mobile app and Excel export engine.
// destinations: [] are intentionally stubbed and will be injected by the
// Excel mapping engine in a subsequent pass.
// ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

export type CheckFrequency = 'hourly' | '2-hour' | '4-hour' | 'daily';

export interface ExcelTarget {
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

// ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
// Shared metric blueprints ÔÇö avoids repeating the same 7-field PAC block
// for every unit. Each builder stamps in the asset-specific id prefix.
// ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

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

// ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
// MASTER ASSET DICTIONARY
// Sequence is strict: matches the physical walk-around order technicians use.
// ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ

export const MASTER_ASSET_DICTIONARY: AssetCategory[] = [

  // ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
  // CATEGORY 1 ÔÇö Server Room
  // ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
  {
    categoryName: 'Server Room',
    assets: [
      // Ambient conditions
      {
        id: 'room_server_ambient',
        name: 'Server Room Ambient',
        metrics: [
          { id: 'server_ambient_temp',     label: 'Temperature (┬░C)', type: 'number', frequency: 'hourly', destinations: [] },
          { id: 'server_ambient_humidity', label: 'Humidity (%)',      type: 'number', frequency: 'hourly', destinations: [] },
        ],
      },
      // Emerson Aircon units 1ÔÇô7
      { id: 'pac_server_em1', name: 'Emerson Aircon 1', metrics: buildPacMetrics('pac_server_em1') },
      { id: 'pac_server_em2', name: 'Emerson Aircon 2', metrics: buildPacMetrics('pac_server_em2') },
      { id: 'pac_server_em3', name: 'Emerson Aircon 3', metrics: buildPacMetrics('pac_server_em3') },
      { id: 'pac_server_em4', name: 'Emerson Aircon 4', metrics: buildPacMetrics('pac_server_em4') },
      { id: 'pac_server_em5', name: 'Emerson Aircon 5', metrics: buildPacMetrics('pac_server_em5') },
      { id: 'pac_server_em6', name: 'Emerson Aircon 6', metrics: buildPacMetrics('pac_server_em6') },
      { id: 'pac_server_em7', name: 'Emerson Aircon 7', metrics: buildPacMetrics('pac_server_em7') },
      // Vertiv units 1ÔÇô5
      { id: 'pac_server_vt1', name: 'Vertiv 1', metrics: buildPacMetrics('pac_server_vt1') },
      { id: 'pac_server_vt2', name: 'Vertiv 2', metrics: buildPacMetrics('pac_server_vt2') },
      { id: 'pac_server_vt3', name: 'Vertiv 3', metrics: buildPacMetrics('pac_server_vt3') },
      { id: 'pac_server_vt4', name: 'Vertiv 4', metrics: buildPacMetrics('pac_server_vt4') },
      { id: 'pac_server_vt5', name: 'Vertiv 5', metrics: buildPacMetrics('pac_server_vt5') },
      // Dragor
      { id: 'pac_server_dragor', name: 'Dragor', metrics: buildPacMetrics('pac_server_dragor') },
    ],
  },

  // ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
  // CATEGORY 2 ÔÇö Power Room 1
  // ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
  {
    categoryName: 'Power Room 1',
    assets: [
      // Ambient conditions
      {
        id: 'room_pr1_ambient',
        name: 'Power Room 1 Ambient',
        metrics: [
          { id: 'pr1_ambient_temp',     label: 'Temperature (┬░C)', type: 'number', frequency: 'hourly', destinations: [] },
          { id: 'pr1_ambient_humidity', label: 'Humidity (%)',      type: 'text',   frequency: 'hourly', isConstant: true, defaultValue: 'NA', destinations: [] },
        ],
      },
      // UPS 1 ÔÇö output voltage default: 230V
      { id: 'ups_1', name: 'UPS 1', metrics: buildUpsMetrics('ups_1', 230) },
      // Rectifier 1
      { id: 'rectifier_1', name: 'Rectifier 1', metrics: buildRectifierMetrics('rectifier_1') },
      // Emerson Aircon units 1ÔÇô3
      { id: 'pac_pr1_em1', name: 'Emerson Aircon 1', metrics: buildPacMetrics('pac_pr1_em1') },
      { id: 'pac_pr1_em2', name: 'Emerson Aircon 2', metrics: buildPacMetrics('pac_pr1_em2') },
      { id: 'pac_pr1_em3', name: 'Emerson Aircon 3', metrics: buildPacMetrics('pac_pr1_em3') },
    ],
  },

  // ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
  // CATEGORY 3 ÔÇö Power Room 2
  // ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
  {
    categoryName: 'Power Room 2',
    assets: [
      // Ambient conditions
      {
        id: 'room_pr2_ambient',
        name: 'Power Room 2 Ambient',
        metrics: [
          { id: 'pr2_ambient_temp',     label: 'Temperature (┬░C)', type: 'number', frequency: 'hourly', destinations: [] },
          { id: 'pr2_ambient_humidity', label: 'Humidity (%)',      type: 'text',   frequency: 'hourly', isConstant: true, defaultValue: 'NA', destinations: [] },
        ],
      },
      // UPS 2 ÔÇö output voltage default: 231V
      { id: 'ups_2', name: 'UPS 2', metrics: buildUpsMetrics('ups_2', 231) },
      // Rectifier 2
      { id: 'rectifier_2', name: 'Rectifier 2', metrics: buildRectifierMetrics('rectifier_2') },
      // Emerson Aircon units 1ÔÇô2
      { id: 'pac_pr2_em1', name: 'Emerson Aircon 1', metrics: buildPacMetrics('pac_pr2_em1') },
      { id: 'pac_pr2_em2', name: 'Emerson Aircon 2', metrics: buildPacMetrics('pac_pr2_em2') },
    ],
  },

  // ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
  // CATEGORY 4 ÔÇö Outside / Main Grid
  // ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
  {
    categoryName: 'Outside / Main Grid',
    assets: [
      // ZESCO commercial grid
      {
        id: 'grid_main',
        name: 'ZESCO Grid',
        metrics: [
          { id: 'grid_voltage_r',     label: 'Voltage (R)',        type: 'number', frequency: 'hourly', destinations: [] },
          { id: 'grid_amps_r',        label: 'Amps (R)',           type: 'number', frequency: 'hourly', destinations: [] },
          { id: 'grid_frequency',     label: 'Frequency (Hz)',     type: 'number', frequency: 'hourly', destinations: [] },
          { id: 'grid_status',        label: 'Status',             type: 'text',   frequency: 'hourly', isConstant: true, defaultValue: 'ON', destinations: [] },
          { id: 'grid_total_site_load',label: 'Total Site Load (kW)', type: 'number', frequency: 'hourly', destinations: [] },
        ],
      },
      // Generators 1ÔÇô4
      { id: 'dg_1', name: 'Generator 1', metrics: buildDgMetrics('dg_1') },
      { id: 'dg_2', name: 'Generator 2', metrics: buildDgMetrics('dg_2') },
      { id: 'dg_3', name: 'Generator 3', metrics: buildDgMetrics('dg_3') },
      { id: 'dg_4', name: 'Generator 4', metrics: buildDgMetrics('dg_4') },
    ],
  },

  // ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
  // CATEGORY 5 ÔÇö HQ Zone
  // ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
  {
    categoryName: 'HQ Zone',
    assets: [
      // Ambient conditions
      {
        id: 'hq_ambient',
        name: 'HQ Power Room Ambient',
        metrics: [
          { id: 'hq_ambient_temp',     label: 'Temperature (┬░C)', type: 'number', frequency: '4-hour', destinations: [] },
          { id: 'hq_ambient_humidity', label: 'Humidity (%)',      type: 'text',   frequency: '4-hour', isConstant: true, defaultValue: 'NA', destinations: [] },
        ],
      },
      // Generator HQ
      { id: 'dg_hq', name: 'Generator HQ', metrics: buildDgMetrics('dg_hq') },
    ],
  },

  // ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
  // CATEGORY 6 ÔÇö IT Room 2
  // ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
  {
    categoryName: 'IT Room 2',
    assets: [
      // Ambient conditions
      {
        id: 'room_it2_ambient',
        name: 'IT Room 2 Ambient',
        metrics: [
          { id: 'it2_ambient_temp',     label: 'Temperature (┬░C)', type: 'number', frequency: '4-hour', destinations: [] },
          { id: 'it2_ambient_humidity', label: 'Humidity (%)',      type: 'text',   frequency: '4-hour', isConstant: true, defaultValue: 'NA', destinations: [] },
        ],
      },
      // Emerson Aircon units 1ÔÇô2
      { id: 'pac_it2_em1', name: 'Emerson Aircon 1', metrics: buildPacMetrics('pac_it2_em1') },
      { id: 'pac_it2_em2', name: 'Emerson Aircon 2', metrics: buildPacMetrics('pac_it2_em2') },
    ],
  },

  // ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
  // CATEGORY 7 ÔÇö IT Room 1
  // ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
  {
    categoryName: 'IT Room 1',
    assets: [
      // Ambient conditions
      {
        id: 'room_it1_ambient',
        name: 'IT Room 1 Ambient',
        metrics: [
          { id: 'it1_ambient_temp',     label: 'Temperature (┬░C)', type: 'number', frequency: '4-hour', destinations: [] },
          { id: 'it1_ambient_humidity', label: 'Humidity (%)',      type: 'text',   frequency: '4-hour', isConstant: true, defaultValue: 'NA', destinations: [] },
        ],
      },
      // Emerson Aircon units 1ÔÇô2
      { id: 'pac_it1_em1', name: 'Emerson Aircon 1', metrics: buildPacMetrics('pac_it1_em1') },
      { id: 'pac_it1_em2', name: 'Emerson Aircon 2', metrics: buildPacMetrics('pac_it1_em2') },
    ],
  },
];

// ÔöÇÔöÇ BACKWARDS COMPATIBILITY LAYER ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
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
